import React, {useCallback, useEffect, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {Alert} from "../ui/components/Alert";
import {Button, IconButton} from "../ui/components/Button";
import {Spinner} from "../ui/components/Spinner";
import {AlertTriangleIcon, CheckIcon, CloseIcon} from "../ui/icons";
import {cn} from "../ui/cn";
import {authHeaders, getResponseErrorMessage} from "../services/api.jsx";

/*
 * A configuration validated by the daemon, as `om <path> config validate` does it on
 * its node, and nothing written (GET `.../config/validate`): the configuration the
 * node holds, an object's as loaded on the node, its drivers checking it there. Or a
 * draft (POST `.../config/validate` of an object): the text of an editor, a design.
 * Every alert answered, the warnings a write lets through with the errors it refuses.
 */

/**
 * A daemon older than the validation answers its router's 404, `{"message": "Not
 * Found"}`; a configuration the node does not hold, a problem with its title.
 */
const isRouter404 = (status, body) => status === 404 && body?.message === "Not Found" && !body?.title;

/**
 * Validates the configuration at `url` (the `config/validate` address of a node, or
 * of an instance of an object on a node): `validate()`. Or, `validate(text)`, a draft
 * sent to the `config/validate` address of an object (POST), of one not created yet
 * too, nothing written. `result` null before, then {loading}, {alerts}, {error} or
 * {unsupported}; `reset` forgets it, as a configuration written since makes it stale.
 * Only the answer to the last request counts: one to an older draft, come after, is
 * dropped. `changes`, a count of the changes of the configuration validated, by
 * whoever made them (useLiveChanges): on each, a result shown, or awaited, is of
 * the configuration before it, {stale} in its place, saying to validate again.
 */
export function useConfigValidation(url, changes = 0) {
    const [result, setResult] = useState(null);
    const last = useRef(0);
    const validate = useCallback(async (text) => {
        if (!url) return;
        const asked = ++last.current;
        const settle = (value) => {
            if (asked === last.current) setResult(value);
        };
        setResult({loading: true});
        try {
            const response = text === undefined
                ? await fetch(url, {headers: authHeaders(), cache: "no-cache"})
                : await fetch(url, {
                    method: "POST",
                    headers: {...authHeaders(), "Content-Type": "application/octet-stream"},
                    body: text,
                });
            if (!response.ok) {
                const body = await response.clone().json().catch(() => null);
                if (isRouter404(response.status, body)) {
                    settle({unsupported: true});
                    return;
                }
                settle({error: (await getResponseErrorMessage(response)) || `HTTP ${response.status}`});
                return;
            }
            const data = await response.json();
            settle({alerts: Array.isArray(data?.items) ? data.items : []});
        } catch (err) {
            settle({error: err.message});
        }
    }, [url]);
    // Forgotten: an answer still awaited, dropped too.
    const reset = useCallback(() => {
        last.current += 1;
        setResult(null);
    }, []);
    // Another node, another object: what was found there is not of this one.
    useEffect(() => {
        last.current += 1;
        setResult(null);
    }, [url]);
    // The configuration changed since, another user, om, a node: what was found is not
    // of it any more. Said so, not left shown as if it were; nothing shown, nothing said.
    const seen = useRef(changes);
    useEffect(() => {
        if (seen.current === changes) return;
        seen.current = changes;
        last.current += 1;
        setResult((previous) => (previous === null || previous.stale ? previous : {stale: true}));
    }, [changes]);
    return {result, validate, reset};
}

/** The tint and icon of an alert, by its level. */
const LEVELS = {
    error: {ink: "text-state-down", Icon: AlertTriangleIcon},
    warning: {ink: "text-state-warn", Icon: AlertTriangleIcon},
};

/**
 * What the validation found: none, said so unless `quietWhenValid`; else the errors
 * first, then the warnings, each its keyword or section, what is wrong, and what the
 * daemon says of it. Errors are refused by a write, said so. `onClose` hides it.
 */
export function ConfigValidationResult({result, onClose, quietWhenValid = false}) {
    const {t} = useTranslation();
    if (result === null) return null;
    const close = onClose && (
        <IconButton size="sm" label={t("configValidate.close")} onClick={onClose}>
            <CloseIcon className="h-3.5 w-3.5"/>
        </IconButton>
    );
    if (result.loading) return <Spinner label={t("configValidate.checking")}/>;
    if (result.stale) return quietWhenValid ? null : <Alert tone="info" action={close}>{t("configValidate.stale")}</Alert>;
    if (result.unsupported) return <Alert tone="info" action={close}>{t("configValidate.unsupported")}</Alert>;
    if (result.error) return <Alert action={close}>{t("configValidate.failed", {message: result.error})}</Alert>;
    const {alerts} = result;
    if (alerts.length === 0) return quietWhenValid ? null : <Alert tone="success" action={close}>{t("configValidate.none")}</Alert>;
    const errors = alerts.filter((a) => a.level === "error").length;
    const warnings = alerts.length - errors;
    const sorted = [...alerts].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
    return (
        <section
            aria-label={t("configValidate.title")}
            data-config-validation=""
            className="space-y-1.5 rounded-(--radius-control) border border-line bg-surface-raised p-2"
        >
            <div className="flex items-center gap-2">
                <p className="mr-auto font-medium">
                    {[
                        errors > 0 ? t("configValidate.errors", {count: errors}) : null,
                        warnings > 0 ? t("configValidate.warnings", {count: warnings}) : null,
                    ].filter(Boolean).join(", ")}
                    {errors > 0 && <span className="font-normal text-ink-muted"> · {t("configValidate.refused")}</span>}
                </p>
                {close}
            </div>
            <ul className="space-y-1">
                {sorted.map((a, i) => {
                    const {ink, Icon} = LEVELS[a.level] ?? LEVELS.warning;
                    return (
                        <li key={i} data-alert={a.level} className="flex gap-2">
                            <span className={cn("mt-0.5 shrink-0", ink)} role="img" aria-label={t(`configValidate.levels.${a.level}`, {defaultValue: a.level})}>
                                <Icon aria-hidden="true" className="h-3.5 w-3.5"/>
                                <span className="sr-only">{t(`configValidate.levels.${a.level}`, {defaultValue: a.level})}</span>
                            </span>
                            <span className="min-w-0">
                                {a.key && <span className="font-mono text-data">{a.key}</span>}
                                {a.key && " "}
                                <span>{a.kind}</span>
                                {a.driver && <span className="text-ink-muted"> ({a.driver})</span>}
                                {a.comment && <span className="block text-ink-muted break-words">{a.comment}</span>}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

/**
 * The button validating the configuration held, in the tools over its text: its word
 * beside its icon, as the others there.
 */
export function ValidateButton({onClick, disabled}) {
    const {t} = useTranslation();
    return (
        <Button size="sm" aria-label={t("configValidate.runHeld")} icon={<CheckIcon/>} onClick={onClick} disabled={disabled}>
            {t("configValidate.run")}
        </Button>
    );
}

/** How long a draft rests unchanged before it is validated. */
export const DRAFT_VALIDATION_DELAY_MS = 800;

/**
 * A draft validated as it is edited, `text` sent to `url` once it rested unchanged a
 * moment, nothing written: what the daemon would refuse of it, and warn of, said
 * before it is written. The last answer stays shown while the next is read, said
 * checking. Nothing shown without a url, nor on a daemon older than the validation,
 * nor of a draft found valid: only what is wrong with it. `onErrors`, told the count
 * of the errors of each answer, none once gone: a write the daemon would refuse held.
 */
export function DraftValidation({url, text, onErrors}) {
    const {t} = useTranslation();
    const {result, validate, reset} = useConfigValidation(url);
    const shown = useRef(null);
    // The errors of the last answer, told the caller; none once there is none to tell.
    const errors = result && !result.loading && Array.isArray(result.alerts) ? result.alerts.filter((a) => a.level === "error").length : 0;
    const told = useRef(onErrors);
    told.current = onErrors;
    useEffect(() => {
        if (result?.loading) return;
        told.current?.(url ? errors : 0);
    }, [result, errors, url]);
    useEffect(() => () => told.current?.(0), []);
    useEffect(() => {
        if (!url || text === null || text === undefined) {
            reset();
            return undefined;
        }
        const timer = setTimeout(() => validate(text), DRAFT_VALIDATION_DELAY_MS);
        return () => clearTimeout(timer);
    }, [url, text, validate, reset]);
    if (result === null || !url) {
        shown.current = null;
        return null;
    }
    if (result.unsupported) return null;
    if (!result.loading) shown.current = result;
    return (
        <div data-draft-validation="" className="space-y-1">
            {result.loading && <p className="text-data text-ink-muted">{t("configValidate.checking")}</p>}
            {shown.current && <ConfigValidationResult result={shown.current} quietWhenValid/>}
        </div>
    );
}
