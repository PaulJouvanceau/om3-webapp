import React, {useEffect, useState, useMemo} from "react";
import useFetchDaemonStatus from "../hooks/useFetchDaemonStatus.jsx";
import {closeEventSource, startEventReception} from "../eventSourceManager";
import useEventStore from "../hooks/useEventStore.js";
import NodeRow from "../components/NodeRow.jsx";
import LogsViewer from "../components/LogsViewer.jsx";
import logger from '../utils/logger.js';
import {URL_NODE} from "../config/apiPath.js";
import {NODE_ACTIONS, actionLabel} from "../constants/actions";
import {useTranslation} from "react-i18next";
import ActionDialogManager from "./ActionDialogManager";
import EventLogger from "../components/EventLogger";
import {Table, HeaderRow, HeaderCell, SortHeaderCell} from "../ui/components/Table";
import {Checkbox} from "../ui/components/Field";
import {IconButton} from "../ui/components/Button";
import {MenuButton} from "../ui/components/MenuButton";
import {SlideOver} from "../ui/components/SlideOver";
import {Alert} from "../ui/components/Alert";
import {Spinner} from "../ui/components/Spinner";
import {CloseIcon} from "../ui/icons";

const ZERO_DATE = "0001-01-01T00:00:00Z";

/** How long a feedback message stays, as the snackbar it replaces. */
const FEEDBACK_DURATION_MS = 4000;

const isNodeFrozen = (status) => !!status?.frozen_at && status?.frozen_at !== ZERO_DATE;

const SORT_COLUMNS = [
    {key: "name", labelKey: "common.name"},
    {key: "state", labelKey: "common.state"},
    {key: "score", labelKey: "nodes.columns.score"},
    {key: "load_15m", labelKey: "nodes.columns.load15m"},
    {key: "mem_avail", labelKey: "nodes.columns.memAvail"},
    {key: "swap_avail", labelKey: "nodes.columns.swapAvail"},
    {key: "version", labelKey: "nodes.columns.version"},
    {key: "booted_at", labelKey: "nodes.columns.bootedAt"},
    {key: "updated_at", labelKey: "nodes.columns.updatedAt"},
];

/** Feedback tones, from the severities of the snackbar it replaces. */
const TONES = {info: "info", success: "success", warning: "warning", error: "error"};

/** Class names of the bulk menu: aligned on the right edge of its button, at the end of the toolbar. */
const ICON = "flex h-4 w-4 items-center justify-center text-ink-muted [&>svg]:h-4! [&>svg]:w-4!";
const DANGER_ICON = "flex h-4 w-4 items-center justify-center text-state-down [&>svg]:h-4! [&>svg]:w-4!";

const NodesTable = () => {
    const {t} = useTranslation();
    const {daemon, fetchNodes} = useFetchDaemonStatus();
    const nodeStatus = useEventStore((state) => state.nodeStatus);
    const nodeStats = useEventStore((state) => state.nodeStats);
    const nodeMonitor = useEventStore((state) => state.nodeMonitor);

    const [selectedNodes, setSelectedNodes] = useState([]);
    const [snackbar, setSnackbar] = useState({open: false, message: "", severity: "info"});
    const [pendingAction, setPendingAction] = useState(null);
    const [sortColumn, setSortColumn] = useState("name");
    const [sortDirection, setSortDirection] = useState("asc");

    // Logs panel state
    const [logsDrawerOpen, setLogsDrawerOpen] = useState(false);
    const [selectedNodeForLogs, setSelectedNodeForLogs] = useState(null);

    const nodeEventTypes = useMemo(() => [
        "NodeStatusUpdated",
        "NodeMonitorUpdated",
        "NodeStatsUpdated",
        "CONNECTION_OPENED",
        "CONNECTION_ERROR",
        "RECONNECTION_ATTEMPT",
        "MAX_RECONNECTIONS_REACHED",
        "CONNECTION_CLOSED"
    ], []);

    const handleAction = (action, nodename = null) => {
        setPendingAction({action, node: nodename});
    };

    // Handle opening logs for a node
    const handleOpenLogs = (nodename) => {
        setSelectedNodeForLogs(nodename);
        setLogsDrawerOpen(true);
    };

    const handleCloseLogsDrawer = () => {
        setLogsDrawerOpen(false);
        setSelectedNodeForLogs(null);
    };

    useEffect(() => {
        const token = localStorage.getItem("authToken");
        if (token) {
            // Start event reception immediately
            startEventReception(token, nodeEventTypes);
            // Fetch daemon status in parallel
            fetchNodes(token).catch(error => {
                logger.error("Failed to fetch nodes:", error);
            });
        }

        return () => {
            closeEventSource();
        };
    }, [fetchNodes, nodeEventTypes]);

    // The feedback message hides itself after a while, as the snackbar did.
    useEffect(() => {
        if (!snackbar.open) return;
        const timer = setTimeout(() => {
            setSnackbar((prev) => ({...prev, open: false}));
        }, FEEDBACK_DURATION_MS);
        return () => clearTimeout(timer);
    }, [snackbar]);

    const closeSnackbar = () => setSnackbar((prev) => ({...prev, open: false}));

    const handleSelectNode = (event, nodename) => {
        if (event.target.checked) {
            setSelectedNodes((prev) => [...prev, nodename]);
        } else {
            setSelectedNodes((prev) => prev.filter((node) => node !== nodename));
        }
    };

    const postActionUrl = (node, action) => {
        const def = NODE_ACTIONS.find((a) => a.name === action);
        const endpoint = def?.endpoint ?? `action/${action}`;
        return `${URL_NODE}/${node}/${endpoint}`;
    };

    const handleDialogConfirm = async (action) => {
        if (!pendingAction) return;

        const token = localStorage.getItem("authToken");
        if (!token) {
            setSnackbar({
                open: true,
                message: t("nodes.feedback.noToken"),
                severity: "error",
            });
            return;
        }

        const label = actionLabel(action);
        setSnackbar({
            open: true,
            message: t("nodes.feedback.executing", {action: label}),
            severity: "info",
        });
        let successCount = 0;
        let errorCount = 0;

        const nodesToProcess = pendingAction.node
            ? [pendingAction.node]
            : selectedNodes;

        const promises = nodesToProcess.map(async (node) => {
            const isFrozen = isNodeFrozen(nodeStatus[node]);
            if (action === "freeze" && isFrozen) {
                errorCount++;
                return;
            }
            if (action === "unfreeze" && !isFrozen) {
                errorCount++;
                return;
            }
            const url = postActionUrl(node, action);
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                });
                if (!response.ok) {
                    errorCount++;
                    logger.error(`Failed to execute ${action} on ${node}: HTTP error! status: ${response.status}`);
                    return;
                }
                successCount++;
            } catch (error) {
                logger.error(`Failed to execute ${action} on ${node}: ${error.message}`);
                errorCount++;
            }
        });

        await Promise.all(promises);
        setSnackbar({
            open: true,
            message:
                successCount && !errorCount
                    ? t("nodes.feedback.succeeded", {action: label, count: successCount})
                    : successCount
                        ? t("nodes.feedback.partial", {action: label, ok: successCount, errors: errorCount})
                        : t("nodes.feedback.failed", {action: label, count: nodesToProcess.length}),
            severity: successCount && !errorCount ? "success" : successCount ? "warning" : "error",
        });

        setSelectedNodes([]);
        setPendingAction(null);
    };

    const filteredMenuItems = NODE_ACTIONS.filter(({name}) => {
        if (selectedNodes.length === 0) return false;
        return selectedNodes.some((nodename) => {
            const isFrozen = isNodeFrozen(nodeStatus[nodename]);
            if (name === "freeze" && isFrozen) return false;
            return !(name === "unfreeze" && !isFrozen);
        });
    });

    const sortedNodes = React.useMemo(() => {
        return [...Object.keys(nodeStatus)].sort((a, b) => {
            let diff = 0;
            if (sortColumn === "name") {
                diff = a.localeCompare(b);
            } else if (sortColumn === "state") {
                const stateA = nodeMonitor[a]?.state || "idle";
                const stateB = nodeMonitor[b]?.state || "idle";
                diff = stateA.localeCompare(stateB);
            } else if (sortColumn === "score") {
                diff = (nodeStats[a]?.score || 0) - (nodeStats[b]?.score || 0);
            } else if (sortColumn === "load_15m") {
                diff = (nodeStats[a]?.load_15m || 0) - (nodeStats[b]?.load_15m || 0);
            } else if (sortColumn === "mem_avail") {
                diff = (nodeStats[a]?.mem_avail || 0) - (nodeStats[b]?.mem_avail || 0);
            } else if (sortColumn === "swap_avail") {
                diff = (nodeStats[a]?.swap_avail || 0) - (nodeStats[b]?.swap_avail || 0);
            } else if (sortColumn === "version") {
                diff = (nodeStatus[a]?.agent || '').localeCompare(nodeStatus[b]?.agent || '');
            } else if (sortColumn === "booted_at") {
                const bootedA = nodeStatus[a]?.booted_at || ZERO_DATE;
                const bootedB = nodeStatus[b]?.booted_at || ZERO_DATE;
                diff = new Date(bootedA).getTime() - new Date(bootedB).getTime();
            } else if (sortColumn === "updated_at") {
                const updatedA = nodeMonitor[a]?.updated_at || ZERO_DATE;
                const updatedB = nodeMonitor[b]?.updated_at || ZERO_DATE;
                diff = new Date(updatedA).getTime() - new Date(updatedB).getTime();
            }
            return sortDirection === "asc" ? diff : -diff;
        });
    }, [nodeStatus, nodeStats, nodeMonitor, sortColumn, sortDirection]);

    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
        } else {
            setSortColumn(column);
            setSortDirection("asc");
        }
    };

    const nodeCount = Object.keys(nodeStatus).length;

    return (
        <div className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
                <MenuButton
                    label={t("nodes.bulkActions")}
                    disabled={selectedNodes.length === 0}
                    className="ml-auto"
                    align="end"
                    items={filteredMenuItems.map(({name, icon, color}) => ({
                        key: name,
                        label: actionLabel(name),
                        icon: <span aria-hidden="true" className={color === "red" ? DANGER_ICON : ICON}>{icon}</span>,
                        onSelect: () => handleAction(name),
                    }))}
                />
            </div>

            {snackbar.open && (
                <Alert
                    tone={TONES[snackbar.severity] ?? "info"}
                    action={
                        <IconButton label={t("common.close")} bare onClick={closeSnackbar}>
                            <CloseIcon className="h-4 w-4"/>
                        </IconButton>
                    }
                >
                    {snackbar.message}
                </Alert>
            )}

            {nodeCount === 0 ? (
                <div className="flex justify-center py-8">
                    <Spinner label={t("nodes.loading")}/>
                </div>
            ) : (
                // Visible overflow, the panel as wide as the table: the row menus are not clipped,
                // the header sticks to the top of the page scroll, which scrolls sideways if need be.
                <Table sticky className="max-h-[calc(100dvh-12rem)]">
                    <thead>
                    <HeaderRow>
                        <HeaderCell className="w-8">
                            <Checkbox
                                aria-label={t("nodes.selectAll")}
                                checked={selectedNodes.length === nodeCount}
                                onChange={(e) =>
                                    setSelectedNodes(e.target.checked ? Object.keys(nodeStatus) : [])
                                }
                            />
                        </HeaderCell>
                        {SORT_COLUMNS.map(({key, labelKey}) => (
                            <SortHeaderCell
                                key={key}
                                label={t(labelKey)}
                                active={sortColumn === key}
                                direction={sortDirection}
                                onSort={() => handleSort(key)}
                            />
                        ))}
                        <HeaderCell>{t("common.actions")}</HeaderCell>
                        <HeaderCell>{t("nodes.columns.logs")}</HeaderCell>
                    </HeaderRow>
                    </thead>
                    <tbody>
                    {sortedNodes.map((nodename) => (
                        <NodeRow
                            key={nodename}
                            nodename={nodename}
                            stats={nodeStats[nodename]}
                            status={nodeStatus[nodename]}
                            monitor={nodeMonitor[nodename]}
                            isSelected={selectedNodes.includes(nodename)}
                            daemonNodename={daemon.nodename}
                            onSelect={handleSelectNode}
                            onAction={(nodename, action) => handleAction(action, nodename)}
                            onOpenLogs={handleOpenLogs}
                        />
                    ))}
                    </tbody>
                </Table>
            )}

            <ActionDialogManager
                pendingAction={pendingAction}
                handleConfirm={handleDialogConfirm}
                target={pendingAction?.node
                    ? t("nodes.target.node", {node: pendingAction.node})
                    : t("nodes.target.selected", {count: selectedNodes.length})}
                supportedActions={NODE_ACTIONS.map((action) => action.name)}
                onClose={() => setPendingAction(null)}
            />

            <SlideOver
                open={logsDrawerOpen}
                title={t("nodes.logsTitle")}
                onClose={handleCloseLogsDrawer}
                closeLabel={t("common.close")}
                size="wide"
                resizeLabel={t("nodes.resizeDrawer")}
                closeOnOutsideClick={false}
            >
                {selectedNodeForLogs !== null && (
                    <LogsViewer
                        nodename={selectedNodeForLogs}
                        type="node"
                        height="100%"
                    />
                )}
            </SlideOver>

            <EventLogger eventTypes={nodeEventTypes} title={t("nodes.eventsLogger")} buttonLabel={t("nodes.events")}/>
        </div>
    );
};

export default NodesTable;
