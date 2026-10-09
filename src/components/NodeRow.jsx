import React from "react";
import {Row, Cell} from "../ui/components/Table";
import {Checkbox} from "../ui/components/Field";
import {IconButton} from "../ui/components/Button";
import {MenuButton} from "../ui/components/MenuButton";
import {StatusMark} from "../ui/components/StatusMark";
import {FrozenMark} from "../ui/components/FrozenMark";
import {UsageBar} from "../ui/components/UsageBar";
import {FileIcon, RssIcon, MoreIcon} from "../ui/icons";
import {NODE_ACTIONS, actionLabel} from "../constants/actions";
import {useTranslation} from "react-i18next";

const ZERO_DATE = "0001-01-01T00:00:00Z";

const formatDate = (dateString, t, language) => {
    if (!dateString || dateString === ZERO_DATE) {
        return "-";
    }

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return t("nodes.time.justNow");
    if (diffMins < 60) return t("nodes.time.minutesAgo", {count: diffMins});
    if (diffHours < 24) return t("nodes.time.hoursAgo", {count: diffHours});
    if (diffDays < 7) return t("nodes.time.daysAgo", {count: diffDays});

    return date.toLocaleDateString(language);
};

/**
 * The node monitor state as a mark: idle is the normal state, a failure is down,
 * anything else is a transition. Without a monitor the state is unknown.
 */
const monitorMark = (monitor) => {
    const state = monitor?.state;
    if (!state) return {state: "unknown", label: "unknown"};
    if (state === "idle") return {state: "up", label: "idle"};
    if (state.includes("fail")) return {state: "down", label: state};
    return {state: "warn", label: state};
};

/** Class names of the per-row menu: its trigger made a square ⋮ button, its menu aligned on the right. */
const ICON = "flex h-4 w-4 items-center justify-center text-ink-muted [&>svg]:h-4! [&>svg]:w-4!";
const DANGER_ICON = "flex h-4 w-4 items-center justify-center text-state-down [&>svg]:h-4! [&>svg]:w-4!";

const NodeRow = ({
                     nodename,
                     stats,
                     status,
                     monitor,
                     isSelected,
                     daemonNodename,
                     onSelect,
                     onAction,
                     onOpenLogs,
                 }) => {
    const {t, i18n} = useTranslation();
    const notAvailable = t("common.notAvailable");
    const isFrozen = !!status?.frozen_at && status.frozen_at !== ZERO_DATE;
    const isDaemonNode = daemonNodename === nodename;
    const filteredMenuItems = NODE_ACTIONS.filter(({name}) => {
        if (name === "freeze" && isFrozen) return false;
        return !(name === "unfreeze" && !isFrozen);
    });
    const mark = monitorMark(monitor);

    const loadState = stats?.load_15m > 4 ? "down" : stats?.load_15m > 2 ? "warn" : "up";
    const memState = stats?.mem_avail < 20 ? "down" : stats?.mem_avail < 50 ? "warn" : "up";
    const bootedValid = status?.booted_at && status.booted_at !== ZERO_DATE;
    const updatedValid = monitor?.updated_at && monitor.updated_at !== ZERO_DATE;

    return (
        <Row aria-label={t("nodes.row.label", {node: nodename})} className={isSelected ? "bg-accent-soft" : undefined}>
            <Cell className="w-8">
                <Checkbox
                    checked={isSelected}
                    onChange={(e) => onSelect(e, nodename)}
                    aria-label={t("nodes.row.select", {node: nodename})}
                    onClick={(e) => e.stopPropagation()}
                />
            </Cell>
            <Cell className="font-medium whitespace-nowrap">{nodename || "-"}</Cell>
            <Cell className="whitespace-nowrap">
                <span className="flex items-center justify-center gap-1.5">
                    <StatusMark state={mark.state} label={mark.label}/>
                    {monitor && monitor.state !== "idle" && <span>{monitor.state}</span>}
                    {isDaemonNode && (
                        <span
                            role="img"
                            title={t("nodes.row.connected")}
                            aria-label={t("nodes.row.connected")}
                            className="text-state-up"
                        >
                            <RssIcon className="h-3.5 w-3.5"/>
                        </span>
                    )}
                    <FrozenMark frozen={isFrozen}/>
                </span>
            </Cell>
            <Cell numeric>{stats?.score || notAvailable}</Cell>
            <Cell numeric className="whitespace-nowrap">
                {stats?.load_15m ? (
                    <span className="inline-flex items-center gap-2">
                        <span>{stats.load_15m}</span>
                        <UsageBar showValue={false} value={Math.min(stats.load_15m * 20, 100)} state={loadState} label={t("nodes.columns.load15m")}/>
                    </span>
                ) : (
                    notAvailable
                )}
            </Cell>
            <Cell numeric className="whitespace-nowrap">
                {stats?.mem_avail ? (
                    <span className="inline-flex items-center gap-2">
                        <span>{stats.mem_avail}%</span>
                        <UsageBar showValue={false} value={stats.mem_avail} state={memState} label={t("nodes.columns.memAvail")}/>
                    </span>
                ) : (
                    notAvailable
                )}
            </Cell>
            <Cell numeric>{stats?.swap_avail || notAvailable}%</Cell>
            <Cell className="whitespace-nowrap">{status?.agent || notAvailable}</Cell>
            <Cell className="whitespace-nowrap">
                {bootedValid ? (
                    <span title={new Date(status.booted_at).toLocaleString(i18n.language)}>{formatDate(status.booted_at, t, i18n.language)}</span>
                ) : (
                    "-"
                )}
            </Cell>
            <Cell className="whitespace-nowrap">
                <span title={updatedValid ? new Date(monitor.updated_at).toLocaleString(i18n.language) : "-"}>
                    {formatDate(monitor?.updated_at, t, i18n.language)}
                </span>
            </Cell>
            <Cell>
                <MenuButton
                    label={t("nodes.row.moreActions", {node: nodename})}
                    icon={<MoreIcon className="h-4 w-4"/>}
                    compact
                    align="end"
                    className="inline-flex align-middle"
                    items={filteredMenuItems.map(({name, icon, color}) => ({
                        key: name,
                        label: actionLabel(name),
                        icon: <span aria-hidden="true" className={color === "red" ? DANGER_ICON : ICON}>{icon}</span>,
                        onSelect: () => onAction(nodename, name),
                    }))}
                />
            </Cell>
            <Cell>
                <IconButton size="sm" className="align-middle" label={t("nodes.row.viewLogs", {node: nodename})} onClick={() => onOpenLogs(nodename)}>
                    <FileIcon className="h-4 w-4"/>
                </IconButton>
            </Cell>
        </Row>
    );
};

export default React.memo(NodeRow);
