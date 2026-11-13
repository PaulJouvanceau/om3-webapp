/*
 * The resources as the Resources page lists them and the cluster page counts them:
 * a line each, and what makes one a problem (Problems only): down, but for a reason
 * that is none, or in warn.
 */

import {isQuietDown} from "../ui/components/status";
import {childrenDown} from "./statusboard";

const ZERO_TIME = "0001-01-01T00:00:00Z";
const isSetTime = (t) => !!t && t !== ZERO_TIME;

/** The flags of a resource, as its config and its status tell them. */
const FLAGS = [
    ["disabled", (r) => r.config?.is_disabled || r.status?.disable],
    ["standby", (r) => r.config?.is_standby || r.status?.standby],
    ["monitored", (r) => r.config?.is_monitored || r.status?.monitor],
    ["optional", (r) => r.status?.optional],
    ["encap", (r) => r.status?.encap],
];

/** A line of the list: what is shown and sorted of a resource item. */
export const toLine = (item) => {
    const meta = item?.meta ?? {};
    const data = item?.data ?? {};
    const node = meta.encap_node || meta.node || "";
    return {
        key: `${meta.object}|${meta.node}|${meta.encap_node ?? ""}|${meta.rid}`,
        object: meta.object ?? "",
        node,
        hostNode: meta.node ?? "",
        rid: meta.rid ?? "",
        group: String(meta.rid ?? "").split("#")[0],
        type: data.status?.type ?? "",
        status: data.status?.status ?? "",
        label: data.status?.label ?? "",
        flags: FLAGS.filter(([, test]) => test(data)).map(([name]) => name),
        restarts: data.monitor?.restart?.remaining,
        notProvisioned: data.status?.provisioned?.state === "false",
    };
};

/**
 * Why a resource down is no problem, null when it is one (or is not down), as the
 * rest of the webapp tells a down that is no issue:
 * - "optional", "disabled": its instance does without it;
 * - "stopped": its instance stopped on purpose, the daemon not starting it back, as
 *   the status board says it;
 * - "passive": on a passive node, its object up on another, as the objects' node
 *   columns draw it (isQuietDown); "stdby up", its standby resources up, passive all
 *   the same;
 * - "unused": of a vol down nothing uses, as the object panel draws it (childrenDown).
 * `objects`, by path, and `volChildren`, the children of the vols by node, as the menu
 * has them; `reports`, the instances by object and node, when held: an instance not
 * reported reads down, not stopped.
 */
export const quietReason = (line, {objects, reports, volChildren} = {}) => {
    if (line.status !== "down") return null;
    if (line.flags?.includes("optional")) return "optional";
    if (line.flags?.includes("disabled")) return "disabled";
    const report = reports?.[line.object]?.[line.hostNode];
    if (isSetTime(report?.stopped_at)) return "stopped";
    const instance = report?.avail ?? "down";
    const objectAvail = objects?.[line.object]?.avail;
    if (isQuietDown(instance === "stdby up" ? "down" : instance, objectAvail)) return "passive";
    const monitors = Object.values(volChildren?.[line.object] ?? {}).map((children) => ({children}));
    if (childrenDown(line.object, objectAvail, monitors)) return "unused";
    return null;
};

/** Why a resource down is no problem (quietReason), each reason; then none, a problem. */
export const DOWN_REASONS = ["optional", "disabled", "stopped", "passive", "unused", "none"];

/** Why a line is down, a value of DOWN_REASONS; null when not down. Its `quiet` set (quietReason). */
export const downReason = (line) => (line.status === "down" ? line.quiet ?? "none" : null);

/** A resource worth a look: down for no reason that is none (`quiet`), or in warn. */
export const isProblem = (line) => (line.status === "down" && !line.quiet) || line.status === "warn";
