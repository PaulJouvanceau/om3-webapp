import React, {useCallback, useEffect, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {Dialog} from "../ui/components/Dialog";
import {Button, IconButton} from "../ui/components/Button";
import {Field, Input, Select} from "../ui/components/Field";
import {Table, HeaderRow, HeaderCell, Row, Cell} from "../ui/components/Table";
import {Alert} from "../ui/components/Alert";
import {Spinner} from "../ui/components/Spinner";
import {EyeIcon, EyeOffIcon} from "../ui/icons";
import {formatSeconds, useAutoHide} from "../ui/lib/reveal";
import {getResponseErrorMessage} from "../services/api.jsx";
import {SECRET_MASK, evalQuery, evaluatedText, keywordPatterns, maskedKeywords} from "../app/config-eval";

const authHeaders = () => ({Authorization: `Bearer ${localStorage.getItem("authToken") || ""}`});

/**
 * A configuration evaluated (app/config-eval), as om config eval and config get
 * --eval --impersonate show it: each keyword, its value as written, and what it
 * evaluates to on the node picked, the one answering when none. `configUrl` is the
 * address of the configuration (".../config"), its file at ".../config/file";
 * `nodes`, the nodes it may be evaluated as, null for a configuration of one node
 * only, evaluated there. The keywords asked by patterns, the ones set when none;
 * the secrets the redacted file masks masked until shown, again after a while.
 */
export default function ConfigEvalDialog({open, onClose, configUrl, subject, nodes = []}) {
    const {t} = useTranslation();
    const [node, setNode] = useState("");
    const [patterns, setPatterns] = useState("");
    const [items, setItems] = useState(null);
    const [masked, setMasked] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showSecrets, setShowSecrets] = useState(false);
    const secondsLeft = useAutoHide(showSecrets, () => setShowSecrets(false));
    // The last evaluation asked: an answer overtaken by another is dropped.
    const asked = useRef(0);

    const evaluate = useCallback(async (as, typed) => {
        const request = ++asked.current;
        setLoading(true);
        setError(null);
        try {
            const [response, redacted] = await Promise.all([
                fetch(`${configUrl}?${evalQuery(as, keywordPatterns(typed))}`, {headers: authHeaders(), cache: "no-cache"}),
                fetch(`${configUrl}/file?redact-secrets=true`, {headers: authHeaders(), cache: "no-cache"}),
            ]);
            if (request !== asked.current) return;
            if (!response.ok) {
                setItems(null);
                setError((await getResponseErrorMessage(response)) || `HTTP ${response.status}`);
                return;
            }
            const body = await response.json();
            // Not read, every value masked: nothing said in clear that the file would not say.
            const secrets = redacted.ok ? maskedKeywords(await redacted.text()) : null;
            if (request !== asked.current) return;
            setItems(Array.isArray(body?.items) ? body.items : []);
            setMasked(secrets);
        } catch (err) {
            if (request === asked.current) {
                setItems(null);
                setError(err.message);
            }
        } finally {
            if (request === asked.current) setLoading(false);
        }
    }, [configUrl]);

    // Opened, the keywords set evaluated on the node answering; closed, forgotten and hidden.
    useEffect(() => {
        if (!open) {
            asked.current++;
            setShowSecrets(false);
            return;
        }
        setNode("");
        setPatterns("");
        setItems(null);
        void evaluate("", "");
    }, [open, evaluate]);

    const isMasked = (keyword) => !showSecrets && (masked === null || masked.has(keyword));
    const anyMasked = items !== null && items.some((item) => masked === null || masked.has(item.keyword));
    const as = items?.find((item) => item.evaluated_as)?.evaluated_as;

    return (
        <Dialog open={open} onClose={onClose} title={t("configEval.title", {subject})} size="lg"
                footer={<Button onClick={onClose}>{t("common.close")}</Button>}>
            <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    void evaluate(node, patterns);
                }}
            >
                {nodes !== null && (
                    <div className="w-48">
                        <Field label={t("configEval.as")}>
                            {(control) => (nodes.length > 0 ? (
                                <Select {...control} className="w-full" value={node} onChange={(e) => {
                                    setNode(e.target.value);
                                    void evaluate(e.target.value, patterns);
                                }}>
                                    <option value="">{t("configEval.answering")}</option>
                                    {nodes.map((n) => <option key={n} value={n}>{n}</option>)}
                                </Select>
                            ) : (
                                <Input {...control} className="font-mono" value={node} placeholder={t("configEval.answering")}
                                       onChange={(e) => setNode(e.target.value)}/>
                            ))}
                        </Field>
                    </div>
                )}
                <div className="min-w-48 flex-1">
                    <Field label={t("configEval.keywords")}>
                        {(control) => (
                            <Input {...control} className="font-mono" value={patterns} placeholder="fs#1.*, DEFAULT.nodes"
                                   onChange={(e) => setPatterns(e.target.value)}/>
                        )}
                    </Field>
                </div>
                <Button type="submit" disabled={loading}>{t("configEval.evaluate")}</Button>
            </form>
            {/* Under the row: the fields aligned on their line. */}
            <p className="mt-1 text-data text-ink-muted">{t("configEval.keywordsHint")}</p>

            <div className="mt-2 flex min-h-8 items-center gap-2">
                <p className="mr-auto text-data text-ink-muted">
                    {as && t("configEval.evaluatedAs", {node: as})}
                    {anyMasked && ` · ${showSecrets
                        ? t("config.view.secretsMaskedIn", {time: formatSeconds(secondsLeft)})
                        : t("config.view.secretsHidden")}`}
                </p>
                {loading && <Spinner label={t("configEval.loading")}/>}
                {anyMasked && (
                    <IconButton
                        size="sm"
                        label={showSecrets ? t("config.view.hideSecrets") : t("config.view.showSecrets")}
                        aria-pressed={showSecrets}
                        onClick={() => setShowSecrets((shown) => !shown)}
                    >
                        {showSecrets ? <EyeOffIcon/> : <EyeIcon/>}
                    </IconButton>
                )}
            </div>
            {error && <Alert>{error}</Alert>}
            {items !== null && items.length === 0 && <p className="text-ink-muted">{t("configEval.none")}</p>}
            {items !== null && items.length > 0 && (
                <Table aria-label={t("configEval.tableAria")}>
                    <thead>
                    <HeaderRow>
                        <HeaderCell>{t("configEval.keyword")}</HeaderCell>
                        <HeaderCell>{t("configEval.value")}</HeaderCell>
                        <HeaderCell>{t("configEval.evaluated")}</HeaderCell>
                    </HeaderRow>
                    </thead>
                    <tbody>
                    {items.map((item) => {
                        const secret = isMasked(item.keyword);
                        const evaluated = evaluatedText(item);
                        // What the evaluation changed of the value stands out.
                        const changed = evaluated !== item.value;
                        return (
                            <Row key={item.keyword}>
                                <th scope="row" className="px-2 py-1 text-left font-mono font-normal whitespace-nowrap">{item.keyword}</th>
                                <Cell className="font-mono break-all text-ink-muted">{secret ? SECRET_MASK : item.value}</Cell>
                                <Cell className={changed ? "font-mono font-semibold break-all" : "font-mono break-all"}>
                                    {secret ? SECRET_MASK : evaluated}
                                    {/* Not evaluated, the whole configuration asked: why, in the daemon's words. */}
                                    {item.error && <span className="block font-sans font-normal text-state-down">{item.error}</span>}
                                </Cell>
                            </Row>
                        );
                    })}
                    </tbody>
                </Table>
            )}
        </Dialog>
    );
}
