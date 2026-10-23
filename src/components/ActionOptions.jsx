import React from "react";
import {useTranslation} from "react-i18next";
import {Checkbox, Field, Input, Select, Textarea} from "../ui/components/Field";
import {actionOptions, isSet} from "../app/action-options";

/**
 * The options of an action in its confirmation, as the om flags of its command
 * (app/action-options): the node it goes to in sight, where the daemon would
 * choose otherwise; the others folded under "Options", how many are set said on
 * the fold. `nodes`, the nodes of the object to pick from, a name typed when none
 * is known. Nothing when the action takes no option.
 */
export default function ActionOptions({action, scope, nodes = [], values, onChange}) {
    const {t} = useTranslation();
    const options = actionOptions(action, scope);
    if (options.length === 0) return null;
    const set = (name, value) => onChange({...values, [name]: value});
    const label = (name) => t(`actionOptions.${name}.label`);
    const hint = (name) => t(`actionOptions.${name}.hint`);

    const field = (option) => {
        const {name, kind} = option;
        const value = values[name];
        if (kind === "flag") {
            return (
                <div key={name}>
                    <Checkbox
                        checked={value === true}
                        onChange={(e) => set(name, e.target.checked)}
                        label={<span><code className="font-mono">{label(name)}</code></span>}
                        aria-describedby={`action-option-${name}-hint`}
                    />
                    <p id={`action-option-${name}-hint`} className="ml-6 text-data text-ink-muted">{hint(name)}</p>
                </div>
            );
        }
        return (
            <Field key={name} label={<code className="font-mono">{label(name)}</code>} hint={hint(name)}>
                {(control) => {
                    const common = {...control, value: typeof value === "string" ? value : "", onChange: (e) => set(name, e.target.value)};
                    if (kind === "node" && nodes.length > 0) {
                        return (
                            <Select {...common} className="w-full">
                                <option value="">{t(`actionOptions.${name}.none`)}</option>
                                {nodes.map((node) => <option key={node} value={node}>{node}</option>)}
                            </Select>
                        );
                    }
                    if (kind === "lines") return <Textarea {...common} rows={3} className="font-mono"/>;
                    return <Input {...common} className="font-mono" placeholder={t(`actionOptions.${name}.placeholder`, {defaultValue: ""})}/>;
                }}
            </Field>
        );
    };

    const inSight = options.filter((o) => o.kind === "node");
    const folded = options.filter((o) => o.kind !== "node");
    const count = folded.filter((o) => isSet(values[o.name])).length;
    return (
        <div className="flex flex-col gap-3 text-ink" data-testid="action-options">
            {inSight.map(field)}
            {folded.length > 0 && (
                <details className="rounded-(--radius-control) border border-line px-3 py-2">
                    <summary className="cursor-pointer select-none font-medium">
                        {count > 0 ? t("actionOptions.summarySet", {count}) : t("actionOptions.summary")}
                    </summary>
                    <div className="mt-3 flex flex-col gap-3">{folded.map(field)}</div>
                </details>
            )}
        </div>
    );
}
