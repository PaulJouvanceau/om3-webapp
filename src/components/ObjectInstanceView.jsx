import React, {useCallback, useEffect, useState, useRef, useMemo} from "react";
import {useParams} from "react-router-dom";
import {
    Alert,
    Box,
    Typography,
    Snackbar,
    IconButton,
    Tooltip,
    LinearProgress,
    ClickAwayListener,
    Paper,
    Popper,
    MenuItem,
    ListItemIcon,
    ListItemText,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    FormControlLabel,
    Checkbox,
    CircularProgress,
} from "@mui/material";
import {
    MoreVert as MoreVertIcon,
    FiberManualRecord as FiberManualRecordIcon,
    PriorityHigh as PriorityHighIcon,
    AcUnit as AcUnitIcon,
    Article as ArticleIcon,
    Close as CloseIcon,
} from "@mui/icons-material";
import {green, grey, orange, red, blue} from "@mui/material/colors";
import useEventStore from "../hooks/useEventStore.js";
import {URL_NODE} from "../config/apiPath.js";
import {getResponseErrorMessage} from "../services/api.jsx";
import {INSTANCE_ACTIONS, RESOURCE_ACTIONS} from "../constants/actions";
import {parseObjectPath} from "../utils/objectUtils.jsx";
import {startEventReception, closeEventSource} from "../eventSourceManager.jsx";
import EventLogger from "../components/EventLogger";
import LogsViewer from "./LogsViewer";
import {useTheme} from "@mui/material/styles";

const DEFAULT_CHECKBOXES = {failover: false};
const DEFAULT_STOP_CHECKBOX = false;
const DEFAULT_UNPROVISION_CHECKBOXES = {dataLoss: false, serviceInterruption: false};
const DEFAULT_PURGE_CHECKBOXES = {dataLoss: false, configLoss: false, serviceInterruption: false};

const ResourceRow = React.memo(({
                                    rid,
                                    resource,
                                    isEncap = false,
                                    instanceConfig,
                                    instanceMonitor,
                                    encapData = {},
                                    getColor,
                                    getResourceStatusLetters,
                                    onActionClick,
                                    actionInProgress = false,
                                }) => {
    const {statusString, tooltipText} = getResourceStatusLetters(
        rid,
        resource,
        instanceConfig,
        instanceMonitor,
        isEncap,
        encapData
    );

    const labelText = resource.label || "N/A";
    const infoText = resource.info?.actions === "disabled" ? "info: actions disabled" : "";
    const resourceType = resource.type || "N/A";
    const isContainer = resourceType.toLowerCase().includes("container");
    const provisionedState = isContainer && encapData[rid]?.provisioned !== undefined
        ? encapData[rid].provisioned
        : resource?.provisioned?.state;
    const isResourceNotProvisioned = provisionedState === "false" || provisionedState === false || provisionedState === "n/a";
    const logs = resource.log || [];
    const getLogPaddingLeft = () => {
        if (isEncap) {
            return {xs: "72px", sm: "72px"};
        } else {
            return {xs: "56px", sm: "56px"};
        }
    };

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                fontFamily: "'Roboto Mono', monospace",
                fontSize: "0.9rem",
                gap: 1,
                mb: 2,
            }}
        >
            <Box
                sx={{
                    display: "flex",
                    flexDirection: {xs: "column", sm: "row"},
                    alignItems: {xs: "flex-start", sm: "center"},
                    width: "100%",
                    gap: {xs: 1, sm: 2},
                }}
            >
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: {xs: 1, sm: 2},
                        width: "100%",
                        pl: isEncap ? {xs: 4, sm: 4} : {xs: 2, sm: 0},
                    }}
                >
                    <Typography
                        sx={{
                            minWidth: {xs: "60px", sm: "80px"},
                            fontFamily: "'Roboto Mono', monospace",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: {xs: '0.8rem', sm: '0.9rem'}
                        }}
                    >
                        {rid}
                    </Typography>
                    <Box
                        sx={{
                            display: {xs: "none", sm: "flex"},
                            alignItems: "center",
                            gap: 2,
                            flexGrow: 0,
                        }}
                    >
                        <Tooltip title={tooltipText}>
                            <Typography
                                role="status"
                                sx={{
                                    minWidth: {sm: "80px"},
                                    fontFamily: "'Roboto Mono', monospace",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    fontSize: '0.9rem'
                                }}
                                aria-label={`Resource ${rid} status: ${statusString}`}
                            >
                                {statusString}
                            </Typography>
                        </Tooltip>
                        <Typography
                            sx={{
                                minWidth: {sm: "80px"},
                                fontFamily: "'Roboto Mono', monospace",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                fontSize: '0.9rem'
                            }}
                        >
                            {resourceType}
                        </Typography>
                        <Typography
                            sx={{
                                fontFamily: "'Roboto Mono', monospace",
                                whiteSpace: "normal",
                                wordBreak: "break-word",
                                fontSize: '0.9rem'
                            }}
                        >
                            {labelText}
                            {infoText && (
                                <Typography
                                    component="span"
                                    sx={{
                                        ml: 1,
                                        color: "textSecondary",
                                        fontFamily: "'Roboto Mono', monospace",
                                        whiteSpace: "normal",
                                        wordBreak: "break-word",
                                        fontSize: '0.9rem'
                                    }}
                                >
                                    {infoText}
                                </Typography>
                            )}
                        </Typography>
                    </Box>
                    <Box
                        sx={{
                            display: {xs: "flex", sm: "none"},
                            alignItems: "center",
                            gap: 1,
                            flexShrink: 0,
                            marginLeft: "auto",
                        }}
                    >
                        <Tooltip title={resource.status || "unknown"}>
                            <FiberManualRecordIcon
                                sx={{
                                    fontSize: "1rem",
                                    color: typeof getColor === "function" ? getColor(resource.status) : grey[500]
                                }}
                            />
                        </Tooltip>
                        {isResourceNotProvisioned && (
                            <Tooltip title="Not Provisioned">
                                <PriorityHighIcon
                                    sx={{color: red[500], fontSize: "1rem"}}
                                    aria-label={`Resource ${rid} is not provisioned`}
                                />
                            </Tooltip>
                        )}
                        <Box onClick={(e) => e.stopPropagation()}>
                            <IconButton
                                onClick={(e) => {
                                    e.persist();
                                    e.stopPropagation();
                                    onActionClick(rid, e);
                                }}
                                disabled={actionInProgress}
                                aria-label={`Resource ${rid} actions`}
                                sx={{padding: '4px'}}
                            >
                                <Tooltip title="Actions">
                                    <MoreVertIcon sx={{fontSize: '1rem'}}/>
                                </Tooltip>
                            </IconButton>
                        </Box>
                    </Box>
                </Box>
                <Box
                    sx={{
                        pl: isEncap ? 4 : 2,
                        display: {xs: "block", sm: "none"},
                        width: "100%",
                    }}
                >
                    <Tooltip title={tooltipText}>
                        <Typography
                            role="status"
                            sx={{
                                fontFamily: "'Roboto Mono', monospace",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                fontSize: '0.8rem'
                            }}
                            aria-label={`Resource ${rid} status: ${statusString}`}
                        >
                            {statusString}
                        </Typography>
                    </Tooltip>
                </Box>
                <Box
                    sx={{
                        pl: isEncap ? 4 : 2,
                        display: {xs: "block", sm: "none"},
                        width: "100%",
                    }}
                >
                    <Typography
                        sx={{
                            fontFamily: "'Roboto Mono', monospace",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: '0.8rem'
                        }}
                    >
                        {resourceType}
                    </Typography>
                </Box>
                <Box
                    sx={{
                        pl: isEncap ? 4 : 2,
                        display: {xs: "block", sm: "none"},
                        width: "100%",
                    }}
                >
                    <Typography
                        sx={{
                            fontFamily: "'Roboto Mono', monospace",
                            whiteSpace: "normal",
                            wordBreak: "break-word",
                            fontSize: '0.8rem'
                        }}
                    >
                        {labelText}
                        {infoText && (
                            <Typography
                                component="span"
                                sx={{
                                    ml: 1,
                                    color: "textSecondary",
                                    fontFamily: "'Roboto Mono', monospace",
                                    whiteSpace: "normal",
                                    wordBreak: "break-word",
                                    fontSize: '0.8rem'
                                }}
                            >
                                {infoText}
                            </Typography>
                        )}
                    </Typography>
                </Box>
                <Box
                    sx={{
                        display: {xs: "none", sm: "flex"},
                        alignItems: "center",
                        gap: 1,
                        flexShrink: 0,
                        flexGrow: 1,
                        justifyContent: "flex-end",
                    }}
                >
                    <Tooltip title={resource.status || "unknown"}>
                        <FiberManualRecordIcon
                            sx={{
                                fontSize: "1rem",
                                color: typeof getColor === "function" ? getColor(resource.status) : grey[500]
                            }}
                        />
                    </Tooltip>
                    {isResourceNotProvisioned && (
                        <Tooltip title="Not Provisioned">
                            <PriorityHighIcon
                                sx={{color: red[500], fontSize: "1rem"}}
                                aria-label={`Resource ${rid} is not provisioned`}
                            />
                        </Tooltip>
                    )}
                    <Box onClick={(e) => e.stopPropagation()}>
                        <IconButton
                            onClick={(e) => {
                                e.persist();
                                e.stopPropagation();
                                onActionClick(rid, e);
                            }}
                            disabled={actionInProgress}
                            aria-label={`Resource ${rid} actions`}
                            sx={{p: 0.5}}
                        >
                            <Tooltip title="Actions">
                                <MoreVertIcon sx={{fontSize: '1rem'}}/>
                            </Tooltip>
                        </IconButton>
                    </Box>
                </Box>
            </Box>
            {logs.length > 0 && (
                <Box
                    sx={{
                        pl: getLogPaddingLeft(),
                        width: "100%",
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.5,
                        mt: 0.5,
                    }}
                >
                    {logs.map((log, index) => (
                        <Typography
                            key={index}
                            sx={{
                                fontFamily: "'Roboto Mono', monospace",
                                fontSize: "0.8rem",
                                color: log.level === "warn" ? orange[500] : log.level === "error" ? red[500] : "textSecondary",
                                whiteSpace: "normal",
                                wordBreak: "break-word",
                                lineHeight: 1.3,
                            }}
                            aria-label={`Log for resource ${rid}: ${log.level} - ${log.message}`}
                        >
                            {log.level}: {log.message}
                        </Typography>
                    ))}
                </Box>
            )}
        </Box>
    );
});

const ObjectInstanceView = () => {
    const {node: nodeName, objectName} = useParams();
    const decodedObjectName = decodeURIComponent(objectName);
    const {namespace, kind, name} = parseObjectPath(decodedObjectName);
    const theme = useTheme();

    const objectInstanceStatus = useEventStore((s) => s.objectInstanceStatus);
    const instanceMonitor = useEventStore((s) => s.instanceMonitor);
    const instanceConfig = useEventStore((s) => s.instanceConfig);

    const instanceData = objectInstanceStatus?.[decodedObjectName]?.[nodeName] || {};
    const monitorData = instanceMonitor[`${nodeName}:${decodedObjectName}`] || {};
    const configData = instanceConfig[decodedObjectName]?.[nodeName] || {resources: {}};

    const resources = instanceData.resources || {};
    const encapResources = instanceData.encap || {};

    const [resourceMenuAnchor, setResourceMenuAnchor] = useState(null);
    const [instanceMenuAnchor, setInstanceMenuAnchor] = useState(null);
    const [currentResourceId, setCurrentResourceId] = useState(null);
    const [actionInProgress, setActionInProgress] = useState(false);
    const [snackbar, setSnackbar] = useState({open: false, message: "", severity: "success"});

    const [pendingAction, setPendingAction] = useState(null);
    const [consoleDialogOpen, setConsoleDialogOpen] = useState(false);

    const [consoleUrlDialogOpen, setConsoleUrlDialogOpen] = useState(false);
    const [currentConsoleUrl, setCurrentConsoleUrl] = useState(null);
    const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
    const [stopDialogOpen, setStopDialogOpen] = useState(false);
    const [unprovisionDialogOpen, setUnprovisionDialogOpen] = useState(false);
    const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
    const [simpleDialogOpen, setSimpleDialogOpen] = useState(false);
    const [seats, setSeats] = useState(1);
    const [greetTimeout, setGreetTimeout] = useState("5s");
    const [checkboxes, setCheckboxes] = useState(DEFAULT_CHECKBOXES);
    const [stopCheckbox, setStopCheckbox] = useState(DEFAULT_STOP_CHECKBOX);
    const [unprovisionCheckboxes, setUnprovisionCheckboxes] = useState(DEFAULT_UNPROVISION_CHECKBOXES);
    const [purgeCheckboxes, setPurgeCheckboxes] = useState(DEFAULT_PURGE_CHECKBOXES);

    const [logsDrawerOpen, setLogsDrawerOpen] = useState(false);
    const [drawerWidth, setDrawerWidth] = useState(600);
    const minDrawerWidth = 300;
    const maxDrawerWidth = window.innerWidth * 0.8;

    const [initialLoading, setInitialLoading] = useState(true);
    const [isResizing, setIsResizing] = useState(false);

    const isMounted = useRef(true);
    const startXRef = useRef(0);
    const startWidthRef = useRef(0);
    const isDraggingRef = useRef(false);

    const instanceEventTypes = useMemo(() => [
        "InstanceStatusUpdated",
        "InstanceMonitorUpdated",
        "InstanceConfigUpdated",
    ], []);

    useEffect(() => {
        isMounted.current = true;

        const token = localStorage.getItem("authToken");
        if (token) {
            const filters = instanceEventTypes.map(type => {
                if (["CONNECTION_OPENED", "CONNECTION_ERROR", "RECONNECTION_ATTEMPT", "MAX_RECONNECTIONS_REACHED", "CONNECTION_CLOSED"].includes(type)) {
                    return type;
                } else {
                    return `${type},path=${decodedObjectName},node=${nodeName}`;
                }
            });

            startEventReception(token, filters);
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
            setPendingAction({action, ...(context ? context : {})});
            setSeats(1);
            setGreetTimeout("5s");

            if (action === "console") {
                setConsoleDialogOpen(true);
            } else if (action === "freeze") {
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
    }, []);

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
            openSnackbar("Auth token not found.", "error");
            return;
        }

        setActionInProgress(true);
        const {action} = pendingAction;

        try {
            let url;
            let message;

            if (pendingAction.rid) {
                if (action === "console") {
                    url = `${URL_NODE}/${nodeName}/instance/path/${namespace}/${kind}/${name}/console?rid=${encodeURIComponent(pendingAction.rid)}&seats=${seats}&greet_timeout=${encodeURIComponent(greetTimeout)}`;
                    message = `Opening console for resource ${pendingAction.rid}...`;
                } else {
                    url = `${URL_NODE}/${nodeName}/instance/path/${namespace}/${kind}/${name}/action/${action}?rid=${encodeURIComponent(pendingAction.rid)}`;
                    message = `Executing ${action} on resource ${pendingAction.rid}...`;
                }
            } else {
                url = `${URL_NODE}/${nodeName}/instance/path/${namespace}/${kind}/${name}/action/${action}`;
                message = `Executing ${action} on instance...`;
            }

            openSnackbar(message, "info");

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    ...(action === "console" ? {"Content-Type": "application/json"} : {})
                },
            });

            if (!response.ok) {
                const serverError = await getResponseErrorMessage(response);
                openSnackbar(
                    `Failed: HTTP ${response.status}${serverError ? ` - ${serverError}` : ""}`,
                    "error"
                );
                return;
            }

            if (action === "console") {
                const consoleUrl = response.headers.get('Location');
                if (consoleUrl) {
                    setCurrentConsoleUrl(consoleUrl);
                    setConsoleUrlDialogOpen(true);
                    openSnackbar(`Console URL retrieved for resource '${pendingAction.rid}'`);
                } else {
                    openSnackbar('Failed to open console: Console URL not found in response', "error");
                }
            } else {
                openSnackbar(`Action '${action}' succeeded`, "success");
            }
        } catch (err) {
            openSnackbar(`Error: ${err.message}`, "error");
        } finally {
            if (isMounted.current) {
                setActionInProgress(false);
                setPendingAction(null);
                setConfirmDialogOpen(false);
                setStopDialogOpen(false);
                setUnprovisionDialogOpen(false);
                setPurgeDialogOpen(false);
                setSimpleDialogOpen(false);
                setConsoleDialogOpen(false);
                setInstanceMenuAnchor(null);
                setResourceMenuAnchor(null);
            }
        }
    }, [nodeName, namespace, kind, name, pendingAction, seats, greetTimeout, openSnackbar]);

    const handleInstanceAction = useCallback((action) => {
        openActionDialog(action, {node: nodeName});
    }, [nodeName, openActionDialog]);

    const handleResourceAction = useCallback((action, rid = null) => {
        openActionDialog(action, {node: nodeName, rid: rid || currentResourceId});
    }, [nodeName, currentResourceId, openActionDialog]);

    const getColor = useCallback((status) => {
        if (status === "up" || status === true) return green[500];
        if (status === "down" || status === false) return red[500];
        if (status === "warn") return orange[500];
        return grey[500];
    }, []);

    const getResourceStatusLetters = useCallback((rid, resourceData, instanceConfig, instanceMonitor, isEncap = false, encapData = {}) => {
        const letters = [".", ".", ".", ".", ".", ".", ".", "."];
        const tooltipDescriptions = [
            "Not Running",
            "Not Monitored",
            "Enabled",
            "Not Optional",
            isEncap ? "Encap" : "Not Encap",
            "Provisioned",
            "Not Standby",
            "No Restart",
        ];

        if (resourceData?.running !== undefined) {
            letters[0] = resourceData.running ? "R" : ".";
            tooltipDescriptions[0] = resourceData.running ? "Running" : "Not Running";
        }

        const isMonitored = instanceConfig?.resources?.[rid]?.is_monitored;
        if (isMonitored === true || isMonitored === "true") {
            letters[1] = "M";
            tooltipDescriptions[1] = "Monitored";
        }

        const isDisabled = instanceConfig?.resources?.[rid]?.is_disabled;
        if (isDisabled === true || isDisabled === "true") {
            letters[2] = "D";
            tooltipDescriptions[2] = "Disabled";
        }

        if (resourceData?.optional === true || resourceData?.optional === "true") {
            letters[3] = "O";
            tooltipDescriptions[3] = "Optional";
        }

        if (isEncap) {
            letters[4] = "E";
            tooltipDescriptions[4] = "Encap";
        }

        let provisionedState = resourceData?.provisioned?.state;
        const isContainer = resourceData?.type?.toLowerCase().includes("container");
        if (isContainer && encapData[rid]?.provisioned !== undefined) {
            provisionedState = encapData[rid].provisioned;
        }

        if (provisionedState === "false" || provisionedState === false || provisionedState === "n/a") {
            letters[5] = "P";
            tooltipDescriptions[5] = "Not Provisioned";
        } else if (provisionedState === "true" || provisionedState === true) {
            tooltipDescriptions[5] = "Provisioned";
        } else {
            tooltipDescriptions[5] = "Provisioned";
        }

        const isStandby = instanceConfig?.resources?.[rid]?.is_standby;
        if (isStandby === true || isStandby === "true") {
            letters[6] = "S";
            tooltipDescriptions[6] = "Standby";
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
                    ? "No Restart"
                    : remainingRestarts > 10
                        ? "More than 10 Restarts"
                        : `${remainingRestarts} Restart${remainingRestarts === 1 ? "" : "s"} Remaining`;
        }

        const statusString = letters.join("");
        const tooltipText = tooltipDescriptions.join(", ");
        return {statusString, tooltipText};
    }, []);

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

    const handleResourceActionClick = useCallback((rid, event) => {
        setCurrentResourceId(rid);
        setResourceMenuAnchor(event.currentTarget);
    }, []);

    const handleOpenLogs = useCallback(() => {
        setLogsDrawerOpen(true);
    }, []);

    const handleCloseLogsDrawer = useCallback(() => {
        setLogsDrawerOpen(false);
    }, []);

    const handleResizeStart = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        isDraggingRef.current = true;
        setIsResizing(true);
        startXRef.current = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        startWidthRef.current = drawerWidth;
        document.body.style.userSelect = 'none';
        document.body.style.touchAction = 'none';
        document.body.style.overflow = 'hidden';
    }, [drawerWidth]);

    const handleResizeMove = useCallback((e) => {
        if (!isDraggingRef.current) return;
        e.preventDefault();
        const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        const deltaX = startXRef.current - clientX;
        const newWidth = startWidthRef.current + deltaX;
        if (newWidth >= minDrawerWidth && newWidth <= maxDrawerWidth) {
            setDrawerWidth(newWidth);
        }
    }, [minDrawerWidth, maxDrawerWidth]);

    const handleResizeEnd = useCallback(() => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        setIsResizing(false);
        document.body.style.userSelect = '';
        document.body.style.touchAction = '';
        document.body.style.overflow = '';
    }, []);

    useEffect(() => {
        if (isResizing) {
            const onMouseMove = (e) => handleResizeMove(e);
            const onTouchMove = (e) => handleResizeMove(e);
            const onMouseUp = () => handleResizeEnd();
            const onTouchEnd = () => handleResizeEnd();
            const onTouchCancel = () => handleResizeEnd();

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('touchmove', onTouchMove, {passive: false});
            document.addEventListener('mouseup', onMouseUp);
            document.addEventListener('touchend', onTouchEnd);
            document.addEventListener('touchcancel', onTouchCancel);

            return () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('mouseup', onMouseUp);
                document.removeEventListener('touchend', onTouchEnd);
                document.removeEventListener('touchcancel', onTouchCancel);
            };
        }
    }, [isResizing, handleResizeMove, handleResizeEnd]);

    const instanceStatus = instanceData.avail || 'unknown';
    const isFrozen = instanceData.frozen_at && instanceData.frozen_at !== "0001-01-01T00:00:00Z";
    const isInstanceNotProvisioned = instanceData.provisioned !== undefined ? !instanceData.provisioned : false;

    const filteredInstanceActions = useMemo(() => {
        return INSTANCE_ACTIONS.filter(({name}) => {
            if (name === 'freeze') return !isFrozen;
            if (name === 'unfreeze') return isFrozen;
            return true;
        });
    }, [isFrozen]);

    const appBarHeight = `calc(${theme.mixins.toolbar.minHeight || 64}px + env(safe-area-inset-top, 0px))`;

    if (initialLoading) {
        return (
            <Box sx={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh'}}>
                <CircularProgress/>
                <Typography sx={{ml: 2}}>Loading instance data...</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{p: 3, maxWidth: 1400, margin: '0 auto'}}>
            <Box sx={{mb: 3}}>
                <Box sx={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                    <Box>
                        <Typography variant="h5" sx={{mb: 0.5}}>
                            {decodedObjectName}
                        </Typography>
                        <Typography variant="h6" color="primary">
                            Node: {nodeName}
                        </Typography>
                    </Box>

                    <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
                        {isInstanceNotProvisioned && (
                            <Tooltip title="Not Provisioned">
                                <PriorityHighIcon sx={{color: red[500]}}/>
                            </Tooltip>
                        )}

                        {monitorData.state && monitorData.state !== 'idle' && (
                            <Typography variant="body2" color="text.secondary">
                                {monitorData.state}
                            </Typography>
                        )}

                        <Tooltip title={instanceStatus}>
                            <FiberManualRecordIcon sx={{color: getColor(instanceStatus), fontSize: "1.5rem"}}/>
                        </Tooltip>

                        {isFrozen && (
                            <Tooltip title="frozen">
                                <AcUnitIcon sx={{color: blue[300]}}/>
                            </Tooltip>
                        )}

                        <IconButton
                            onClick={(e) => setInstanceMenuAnchor(e.currentTarget)}
                            disabled={actionInProgress}
                        >
                            <MoreVertIcon/>
                        </IconButton>

                        <Tooltip title="View instance logs">
                            <IconButton
                                onClick={handleOpenLogs}
                                color="primary"
                                aria-label={`View logs for instance ${decodedObjectName}`}
                            >
                                <ArticleIcon/>
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>
            </Box>

            {actionInProgress && <LinearProgress sx={{mb: 2}}/>}

            <Box sx={{mb: 3}}>
                <Typography variant="h6" sx={{mb: 2}}>
                    Resources ({Object.keys(resources).length})
                </Typography>

                {Object.keys(resources).length === 0 ? (
                    <Box sx={{p: 4, textAlign: 'center'}}>
                        <Typography color="textSecondary">
                            No resources found on this instance.
                        </Typography>
                    </Box>
                ) : (
                    <Box sx={{display: "flex", flexDirection: "column", gap: 1}}>
                        {Object.keys(resources).map((rid) => {
                            const res = resources[rid] || {};
                            const isContainer = res.type?.toLowerCase().includes("container") || false;
                            const encapRes = isContainer && encapResources[rid]?.resources ? encapResources[rid].resources : {};
                            const encapResIds = Object.keys(encapRes);
                            return (
                                <Box key={rid}>
                                    <ResourceRow
                                        rid={rid}
                                        resource={res}
                                        instanceConfig={configData}
                                        instanceMonitor={monitorData}
                                        isEncap={false}
                                        encapData={encapResources}
                                        getColor={getColor}
                                        getResourceStatusLetters={getResourceStatusLetters}
                                        onActionClick={handleResourceActionClick}
                                        actionInProgress={actionInProgress}
                                    />
                                    {isContainer && !encapResources[rid] && (
                                        <Box sx={{ml: 4}}>
                                            <Typography color="textSecondary">
                                                No encapsulated data available for {rid}.
                                            </Typography>
                                        </Box>
                                    )}
                                    {isContainer && encapResources[rid] && !encapResources[rid].resources && (
                                        <Box sx={{ml: 4}}>
                                            <Typography color="textSecondary">
                                                Encapsulated data found for {rid}, but no resources defined.
                                            </Typography>
                                        </Box>
                                    )}
                                    {isContainer && encapResIds.length > 0 && res.status !== "down" && (
                                        <Box sx={{ml: 4}}>
                                            {encapResIds.map((encapRid) => (
                                                <ResourceRow
                                                    key={encapRid}
                                                    rid={encapRid}
                                                    resource={encapRes[encapRid] || {}}
                                                    instanceConfig={configData}
                                                    instanceMonitor={monitorData}
                                                    isEncap={true}
                                                    encapData={encapResources[rid] || {}}
                                                    getColor={getColor}
                                                    getResourceStatusLetters={getResourceStatusLetters}
                                                    onActionClick={handleResourceActionClick}
                                                    actionInProgress={actionInProgress}
                                                />
                                            ))}
                                        </Box>
                                    )}
                                    {isContainer && encapResIds.length === 0 && encapResources[rid]?.resources !== undefined && (
                                        <Box sx={{ml: 4}}>
                                            <Typography color="textSecondary">
                                                No encapsulated resources available for {rid}.
                                            </Typography>
                                        </Box>
                                    )}
                                </Box>
                            );
                        })}
                    </Box>
                )}
            </Box>

            <Popper
                open={Boolean(instanceMenuAnchor)}
                anchorEl={instanceMenuAnchor}
                placement="bottom-end"
                sx={{zIndex: 10000}}
            >
                <ClickAwayListener onClickAway={() => setInstanceMenuAnchor(null)}>
                    <Paper sx={{minWidth: 200, boxShadow: 3}}>
                        {filteredInstanceActions.map(({name, icon}) => (
                            <MenuItem
                                key={name}
                                onClick={() => {
                                    handleInstanceAction(name);
                                    setInstanceMenuAnchor(null);
                                }}
                            >
                                <ListItemIcon>{icon}</ListItemIcon>
                                <ListItemText>{name.charAt(0).toUpperCase() + name.slice(1)}</ListItemText>
                            </MenuItem>
                        ))}
                    </Paper>
                </ClickAwayListener>
            </Popper>

            <Popper
                open={Boolean(resourceMenuAnchor)}
                anchorEl={resourceMenuAnchor}
                placement="bottom-end"
                sx={{zIndex: 10000}}
            >
                <ClickAwayListener onClickAway={() => setResourceMenuAnchor(null)}>
                    <Paper sx={{minWidth: 200, boxShadow: 3}}>
                        {currentResourceId && (() => {
                            const resourceType = getResourceType(currentResourceId);
                            const filteredActions = getFilteredResourceActions(resourceType);
                            return filteredActions.map(({name, icon}) => (
                                <MenuItem
                                    key={name}
                                    onClick={() => {
                                        handleResourceAction(name, currentResourceId);
                                        setResourceMenuAnchor(null);
                                    }}
                                >
                                    <ListItemIcon>{icon}</ListItemIcon>
                                    <ListItemText>{name.charAt(0).toUpperCase() + name.slice(1)}</ListItemText>
                                </MenuItem>
                            ));
                        })()}
                    </Paper>
                </ClickAwayListener>
            </Popper>

            <Dialog open={confirmDialogOpen} onClose={() => setConfirmDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Confirm Freeze</DialogTitle>
                <DialogContent>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={checkboxes.failover}
                                onChange={(e) => setCheckboxes({...checkboxes, failover: e.target.checked})}
                            />
                        }
                        label="I understand that the selected service orchestration will be paused."
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleDialogConfirm}
                        variant="contained"
                        disabled={!checkboxes.failover}
                    >
                        Confirm
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={stopDialogOpen} onClose={() => setStopDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Confirm Stop</DialogTitle>
                <DialogContent>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={stopCheckbox}
                                onChange={(e) => setStopCheckbox(e.target.checked)}
                            />
                        }
                        label="I understand that this may interrupt services."
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setStopDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleDialogConfirm}
                        variant="contained"
                        disabled={!stopCheckbox}
                    >
                        Stop
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={unprovisionDialogOpen} onClose={() => setUnprovisionDialogOpen(false)} maxWidth="sm"
                    fullWidth>
                <DialogTitle>Confirm Unprovision</DialogTitle>
                <DialogContent>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={unprovisionCheckboxes.dataLoss}
                                onChange={(e) => setUnprovisionCheckboxes({
                                    ...unprovisionCheckboxes,
                                    dataLoss: e.target.checked
                                })}
                            />
                        }
                        label="I understand data will be lost."
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={unprovisionCheckboxes.serviceInterruption}
                                onChange={(e) => setUnprovisionCheckboxes({
                                    ...unprovisionCheckboxes,
                                    serviceInterruption: e.target.checked
                                })}
                            />
                        }
                        label="I understand the selected services may be temporarily interrupted during failover, or durably interrupted if no failover is configured."
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setUnprovisionDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleDialogConfirm}
                        variant="contained"
                        disabled={!unprovisionCheckboxes.dataLoss || !unprovisionCheckboxes.serviceInterruption}
                    >
                        Confirm
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={purgeDialogOpen} onClose={() => setPurgeDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Confirm Purge</DialogTitle>
                <DialogContent>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={purgeCheckboxes.dataLoss}
                                onChange={(e) => setPurgeCheckboxes({...purgeCheckboxes, dataLoss: e.target.checked})}
                            />
                        }
                        label="I understand data will be lost."
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={purgeCheckboxes.configLoss}
                                onChange={(e) => setPurgeCheckboxes({...purgeCheckboxes, configLoss: e.target.checked})}
                            />
                        }
                        label="I understand the configuration will be lost."
                    />
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={purgeCheckboxes.serviceInterruption}
                                onChange={(e) => setPurgeCheckboxes({
                                    ...purgeCheckboxes,
                                    serviceInterruption: e.target.checked
                                })}
                            />
                        }
                        label="I understand the selected services may be temporarily interrupted during failover, or durably interrupted if no failover is configured."
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPurgeDialogOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleDialogConfirm}
                        variant="contained"
                        disabled={!purgeCheckboxes.dataLoss || !purgeCheckboxes.configLoss || !purgeCheckboxes.serviceInterruption}
                    >
                        Confirm
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={consoleDialogOpen} onClose={() => setConsoleDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Open Console</DialogTitle>
                <DialogContent>
                    <Typography variant="body1" sx={{mb: 2}}>
                        This will open a terminal console for the selected resource.
                    </Typography>
                    {pendingAction?.rid && (
                        <Typography variant="body2" color="primary" sx={{mb: 2, fontWeight: 'bold'}}>
                            Resource: {pendingAction.rid}
                        </Typography>
                    )}
                    <Typography variant="body2" sx={{mb: 3}}>
                        The console session will open in a new browser tab and provide shell access to the container.
                    </Typography>
                    <Box sx={{mb: 2}}>
                        <TextField
                            autoFocus
                            margin="dense"
                            label="Number of Seats"
                            type="number"
                            fullWidth
                            variant="outlined"
                            value={seats}
                            onChange={(e) => setSeats(Math.max(1, parseInt(e.target.value) || 1))}
                            helperText="Number of simultaneous users allowed in the console"
                        />
                    </Box>
                    <TextField
                        margin="dense"
                        label="Greet Timeout"
                        type="text"
                        fullWidth
                        variant="outlined"
                        value={greetTimeout}
                        onChange={(e) => setGreetTimeout(e.target.value)}
                        helperText="Time to wait for console connection (e.g., 5s, 10s)"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConsoleDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleDialogConfirm}>Open Console</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={consoleUrlDialogOpen} onClose={() => setConsoleUrlDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Console URL</DialogTitle>
                <DialogContent>
                    <Box
                        sx={{
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            padding: '12px 14px',
                            backgroundColor: '#f5f5f5',
                            marginBottom: 2,
                            overflow: 'auto',
                            maxHeight: '100px',
                            fontFamily: 'monospace',
                            fontSize: '0.875rem',
                            wordBreak: 'break-all',
                        }}
                    >
                        {currentConsoleUrl}
                    </Box>
                    <Box sx={{display: 'flex', gap: 2}}>
                        <Button
                            variant="outlined"
                            onClick={() => {
                                navigator.clipboard.writeText(currentConsoleUrl);
                                openSnackbar('URL copied to clipboard');
                            }}
                        >
                            Copy URL
                        </Button>
                        <Button
                            variant="contained"
                            onClick={() => {
                                window.open(currentConsoleUrl, '_blank', 'noopener,noreferrer');
                            }}
                        >
                            Open in New Tab
                        </Button>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConsoleUrlDialogOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={simpleDialogOpen} onClose={() => setSimpleDialogOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>
                    Confirm {pendingAction?.action ? pendingAction.action.charAt(0).toUpperCase() + pendingAction.action.slice(1) : 'Action'}
                </DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure you want to{' '}
                        <strong>{pendingAction?.action || 'perform this action'}</strong>{' '}
                        {pendingAction?.rid ? `on resource ${pendingAction.rid}` : 'on this instance'}?
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSimpleDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleDialogConfirm} variant="contained">
                        Confirm
                    </Button>
                </DialogActions>
            </Dialog>

            <EventLogger
                eventTypes={instanceEventTypes}
                objectName={decodedObjectName}
                nodeName={nodeName}
                title={`Instance Events - ${nodeName}/${decodedObjectName}`}
                buttonLabel="Instance Events"
            />

            {logsDrawerOpen && (
                <Box
                    sx={{
                        position: "fixed",
                        top: appBarHeight,
                        right: 0,
                        width: `${drawerWidth}px`,
                        maxWidth: "80vw",
                        height: `calc(100% - ${appBarHeight})`,
                        backgroundColor: theme.palette.background.paper,
                        borderLeft: `1px solid ${theme.palette.divider}`,
                        zIndex: 1200,
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                        boxShadow: theme.shadows[3],
                        transition: theme.transitions.create("width", {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.enteringScreen,
                        }),
                    }}
                >
                    <Box
                        onMouseDown={handleResizeStart}
                        onTouchStart={handleResizeStart}
                        sx={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: 24,
                            height: "100%",
                            cursor: "ew-resize",
                            bgcolor: "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            zIndex: 10,
                            touchAction: "none",
                            userSelect: "none",
                            WebkitUserSelect: "none",
                            "&::after": {
                                content: '""',
                                position: "absolute",
                                top: 0,
                                left: "50%",
                                transform: "translateX(-50%)",
                                width: 6,
                                height: "100%",
                                bgcolor: theme.palette.grey[300],
                                borderRadius: 3,
                            },
                            "&:hover::after": {
                                bgcolor: theme.palette.primary.light,
                            },
                        }}
                        aria-label="Resize drawer"
                    />

                    <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, pb: 1}}>
                        <Typography variant="h6" noWrap>
                            Instance Logs - {nodeName}/{decodedObjectName}
                        </Typography>
                        <IconButton onClick={handleCloseLogsDrawer} size="large">
                            <CloseIcon/>
                        </IconButton>
                    </Box>

                    <Box sx={{flexGrow: 1, overflow: "hidden", position: "relative"}}>
                        <LogsViewer
                            nodename={nodeName}
                            type="instance"
                            namespace={namespace}
                            kind={kind}
                            instanceName={name}
                            height="100%"
                        />
                    </Box>
                </Box>
            )}

            <Snackbar
                open={snackbar.open}
                autoHideDuration={5000}
                onClose={closeSnackbar}
                anchorOrigin={{vertical: "bottom", horizontal: "center"}}
            >
                <Alert onClose={closeSnackbar} severity={snackbar.severity} sx={{width: '100%'}}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default ObjectInstanceView;
