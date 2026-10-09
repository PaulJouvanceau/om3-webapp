import React, {useCallback, useEffect, useState, useRef, useMemo} from "react";
import {useParams} from "react-router-dom";
import {Trans, useTranslation} from "react-i18next";
import useEventStore from "../hooks/useEventStore.js";
import {URL_NODE} from "../config/apiPath.js";
import {getResponseErrorMessage} from "../services/api.jsx";
import {INSTANCE_ACTIONS, RESOURCE_ACTIONS, actionLabel} from "../constants/actions";
import {parseObjectPath} from "../utils/objectUtils.jsx";
import {ObjectIcon, om3ObjectKind} from "../ui/components/ObjectIcon";
import {StoppedMark, RpoBreachedMark} from "../ui/components/StateMarks";
import {startEventReception, closeEventSource} from "../eventSourceManager.jsx";
import EventLogger from "../components/EventLogger";
import LogsViewer from "./LogsViewer";
import ConsoleTerminal from "./ConsoleTerminal.jsx";
import {Table, HeaderRow, HeaderCell, Row, Cell, EmptyRow} from "../ui/components/Table";
import {StatusBadge} from "../ui/components/StatusBadge";
import {StatusMark} from "../ui/components/StatusMark";
import {FrozenMark} from "../ui/components/FrozenMark";
import {MenuButton} from "../ui/components/MenuButton";
import {Button, IconButton} from "../ui/components/Button";
import {Checkbox} from "../ui/components/Field";
import {Dialog} from "../ui/components/Dialog";
import {SlideOver} from "../ui/components/SlideOver";
import {Alert} from "../ui/components/Alert";
import {Spinner} from "../ui/components/Spinner";
import {AlertTriangleIcon, CloseIcon, FileIcon, MoreIcon} from "../ui/icons";

const DEFAULT_CHECKBOXES = {failover: false};
const DEFAULT_STOP_CHECKBOX = false;
const DEFAULT_UNPROVISION_CHECKBOXES = {dataLoss: false, serviceInterruption: false};
const DEFAULT_PURGE_CHECKBOXES = {dataLoss: false, configLoss: false, serviceInterruption: false};

/** The feedback message hides itself after a while, as the snackbar did. */
const FEEDBACK_DURATION_MS = 5000;
const TONES = {info: "info", success: "success", warning: "warning", error: "error"};

/** Number of columns of the resource table, for the rows spanning all of them. */
const COLUMNS = 6;

/** Class names of the menu entry icons: the action icons squared to 16px. */
const ICON = "flex h-4 w-4 items-center justify-center text-ink-muted [&>svg]:h-4! [&>svg]:w-4!";

/** The state of a resource or an instance status, as the coloured dot told it. */
const toState = (status) => {
    if (status === "up" || status === true) return "up";
    if (status === "down" || status === false) return "down";
    if (status === "warn") return "warn";
    return "unknown";
};

const LOG_INK = {warn: "text-state-warn", error: "text-state-down"};

const NotProvisionedMark = ({label}) => {
    const {t} = useTranslation();
    return (
        <span role="img" aria-label={label} title={t("instance.notProvisionedTitle")} className="inline-flex text-state-down">
            <AlertTriangleIcon className="h-3.5 w-3.5"/>
        </span>
    );
};

/** A line of the table under a resource, spanning all columns: a note or the resource logs. */
const NoteRow = ({isEncap, children}) => (
    <tr className="border-b border-line last:border-b-0">
        <td colSpan={COLUMNS} className={`px-2 py-1 text-ink-muted ${isEncap ? "pl-8" : "pl-6"}`}>
            {children}
        </td>
    </tr>
);

const ZERO_TIME = "0001-01-01T00:00:00Z";
const hasTimestamp = (v) => !!v && v !== ZERO_TIME;

const ResourceRow = React.memo(({
                                    rid,
                                    resource,
                                    isEncap = false,
                                    instanceConfig,
                                    instanceMonitor,
                                    encapData = {},
                                    getResourceStatusLetters,
                                    menuItems,
                                    actionInProgress = false,
                                }) => {
    const {t} = useTranslation();
    const {statusString, tooltipText} = getResourceStatusLetters(
        rid,
        resource,
        instanceConfig,
        instanceMonitor,
        isEncap,
        encapData
    );

    const labelText = resource.label || t("common.notAvailable");
    const infoText = resource.info?.actions === "disabled" ? t("instance.resources.actionsDisabled") : "";
    const resourceType = resource.type || t("common.notAvailable");
    const isContainer = resourceType.toLowerCase().includes("container");
    const provisionedState = isContainer && encapData[rid]?.provisioned !== undefined
        ? encapData[rid].provisioned
        : resource?.provisioned?.state;
    const isResourceNotProvisioned = provisionedState === "false" || provisionedState === false || provisionedState === "n/a";
    const logs = resource.log || [];
    const statusLabel = resource.status || t("instance.unknown");

    return (
        <>
            <Row aria-label={t("instance.resources.row", {rid})}>
                <Cell className={`whitespace-nowrap ${isEncap ? "pl-6" : ""}`}>{rid}</Cell>
                <Cell className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                        <StatusMark state={toState(resource.status)} label={statusLabel}/>
                        <span aria-hidden="true">{statusLabel}</span>
                        {isResourceNotProvisioned && (
                            <NotProvisionedMark label={t("instance.resources.notProvisioned", {rid})}/>
                        )}
                    </span>
                </Cell>
                <Cell className="whitespace-nowrap">
                    <span
                        role="img"
                        aria-label={t("instance.resources.flagsLabel", {rid, flags: statusString})}
                        title={tooltipText}
                        className="font-mono"
                    >
                        {statusString}
                    </span>
                </Cell>
                <Cell className="whitespace-nowrap">{resourceType}</Cell>
                <Cell className="w-full max-w-0">
                    <span className="block truncate" title={infoText ? `${labelText} ${infoText}` : labelText}>
                        {labelText}
                        {infoText && <span className="ml-2 text-ink-muted">{infoText}</span>}
                    </span>
                </Cell>
                <Cell>
                    <MenuButton
                        label={t("instance.resources.actionsMenu", {rid})}
                        icon={<MoreIcon className="h-4 w-4"/>}
                        compact
                        align="end"
                        className="inline-flex align-middle"
                        disabled={actionInProgress}
                        items={menuItems}
                    />
                </Cell>
            </Row>
            {logs.length > 0 && (
                <NoteRow isEncap={isEncap}>
                    <ul aria-label={t("instance.resources.logs", {rid})} className="space-y-0.5 text-data">
                        {logs.map((log, index) => (
                            <li key={index} className={`break-words ${LOG_INK[log.level] ?? "text-ink-muted"}`}>
                                {log.level}: {log.message}
                            </li>
                        ))}
                    </ul>
                </NoteRow>
            )}
        </>
    );
});

const ObjectInstanceView = () => {
    const {t} = useTranslation();
    const {node: nodeName, objectName} = useParams();
    const decodedObjectName = decodeURIComponent(objectName);
    const {namespace, kind, name} = parseObjectPath(decodedObjectName);

    const objectInstanceStatus = useEventStore((s) => s.objectInstanceStatus);
    const instanceMonitor = useEventStore((s) => s.instanceMonitor);
    const instanceConfig = useEventStore((s) => s.instanceConfig);

    const instanceData = objectInstanceStatus?.[decodedObjectName]?.[nodeName] || {};
    const monitorData = instanceMonitor[`${nodeName}:${decodedObjectName}`] || {};
    const configData = instanceConfig[decodedObjectName]?.[nodeName] || {resources: {}};

    const resources = instanceData.resources || {};
    const encapResources = instanceData.encap || {};

    const [actionInProgress, setActionInProgress] = useState(false);
    const [snackbar, setSnackbar] = useState({open: false, message: "", severity: "success"});

    const [pendingAction, setPendingAction] = useState(null);
    // The resource a console is open on, null when none is.
    const [consoleTarget, setConsoleTarget] = useState(null);
    const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
    const [stopDialogOpen, setStopDialogOpen] = useState(false);
    const [unprovisionDialogOpen, setUnprovisionDialogOpen] = useState(false);
    const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
    const [simpleDialogOpen, setSimpleDialogOpen] = useState(false);
    const [checkboxes, setCheckboxes] = useState(DEFAULT_CHECKBOXES);
    const [stopCheckbox, setStopCheckbox] = useState(DEFAULT_STOP_CHECKBOX);
    const [unprovisionCheckboxes, setUnprovisionCheckboxes] = useState(DEFAULT_UNPROVISION_CHECKBOXES);
    const [purgeCheckboxes, setPurgeCheckboxes] = useState(DEFAULT_PURGE_CHECKBOXES);

    const [logsDrawerOpen, setLogsDrawerOpen] = useState(false);

    const [initialLoading, setInitialLoading] = useState(true);

    const isMounted = useRef(true);

    const instanceEventTypes = useMemo(() => [
        "InstanceStatusUpdated",
        "InstanceMonitorUpdated",
        "InstanceConfigUpdated",
    ], []);

    useEffect(() => {
        isMounted.current = true;

        const token = localStorage.getItem("authToken");
        if (token) {
            startEventReception(token, instanceEventTypes, decodedObjectName);
        }

        const timer = setTimeout(() => {
            if (isMounted.current) {
                setInitialLoading(false);
            }
        }, 500);

        return () => {
            isMounted.current = false;
            closeEventSource();
            clearTimeout(timer);
        };
    }, [decodedObjectName, nodeName, instanceEventTypes]);

    useEffect(() => {
        if (!snackbar.open) return;
        const timer = setTimeout(() => {
            setSnackbar((prev) => ({...prev, open: false}));
        }, FEEDBACK_DURATION_MS);
        return () => clearTimeout(timer);
    }, [snackbar]);

    const openSnackbar = useCallback((msg, sev = "success") => {
        if (isMounted.current) {
            setSnackbar({open: true, message: msg, severity: sev});
        }
    }, []);

    const closeSnackbar = useCallback(() => {
        if (isMounted.current) {
            setSnackbar((s) => ({...s, open: false}));
        }
    }, []);

    const openActionDialog = useCallback((action, context = null) => {
        if (isMounted.current) {
            if (action === "console") {
                // A console is no action to confirm: it opens a terminal
                // on the resource.
                if (context?.rid) {
                    setConsoleTarget({node: nodeName, namespace, kind, name, rid: context.rid});
                }
                return;
            }
            setPendingAction({action, ...(context ? context : {})});

            if (action === "freeze") {
                setCheckboxes(DEFAULT_CHECKBOXES);
                setConfirmDialogOpen(true);
            } else if (action === "stop") {
                setStopCheckbox(DEFAULT_STOP_CHECKBOX);
                setStopDialogOpen(true);
            } else if (action === "unprovision") {
                setUnprovisionCheckboxes(DEFAULT_UNPROVISION_CHECKBOXES);
                setUnprovisionDialogOpen(true);
            } else if (action === "purge") {
                setPurgeCheckboxes(DEFAULT_PURGE_CHECKBOXES);
                setPurgeDialogOpen(true);
            } else {
                setSimpleDialogOpen(true);
            }
        }
    }, [nodeName, namespace, kind, name]);

    const handleDialogConfirm = useCallback(async () => {
        if (!pendingAction || !pendingAction.action) {
            console.warn("No valid pendingAction or action provided:", pendingAction);
            setPendingAction(null);
            setConfirmDialogOpen(false);
            setStopDialogOpen(false);
            setUnprovisionDialogOpen(false);
            setPurgeDialogOpen(false);
            setSimpleDialogOpen(false);
            return;
        }

        const token = localStorage.getItem("authToken");
        if (!token) {
            openSnackbar(t("instance.feedback.authTokenNotFound"), "error");
            return;
        }

        setActionInProgress(true);
        const {action} = pendingAction;

        try {
            let url;
            let message;
            const endpoint = INSTANCE_ACTIONS.find((a) => a.name === action)?.endpoint ?? action;

            if (pendingAction.rid) {
                url = `${URL_NODE}/${nodeName}/instance/path/${namespace}/${kind}/${name}/action/${action}?rid=${encodeURIComponent(pendingAction.rid)}`;
                message = t("instance.feedback.executingOnResource", {action, rid: pendingAction.rid});
            } else {
                url = `${URL_NODE}/${nodeName}/instance/path/${namespace}/${kind}/${name}/action/${endpoint}`;
                message = t("instance.feedback.executingOnInstance", {action});
            }

            openSnackbar(message, "info");

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                const serverError = await getResponseErrorMessage(response);
                openSnackbar(
                    serverError
                        ? t("instance.feedback.failedWithDetail", {status: response.status, detail: serverError})
                        : t("instance.feedback.failed", {status: response.status}),
                    "error"
                );
                return;
            }

            openSnackbar(t("instance.feedback.succeeded", {action}), "success");
        } catch (err) {
            openSnackbar(t("instance.feedback.error", {message: err.message}), "error");
        } finally {
            if (isMounted.current) {
                setActionInProgress(false);
                setPendingAction(null);
                setConfirmDialogOpen(false);
                setStopDialogOpen(false);
                setUnprovisionDialogOpen(false);
                setPurgeDialogOpen(false);
                setSimpleDialogOpen(false);
            }
        }
    }, [nodeName, namespace, kind, name, pendingAction, openSnackbar, t]);

    const handleInstanceAction = useCallback((action) => {
        openActionDialog(action, {node: nodeName});
    }, [nodeName, openActionDialog]);

    const handleResourceAction = useCallback((action, rid) => {
        openActionDialog(action, {node: nodeName, rid});
    }, [nodeName, openActionDialog]);

    const getResourceStatusLetters = useCallback((rid, resourceData, instanceConfig, instanceMonitor, isEncap = false, encapData = {}) => {
        const letters = [".", ".", ".", ".", ".", ".", ".", "."];
        const tooltipDescriptions = [
            t("instance.flags.notRunning"),
            t("instance.flags.notMonitored"),
            t("instance.flags.enabled"),
            t("instance.flags.notOptional"),
            isEncap ? t("instance.flags.encap") : t("instance.flags.notEncap"),
            t("instance.flags.provisioned"),
            t("instance.flags.notStandby"),
            t("instance.flags.noRestart"),
        ];

        if (resourceData?.running !== undefined) {
            letters[0] = resourceData.running ? "R" : ".";
            tooltipDescriptions[0] = resourceData.running ? t("instance.flags.running") : t("instance.flags.notRunning");
        }

        const isMonitored = instanceConfig?.resources?.[rid]?.is_monitored;
        if (isMonitored === true || isMonitored === "true") {
            letters[1] = "M";
            tooltipDescriptions[1] = t("instance.flags.monitored");
        }

        const isDisabled = instanceConfig?.resources?.[rid]?.is_disabled;
        if (isDisabled === true || isDisabled === "true") {
            letters[2] = "D";
            tooltipDescriptions[2] = t("instance.flags.disabled");
        }

        if (resourceData?.optional === true || resourceData?.optional === "true") {
            letters[3] = "O";
            tooltipDescriptions[3] = t("instance.flags.optional");
        }

        if (isEncap) {
            letters[4] = "E";
            tooltipDescriptions[4] = t("instance.flags.encap");
        }

        let provisionedState = resourceData?.provisioned?.state;
        const isContainer = resourceData?.type?.toLowerCase().includes("container");
        if (isContainer && encapData[rid]?.provisioned !== undefined) {
            provisionedState = encapData[rid].provisioned;
        }

        if (provisionedState === "false" || provisionedState === false || provisionedState === "n/a") {
            letters[5] = "P";
            tooltipDescriptions[5] = t("instance.flags.notProvisioned");
        } else if (provisionedState === "true" || provisionedState === true) {
            tooltipDescriptions[5] = t("instance.flags.provisioned");
        } else {
            tooltipDescriptions[5] = t("instance.flags.provisioned");
        }

        const isStandby = instanceConfig?.resources?.[rid]?.is_standby;
        if (isStandby === true || isStandby === "true") {
            letters[6] = "S";
            tooltipDescriptions[6] = t("instance.flags.standby");
        }

        const configRestarts = instanceConfig?.resources?.[rid]?.restart;
        const monitorRestarts = instanceMonitor?.resources?.[rid]?.restart?.remaining;
        let remainingRestarts;
        if (typeof configRestarts === "number" && configRestarts > 0) {
            remainingRestarts = configRestarts;
        } else if (typeof monitorRestarts === "number") {
            remainingRestarts = monitorRestarts;
        }

        if (typeof remainingRestarts === "number") {
            letters[7] = remainingRestarts === 0 ? "." : remainingRestarts > 10 ? "+" : remainingRestarts.toString();
            tooltipDescriptions[7] =
                remainingRestarts === 0
                    ? t("instance.flags.noRestart")
                    : remainingRestarts > 10
                        ? t("instance.flags.moreThan10Restarts")
                        : t("instance.flags.restartsRemaining", {count: remainingRestarts});
        }

        const statusString = letters.join("");
        const tooltipText = tooltipDescriptions.join(", ");
        return {statusString, tooltipText};
    }, [t]);

    const getFilteredResourceActions = useCallback((resourceType) => {
        if (!resourceType) {
            return RESOURCE_ACTIONS;
        }
        const typePrefix = resourceType.split('.')[0].toLowerCase();
        if (typePrefix === 'task') {
            return RESOURCE_ACTIONS.filter(action => action.name === 'run');
        }
        if (['fs', 'disk', 'app'].includes(typePrefix)) {
            return RESOURCE_ACTIONS.filter(action => action.name !== 'run' && action.name !== 'console');
        }
        if (typePrefix === 'container') {
            return RESOURCE_ACTIONS.filter(action => action.name !== 'run');
        }
        return RESOURCE_ACTIONS;
    }, []);

    const getResourceType = useCallback((rid) => {
        const topLevelType = resources[rid]?.type;
        if (topLevelType) {
            return topLevelType;
        }
        for (const containerId of Object.keys(encapResources)) {
            const encapType = encapResources[containerId]?.resources?.[rid]?.type;
            if (encapType) {
                return encapType;
            }
        }
        return '';
    }, [resources, encapResources]);

    /** The entries of the action menu of a resource, filtered by its type. */
    const resourceMenuItems = useCallback((rid) =>
        getFilteredResourceActions(getResourceType(rid)).map(({name, icon}) => ({
            key: name,
            label: actionLabel(name),
            icon: <span aria-hidden="true" className={ICON}>{icon}</span>,
            onSelect: () => handleResourceAction(name, rid),
        })), [getFilteredResourceActions, getResourceType, handleResourceAction]);

    const instanceStatus = instanceData.avail || 'unknown';
    const isFrozen = hasTimestamp(instanceData.frozen_at);
    const isStopped = hasTimestamp(instanceData.stopped_at);
    const isLagging = hasTimestamp(instanceData.rpo_breached_at);
    const isInstanceNotProvisioned = instanceData.provisioned !== undefined ? !instanceData.provisioned : false;

    const filteredInstanceActions = useMemo(() => {
        return INSTANCE_ACTIONS.filter(({name}) => {
            if (name === 'freeze') return !isFrozen;
            if (name === 'unfreeze') return isFrozen;
            return true;
        });
    }, [isFrozen]);

    if (initialLoading) {
        return (
            <div className="flex justify-center p-4 py-8">
                <Spinner label={t("instance.view.loading")}/>
            </div>
        );
    }

    const resourceIds = Object.keys(resources);
    const rowProps = {
        instanceConfig: configData,
        instanceMonitor: monitorData,
        getResourceStatusLetters,
        actionInProgress,
    };

    return (
        <div className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0">
                    {/* The kind icon before the name, as in the object page header. */}
                    <h1 className="flex items-center gap-2 text-title font-semibold break-all">
                        <ObjectIcon kind={om3ObjectKind(parseObjectPath(decodedObjectName).kind)} className="h-5 w-5"/>
                        {decodedObjectName}
                    </h1>
                    <p className="text-ink-muted">{t("instance.view.node", {node: nodeName})}</p>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <StatusBadge state={toState(instanceStatus)} label={instanceStatus}/>
                    {monitorData.state && monitorData.state !== 'idle' && (
                        <span className="text-ink-muted">{monitorData.state}</span>
                    )}
                    {isStopped && <StoppedMark stoppedAt={instanceData.stopped_at} label={t("instance.view.stopped")}/>}
                    {isLagging && <RpoBreachedMark/>}
                    {isInstanceNotProvisioned && <NotProvisionedMark label={t("instance.view.notProvisioned")}/>}
                    <FrozenMark frozen={!!isFrozen}/>
                    <IconButton label={t("instance.view.viewLogs", {name: decodedObjectName})} onClick={() => setLogsDrawerOpen(true)}>
                        <FileIcon className="h-4 w-4"/>
                    </IconButton>
                    <MenuButton
                        label={t("instance.view.actionsMenu")}
                        align="end"
                        disabled={actionInProgress}
                        items={filteredInstanceActions.map(({name, icon}) => ({
                            key: name,
                            label: actionLabel(name),
                            icon: <span aria-hidden="true" className={ICON}>{icon}</span>,
                            onSelect: () => handleInstanceAction(name),
                        }))}
                    />
                </div>
            </div>

            {actionInProgress && <Spinner label={t("instance.view.actionInProgress")}/>}

            {snackbar.open && (
                <Alert
                    tone={TONES[snackbar.severity] ?? "info"}
                    action={
                        <IconButton label={t("instance.view.dismiss")} bare onClick={closeSnackbar}>
                            <CloseIcon className="h-4 w-4"/>
                        </IconButton>
                    }
                >
                    {snackbar.message}
                </Alert>
            )}

            <h2 className="font-semibold">{t("instance.view.resourcesHeading", {count: resourceIds.length})}</h2>

            {/* Wider than a phone: the table scrolls sideways there rather than wrap its 30px rows. */}
            <Table aria-label={t("instance.resources.tableLabel")} tableClassName="min-w-[40rem]">
                <thead>
                <HeaderRow>
                    <HeaderCell>{t("instance.resources.columns.resource")}</HeaderCell>
                    <HeaderCell>{t("common.status")}</HeaderCell>
                    <HeaderCell>{t("instance.resources.columns.flags")}</HeaderCell>
                    <HeaderCell>{t("common.type")}</HeaderCell>
                    <HeaderCell>{t("instance.resources.columns.label")}</HeaderCell>
                    <HeaderCell><span className="sr-only">{t("common.actions")}</span></HeaderCell>
                </HeaderRow>
                </thead>
                <tbody>
                {resourceIds.length === 0 ? (
                    <EmptyRow colSpan={COLUMNS}>{t("instance.resources.empty")}</EmptyRow>
                ) : resourceIds.map((rid) => {
                    const res = resources[rid] || {};
                    const isContainer = res.type?.toLowerCase().includes("container") || false;
                    const encapRes = isContainer && encapResources[rid]?.resources ? encapResources[rid].resources : {};
                    const encapResIds = Object.keys(encapRes);
                    return (
                        <React.Fragment key={rid}>
                            <ResourceRow
                                rid={rid}
                                resource={res}
                                isEncap={false}
                                encapData={encapResources}
                                menuItems={resourceMenuItems(rid)}
                                {...rowProps}
                            />
                            {isContainer && !encapResources[rid] && (
                                <NoteRow isEncap>{t("instance.resources.noEncapData", {rid})}</NoteRow>
                            )}
                            {isContainer && encapResources[rid] && !encapResources[rid].resources && (
                                <NoteRow isEncap>
                                    {t("instance.resources.encapNoResources", {rid})}
                                </NoteRow>
                            )}
                            {isContainer && encapResIds.length > 0 && res.status !== "down" &&
                                encapResIds.map((encapRid) => (
                                    <ResourceRow
                                        key={encapRid}
                                        rid={encapRid}
                                        resource={encapRes[encapRid] || {}}
                                        isEncap={true}
                                        encapData={encapResources[rid] || {}}
                                        menuItems={resourceMenuItems(encapRid)}
                                        {...rowProps}
                                    />
                                ))}
                            {isContainer && encapResIds.length === 0 && encapResources[rid]?.resources !== undefined && (
                                <NoteRow isEncap>{t("instance.resources.noEncapResources", {rid})}</NoteRow>
                            )}
                        </React.Fragment>
                    );
                })}
                </tbody>
            </Table>

            <Dialog
                open={confirmDialogOpen}
                title={t("instance.dialogs.confirmFreeze")}
                onClose={() => setConfirmDialogOpen(false)}
                size="md"
                footer={
                    <>
                        <Button onClick={() => setConfirmDialogOpen(false)}>{t("common.cancel")}</Button>
                        <Button variant="primary" onClick={handleDialogConfirm} disabled={!checkboxes.failover}>
                            {t("common.confirm")}
                        </Button>
                    </>
                }
            >
                <Checkbox
                    checked={checkboxes.failover}
                    onChange={(e) => setCheckboxes({...checkboxes, failover: e.target.checked})}
                    label={t("instance.dialogs.freezeAck")}
                />
            </Dialog>

            <Dialog
                open={stopDialogOpen}
                title={t("instance.dialogs.confirmStop")}
                onClose={() => setStopDialogOpen(false)}
                size="md"
                footer={
                    <>
                        <Button onClick={() => setStopDialogOpen(false)}>{t("common.cancel")}</Button>
                        <Button variant="primary" onClick={handleDialogConfirm} disabled={!stopCheckbox}>
                            {t("instance.dialogs.stop")}
                        </Button>
                    </>
                }
            >
                <Checkbox
                    checked={stopCheckbox}
                    onChange={(e) => setStopCheckbox(e.target.checked)}
                    label={t("instance.dialogs.stopAck")}
                />
            </Dialog>

            <Dialog
                open={unprovisionDialogOpen}
                title={t("instance.dialogs.confirmUnprovision")}
                onClose={() => setUnprovisionDialogOpen(false)}
                size="md"
                footer={
                    <>
                        <Button onClick={() => setUnprovisionDialogOpen(false)}>{t("common.cancel")}</Button>
                        <Button
                            variant="primary"
                            onClick={handleDialogConfirm}
                            disabled={!unprovisionCheckboxes.dataLoss || !unprovisionCheckboxes.serviceInterruption}
                        >
                            {t("common.confirm")}
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-2">
                    <Checkbox
                        checked={unprovisionCheckboxes.dataLoss}
                        onChange={(e) => setUnprovisionCheckboxes({
                            ...unprovisionCheckboxes,
                            dataLoss: e.target.checked
                        })}
                        label={t("instance.dialogs.dataLossAck")}
                    />
                    <Checkbox
                        checked={unprovisionCheckboxes.serviceInterruption}
                        onChange={(e) => setUnprovisionCheckboxes({
                            ...unprovisionCheckboxes,
                            serviceInterruption: e.target.checked
                        })}
                        label={t("instance.dialogs.serviceInterruptionAck")}
                    />
                </div>
            </Dialog>

            <Dialog
                open={purgeDialogOpen}
                title={t("instance.dialogs.confirmPurge")}
                onClose={() => setPurgeDialogOpen(false)}
                size="md"
                footer={
                    <>
                        <Button onClick={() => setPurgeDialogOpen(false)}>{t("common.cancel")}</Button>
                        <Button
                            variant="primary"
                            onClick={handleDialogConfirm}
                            disabled={!purgeCheckboxes.dataLoss || !purgeCheckboxes.configLoss || !purgeCheckboxes.serviceInterruption}
                        >
                            {t("common.confirm")}
                        </Button>
                    </>
                }
            >
                <div className="flex flex-col gap-2">
                    <Checkbox
                        checked={purgeCheckboxes.dataLoss}
                        onChange={(e) => setPurgeCheckboxes({...purgeCheckboxes, dataLoss: e.target.checked})}
                        label={t("instance.dialogs.dataLossAck")}
                    />
                    <Checkbox
                        checked={purgeCheckboxes.configLoss}
                        onChange={(e) => setPurgeCheckboxes({...purgeCheckboxes, configLoss: e.target.checked})}
                        label={t("instance.dialogs.configLossAck")}
                    />
                    <Checkbox
                        checked={purgeCheckboxes.serviceInterruption}
                        onChange={(e) => setPurgeCheckboxes({
                            ...purgeCheckboxes,
                            serviceInterruption: e.target.checked
                        })}
                        label={t("instance.dialogs.serviceInterruptionAck")}
                    />
                </div>
            </Dialog>

            <ConsoleTerminal
                open={consoleTarget !== null}
                target={consoleTarget}
                onClose={() => setConsoleTarget(null)}
            />

            <Dialog
                open={simpleDialogOpen}
                title={t("instance.dialogs.confirmAction", {
                    action: pendingAction?.action ? actionLabel(pendingAction.action) : t("instance.dialogs.action"),
                })}
                onClose={() => setSimpleDialogOpen(false)}
                footer={
                    <>
                        <Button onClick={() => setSimpleDialogOpen(false)}>{t("common.cancel")}</Button>
                        <Button variant="primary" onClick={handleDialogConfirm}>{t("common.confirm")}</Button>
                    </>
                }
            >
                <p>
                    <Trans
                        i18nKey={pendingAction?.rid ? "instance.dialogs.questionResource" : "instance.dialogs.questionInstance"}
                        values={{
                            action: pendingAction?.action || t("instance.dialogs.performThisAction"),
                            rid: pendingAction?.rid,
                        }}
                        components={{strong: <strong/>}}
                    />
                </p>
            </Dialog>

            <EventLogger
                eventTypes={instanceEventTypes}
                objectName={decodedObjectName}
                nodeName={nodeName}
                title={t("instance.events.title", {node: nodeName, name: decodedObjectName})}
                buttonLabel={t("instance.events.button")}
            />

            <SlideOver
                open={logsDrawerOpen}
                title={t("instance.logs.title", {node: nodeName, name: decodedObjectName})}
                onClose={() => setLogsDrawerOpen(false)}
                closeLabel={t("instance.logs.close")}
                size="wide"
                resizeLabel={t("instance.logs.resize")}
                closeOnOutsideClick={false}
            >
                {logsDrawerOpen && (
                    <LogsViewer
                        nodename={nodeName}
                        type="instance"
                        namespace={namespace}
                        kind={kind}
                        instanceName={name}
                        height="100%"
                    />
                )}
            </SlideOver>
        </div>
    );
};

export default ObjectInstanceView;
