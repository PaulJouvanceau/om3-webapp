import React, {useEffect, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {Alert} from "../ui/components/Alert";
import {Button} from "../ui/components/Button";
import {Checkbox} from "../ui/components/Field";
import {Dialog} from "../ui/components/Dialog";
import {nodeAction} from "../app/node-actions";
import {keyOf} from "../app/action-menu";

/**
 * The confirmation of an action on nodes: what it does; for a harmful one, what it
 * costs, in a warning, and a box to tick saying it is understood before it may go.
 * `pending`, the action asked, or null; `target`, the nodes it is asked on, in words;
 * `description`, what it does there, when it says more than on a node alone.
 */
export function NodeActionDialog({pending, target, description, onConfirm, onClose}) {
    const {t} = useTranslation();
    const [understood, setUnderstood] = useState(false);
    // Confirmed once: a second click, before the dialog closes, sends nothing more.
    const confirmed = useRef(false);
    useEffect(() => {
        setUnderstood(false);
        confirmed.current = false;
    }, [pending]);
    const confirm = () => {
        if (confirmed.current) return;
        confirmed.current = true;
        onConfirm(pending.action);
    };
    if (!pending) return null;
    const action = nodeAction(pending.action);
    const key = keyOf(pending.action);
    const harmful = action?.color === "red";
    const label = t(`nodeActions.${key}.label`);
    return (
        <Dialog
            open
            title={t("nodeActions.confirmTitle", {label, target})}
            onClose={onClose}
            footer={(
                <>
                    <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
                    <Button
                        variant={pending.action === "evict" ? "delete" : "change"}
                        disabled={harmful && !understood}
                        onClick={confirm}
                    >
                        {label}
                    </Button>
                </>
            )}
        >
            <div className="space-y-3">
                <p>{description ?? t(`nodeActions.${key}.description`)}</p>
                {harmful && (
                    <>
                        <Alert tone="warning">{t(`nodeActions.${key}.warning`)}</Alert>
                        <Checkbox
                            label={t("nodeActions.understood")}
                            checked={understood}
                            onChange={(event) => setUnderstood(event.target.checked)}
                        />
                    </>
                )}
            </div>
        </Dialog>
    );
}
