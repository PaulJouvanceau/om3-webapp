import React, {useEffect, useState, useMemo, useCallback, useRef, useDeferredValue} from "react";
import {useLocation, useNavigate} from "react-router-dom";
import {
    Box,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
    Button,
    MenuItem,
    Checkbox,
    TextField,
    Snackbar,
    Alert,
    ListItemIcon,
    ListItemText,
    useMediaQuery,
    useTheme,
    Tooltip,
    IconButton,
    CircularProgress,
    Collapse,
    Menu,
    FormControl,
    InputLabel,
    Select,
    OutlinedInput,
    Chip,
} from "@mui/material";
import Grid from "@mui/material/Grid";
import AcUnit from "@mui/icons-material/AcUnit";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import CloseIcon from "@mui/icons-material/Close";
import {green, red, blue, orange, grey} from "@mui/material/colors";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import FilterListIcon from "@mui/icons-material/FilterList";
import useEventStore from "../hooks/useEventStore.js";
import useFetchDaemonStatus from "../hooks/useFetchDaemonStatus";
import logger from '../utils/logger.js';
import {closeEventSource, startEventReception, forceFlush} from "../eventSourceManager";
import {URL_OBJECT} from "../config/apiPath.js";
import {extractNamespace, extractKind, isActionAllowedForSelection} from "../utils/objectUtils";
import {OBJECT_ACTIONS} from "../constants/actions";
import ActionDialogManager from "./ActionDialogManager";
import EventLogger from "../components/EventLogger";
import {useObjectData} from "../hooks/useObjectData";
import {useNodeData} from "../hooks/useNodeData";

const parseObjectName = (objectName) => {
    const parts = objectName.split("/");
    if (parts.length === 3) {
        return {namespace: parts[0], kind: parts[1], name: parts[2]};
    } else if (parts.length === 2) {
        return {namespace: "root", kind: parts[0], name: parts[1]};
    }
    return {
        namespace: "root",
        kind: objectName === "cluster" ? "ccfg" : "svc",
        name: parts[0],
    };
};

const selectObjectStatus = (state) => state.objectStatus;
const selectObjectInstanceStatus = (state) => state.objectInstanceStatus;
const selectRemoveObject = (state) => state.removeObject;

const StatusIcon = React.memo(({avail, isNotProvisioned, frozen}) => {
    return (
        <Box sx={{
            width: "80px",
            height: "24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 0.5
        }}>
            {/* Not provisioned indicator - left side */}
            <Box sx={{
                width: "24px",
                height: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                visibility: isNotProvisioned ? "visible" : "hidden"
            }}>
                {isNotProvisioned && (
                    <Tooltip title="Not Provisioned">
                        <PriorityHighIcon sx={{color: red[500], fontSize: 20}} aria-label="Object is not provisioned"/>
                    </Tooltip>
                )}
            </Box>

            <Box sx={{
                width: "24px",
                height: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
            }}>
                {avail === "up" && (
                    <Tooltip title="up">
                        <FiberManualRecordIcon sx={{color: green[500], fontSize: 24}} aria-label="Object is up"/>
                    </Tooltip>
                )}
                {avail === "down" && (
                    <Tooltip title="down">
                        <FiberManualRecordIcon sx={{color: red[500], fontSize: 24}} aria-label="Object is down"/>
                    </Tooltip>
                )}
                {avail === "warn" && (
                    <Tooltip title="warn">
                        <FiberManualRecordIcon sx={{color: orange[500], fontSize: 24}} aria-label="Object has warning"/>
                    </Tooltip>
                )}
                {avail === "n/a" && (
                    <Tooltip title="n/a">
                        <FiberManualRecordIcon sx={{color: grey[500], fontSize: 24}} aria-label="Object status is n/a"/>
                    </Tooltip>
                )}
            </Box>

            {/* Frozen indicator - right side */}
            <Box sx={{
                width: "24px",
                height: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                visibility: frozen === "frozen" ? "visible" : "hidden"
            }}>
                {frozen === "frozen" && (
                    <Tooltip title="frozen">
                        <AcUnit sx={{color: blue[600], fontSize: 20}} aria-label="Object is frozen"/>
                    </Tooltip>
                )}
            </Box>
        </Box>
    );
}, (prev, next) => prev.avail === next.avail && prev.isNotProvisioned === next.isNotProvisioned && prev.frozen === next.frozen);

const GlobalExpectDisplay = React.memo(({globalExpect}) => {
    return (
        <Box sx={{
            width: "70px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center"
        }}>
            {globalExpect && (
                <Tooltip title={globalExpect}>
                    <Typography variant="caption" sx={{
                        fontSize: "0.75rem",
                        lineHeight: "1.2",
                        maxWidth: "70px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "inline-block"
                    }}>
                        {globalExpect}
                    </Typography>
                </Tooltip>
            )}
        </Box>
    );
}, (prev, next) => prev.globalExpect === next.globalExpect);

const NodeStatusIcons = React.memo(({nodeAvail, isNodeNotProvisioned, nodeFrozen, node}) => {
    return (
        <Box sx={{
            width: "80px",
            height: "24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 0.5
        }}>
            {/* Not provisioned indicator - left side */}
            <Box sx={{
                width: "24px",
                height: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                visibility: isNodeNotProvisioned ? "visible" : "hidden"
            }}>
                {isNodeNotProvisioned && (
                    <Tooltip title="Not Provisioned">
                        <PriorityHighIcon sx={{color: red[500], fontSize: 20}}
                                          aria-label={`Node ${node} is not provisioned`}/>
                    </Tooltip>
                )}
            </Box>

            {/* Node status icon - center */}
            <Box sx={{
                width: "24px",
                height: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
            }}>
                {nodeAvail === "up" && (
                    <Tooltip title="up">
                        <FiberManualRecordIcon sx={{color: green[500], fontSize: 24}}
                                               aria-label={`Node ${node} is up`}/>
                    </Tooltip>
                )}
                {nodeAvail === "down" && (
                    <Tooltip title="down">
                        <FiberManualRecordIcon sx={{color: red[500], fontSize: 24}}
                                               aria-label={`Node ${node} is down`}/>
                    </Tooltip>
                )}
                {nodeAvail === "warn" && (
                    <Tooltip title="warn">
                        <FiberManualRecordIcon sx={{color: orange[500], fontSize: 24}}
                                               aria-label={`Node ${node} has warning`}/>
                    </Tooltip>
                )}
            </Box>

            {/* Frozen indicator - right side */}
            <Box sx={{
                width: "24px",
                height: "24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                visibility: nodeFrozen === "frozen" ? "visible" : "hidden"
            }}>
                {nodeFrozen === "frozen" && (
                    <Tooltip title="frozen">
                        <AcUnit sx={{color: blue[600], fontSize: 20}} aria-label={`Node ${node} is frozen`}/>
                    </Tooltip>
                )}
            </Box>
        </Box>
    );
}, (prev, next) => prev.nodeAvail === next.nodeAvail && prev.isNodeNotProvisioned === next.isNodeNotProvisioned && prev.nodeFrozen === next.nodeFrozen && prev.node === next.node);

const NodeStateDisplay = React.memo(({nodeState, node}) => {
    return (
        <Box sx={{
            width: "50px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center"
        }}>
            {nodeState && (
                <Tooltip title={nodeState}>
                    <Typography variant="caption" sx={{
                        fontSize: "0.75rem",
                        lineHeight: "1.2",
                        maxWidth: "50px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "inline-block"
                    }} aria-label={`Node ${node} state: ${nodeState}`}>
                        {nodeState}
                    </Typography>
                </Tooltip>
            )}
        </Box>
    );
}, (prev, next) => prev.nodeState === next.nodeState && prev.node === next.node);

const NodeStatus = React.memo(({objectName, node}) => {
    const nodeData = useNodeData(objectName, node);
    const hasData = Boolean(nodeData?.avail);
    const isNodeNotProvisioned = hasData && (nodeData.provisioned === "false" || nodeData.provisioned === false);

    return (
        <Box sx={{
            width: "130px",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
        }}>
            {hasData ? (
                <NodeStatusIcons
                    nodeAvail={nodeData.avail}
                    isNodeNotProvisioned={isNodeNotProvisioned}
                    nodeFrozen={nodeData.frozen}
                    node={node}
                />
            ) : (
                <Box sx={{width: "80px"}}/>
            )}
            {hasData ? (
                <NodeStateDisplay nodeState={nodeData.state} node={node}/>
            ) : (
                <Box sx={{width: "50px"}}/>
            )}
        </Box>
    );
}, (prev, next) => prev.objectName === next.objectName && prev.node === next.node);

const TableRowComponent = React.memo(({
                                          objectName,
                                          isSelected,
                                          onSelectObject,
                                          onObjectClick,
                                          onRowMenuOpen,
                                          allNodes,
                                          isWideScreen,
                                      }) => {
    const objectData = useObjectData(objectName);
    const handleCheckboxChange = useCallback((e) => {
        onSelectObject(e, objectName);
    }, [onSelectObject, objectName]);
    const handleRowClick = useCallback(() => {
        onObjectClick(objectName);
    }, [onObjectClick, objectName]);
    const handleMenuOpen = useCallback((e) => {
        e.stopPropagation();
        onRowMenuOpen(e, objectName);
    }, [onRowMenuOpen, objectName]);
    const handleCheckboxClick = useCallback((e) => {
        e.stopPropagation();
    }, []);

    return (
        <TableRow onClick={handleRowClick} sx={{cursor: "pointer"}}>
            <TableCell sx={{
                padding: "16px 0px 16px 16px",
                minWidth: "60px",
                width: "60px",
                maxWidth: "60px",
                boxSizing: "border-box"
            }}>
                <Checkbox
                    checked={isSelected}
                    onChange={handleCheckboxChange}
                    onClick={handleCheckboxClick}
                    aria-label={`Select object ${objectName}`}
                />
            </TableCell>
            <TableCell sx={{
                minWidth: "150px",
                width: "150px",
                maxWidth: "150px",
                position: "relative",
                height: "100%",
                padding: "16px 8px",
                boxSizing: "border-box"
            }}>
                <Box sx={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                }}>
                    <StatusIcon
                        avail={objectData.avail}
                        isNotProvisioned={objectData.isNotProvisioned}
                        frozen={objectData.frozen}
                    />
                    <GlobalExpectDisplay globalExpect={objectData.globalExpect}/>
                </Box>
            </TableCell>
            <TableCell sx={{
                minWidth: "200px",
                width: "auto",
                padding: "16px 8px",
                boxSizing: "border-box",
                overflow: "hidden",
                textOverflow: "ellipsis"
            }}>
                <Typography noWrap>{objectName}</Typography>
            </TableCell>
            {isWideScreen &&
                allNodes.map((node) => (
                    <TableCell key={node} align="center" sx={{
                        minWidth: "130px",
                        width: "130px",
                        maxWidth: "130px",
                        position: "relative",
                        padding: "16px 8px",
                        boxSizing: "border-box"
                    }}>
                        <NodeStatus objectName={objectName} node={node}/>
                    </TableCell>
                ))}
            <TableCell sx={{
                minWidth: "100px",
                width: "100px",
                maxWidth: "100px",
                padding: "16px 8px",
                boxSizing: "border-box"
            }}>
                <IconButton onClick={handleMenuOpen} aria-label={`More actions for object ${objectName}`}>
                    <MoreVertIcon/>
                </IconButton>
            </TableCell>
        </TableRow>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.objectName === nextProps.objectName &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.isMenuOpen === nextProps.isMenuOpen &&
        prevProps.isWideScreen === nextProps.isWideScreen &&
        prevProps.allNodes.length === nextProps.allNodes.length &&
        prevProps.allNodes.every((node, i) => node === nextProps.allNodes[i])
    );
});

const Objects = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const isMounted = useRef(true);
    const queryParams = new URLSearchParams(location.search);
    const globalStates = useMemo(() => ["up", "down", "warn", "n/a", "unprovisioned"], []);

    // Parse multiple values from URL
    const parseMultipleValues = (param) => {
        const value = queryParams.get(param);
        if (!value || value === "all") return [];
        return value.split(',').filter(Boolean);
    };

    const rawGlobalStates = parseMultipleValues("globalState");
    const rawNamespaces = parseMultipleValues("namespace");
    const rawKinds = parseMultipleValues("kind");
    const rawSearchQuery = queryParams.get("name") || "";

    const {daemon} = useFetchDaemonStatus();
    const objectStatus = useEventStore(selectObjectStatus);
    const objectInstanceStatus = useEventStore(selectObjectInstanceStatus);
    const removeObject = useEventStore(selectRemoveObject);
    const [selectedObjects, setSelectedObjects] = useState([]);
    const [actionsMenuAnchor, setActionsMenuAnchor] = useState(null);
    const [rowMenuAnchor, setRowMenuAnchor] = useState(null);
    const [currentObject, setCurrentObject] = useState(null);
    const [selectedNamespaces, setSelectedNamespaces] = useState(rawNamespaces);
    const [selectedKinds, setSelectedKinds] = useState(rawKinds);
    const [selectedGlobalStates, setSelectedGlobalStates] = useState(rawGlobalStates);
    const [snackbar, setSnackbar] = useState({open: false, message: "", severity: "info"});
    const [pendingAction, setPendingAction] = useState(null);
    const [searchQuery, setSearchQuery] = useState(rawSearchQuery);
    const [sortColumn, setSortColumn] = useState("object");
    const [sortDirection, setSortDirection] = useState("asc");
    const [statusCycleIndex, setStatusCycleIndex] = useState(0);
    const theme = useTheme();
    const isWideScreen = useMediaQuery(theme.breakpoints.up("lg"));
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const objectEventTypes = useMemo(() => [
        "ObjectStatusUpdated",
        "InstanceStatusUpdated",
        "ObjectDeleted",
        "InstanceMonitorUpdated",
        "CONNECTION_OPENED",
        "CONNECTION_ERROR",
        "RECONNECTION_ATTEMPT",
        "MAX_RECONNECTIONS_REACHED",
        "CONNECTION_CLOSED"
    ], []);

    const [showFilters, setShowFilters] = useState(() => isWideScreen ? true : !isMobile);

    const deferredSearchQuery = useDeferredValue(searchQuery);
    const deferredSelectedGlobalStates = useDeferredValue(selectedGlobalStates);
    const deferredSelectedNamespaces = useDeferredValue(selectedNamespaces);
    const deferredSelectedKinds = useDeferredValue(selectedKinds);
    const deferredSortColumn = useDeferredValue(sortColumn);
    const deferredSortDirection = useDeferredValue(sortDirection);
    const deferredStatusCycleIndex = useDeferredValue(statusCycleIndex);

    const [visibleCount, setVisibleCount] = useState(30);
    const [loading, setLoading] = useState(false);
    const tableContainerRef = useRef(null);

    // Generate unique IDs for form labels
    const globalStateId = React.useId();
    const namespaceId = React.useId();
    const kindId = React.useId();
    const nameSearchId = React.useId();

    const objects = useMemo(
        () => (Object.keys(objectStatus).length ? objectStatus : daemon?.cluster?.object || {}),
        [objectStatus, daemon]
    );

    const allObjectNames = useMemo(
        () => Object.keys(objects).filter((key) => key && typeof objects[key] === "object"),
        [objects]
    );

    const {namespaces, kinds} = useMemo(() => {
        const nsSet = new Set();
        const kindSet = new Set();

        for (let i = 0; i < allObjectNames.length; i++) {
            const name = allObjectNames[i];
            nsSet.add(extractNamespace(name));
            kindSet.add(extractKind(name));
        }

        return {
            namespaces: Array.from(nsSet).sort(),
            kinds: Array.from(kindSet).sort()
        };
    }, [allObjectNames]);

    const allNodes = useMemo(() => {
        const nodeSet = new Set();
        const objNames = Object.keys(objectInstanceStatus);

        for (let i = 0; i < objNames.length; i++) {
            const nodes = Object.keys(objectInstanceStatus[objNames[i]] || {});
            for (let j = 0; j < nodes.length; j++) {
                nodeSet.add(nodes[j]);
            }
        }

        return Array.from(nodeSet).sort();
    }, [objectInstanceStatus]);

    const filteredObjectNames = useMemo(() => {
        const result = [];
        const searchLower = deferredSearchQuery.toLowerCase();
        const hasSearch = searchLower.length > 0;

        for (let i = 0; i < allObjectNames.length; i++) {
            const name = allObjectNames[i];

            if (hasSearch && !name.toLowerCase().includes(searchLower)) {
                continue;
            }

            // Check namespace filter (multiple selection)
            if (deferredSelectedNamespaces.length > 0 && !deferredSelectedNamespaces.includes(extractNamespace(name))) {
                continue;
            }

            // Check kind filter (multiple selection)
            if (deferredSelectedKinds.length > 0 && !deferredSelectedKinds.includes(extractKind(name))) {
                continue;
            }

            // Check global state filter (multiple selection)
            if (deferredSelectedGlobalStates.length > 0) {
                const status = objects[name];
                if (!status) continue;

                const rawAvail = status.avail;
                const validStatuses = ["up", "down", "warn"];
                const avail = validStatuses.includes(rawAvail) ? rawAvail : "n/a";
                const provisioned = status.provisioned;

                let matchesAnyGlobalState = false;
                for (let j = 0; j < deferredSelectedGlobalStates.length; j++) {
                    const selectedState = deferredSelectedGlobalStates[j];
                    if (selectedState === "unprovisioned") {
                        if (provisioned === "false" || provisioned === false) {
                            matchesAnyGlobalState = true;
                            break;
                        }
                    } else if (avail === selectedState) {
                        matchesAnyGlobalState = true;
                        break;
                    }
                }

                if (!matchesAnyGlobalState) continue;
            }

            result.push(name);
        }

        return result;
    }, [allObjectNames, deferredSelectedGlobalStates, deferredSelectedNamespaces,
        deferredSelectedKinds, deferredSearchQuery, objects]);

    const getStatusOrder = (cycleIndex) => {
        const statuses = ["n/a", "up", "warn", "down"];
        const order = {};
        for (let i = 0; i < statuses.length; i++) {
            order[statuses[i]] = (i - cycleIndex + statuses.length) % statuses.length;
        }
        return order;
    };

    const sortedObjectNames = useMemo(() => {
        const validStatuses = ["up", "down", "warn"];

        if (deferredSortColumn === "object") {
            const sorted = [...filteredObjectNames].sort((a, b) => a.localeCompare(b));
            return deferredSortDirection === "asc" ? sorted : sorted.reverse();
        }

        if (deferredSortColumn === "status" || allNodes.includes(deferredSortColumn)) {
            const statusOrder = getStatusOrder(deferredStatusCycleIndex);
            const compareFn = (a, b) => {
                let statusA, statusB;
                if (deferredSortColumn === "status") {
                    statusA = objectStatus[a]?.avail || "n/a";
                    statusB = objectStatus[b]?.avail || "n/a";
                    statusA = validStatuses.includes(statusA) ? statusA : "n/a";
                    statusB = validStatuses.includes(statusB) ? statusB : "n/a";
                } else {
                    const getNodeAvail = (objName) => {
                        return objectInstanceStatus[objName]?.[deferredSortColumn]?.avail || "n/a";
                    };
                    statusA = getNodeAvail(a);
                    statusB = getNodeAvail(b);
                }
                return (statusOrder[statusA] || 0) - (statusOrder[statusB] || 0);
            };
            return [...filteredObjectNames].sort(compareFn);
        }

        return filteredObjectNames;
    }, [filteredObjectNames, deferredSortColumn, deferredSortDirection, deferredStatusCycleIndex, objectStatus, objectInstanceStatus, allNodes]);

    const visibleObjectNames = useMemo(() => {
        return sortedObjectNames.slice(0, visibleCount);
    }, [sortedObjectNames, visibleCount]);

    const handleSelectObject = useCallback((event, objectName) => {
        setSelectedObjects((prev) =>
            event.target.checked ? [...prev, objectName] : prev.filter((obj) => obj !== objectName)
        );
    }, []);

    const handleActionsMenuOpen = useCallback((event) => {
        setActionsMenuAnchor(event.currentTarget);
    }, []);

    const handleActionsMenuClose = useCallback(() => {
        setActionsMenuAnchor(null);
    }, []);

    const handleRowMenuOpen = useCallback((event, objectName) => {
        setRowMenuAnchor(event.currentTarget);
        setCurrentObject(objectName);
    }, []);

    const handleRowMenuClose = useCallback(() => {
        setRowMenuAnchor(null);
        setCurrentObject(null);
    }, []);

    const handleActionClick = useCallback(
        (action, isSingleObject = false, objectName = null) => {
            setPendingAction({action, target: isSingleObject ? objectName : null});
            if (isSingleObject) handleRowMenuClose();
            else handleActionsMenuClose();
        },
        [handleRowMenuClose, handleActionsMenuClose]
    );

    const updateFrozenStatusOptimistic = useCallback((objectName, newFrozenValue) => {
        const store = useEventStore.getState();
        const currentStatus = store.objectStatus[objectName];
        if (currentStatus) {
            store.setObjectStatuses({
                ...store.objectStatus,
                [objectName]: {...currentStatus, frozen: newFrozenValue}
            });
        }
    }, []);

    const handleExecuteActionOnSelected = useCallback(
        async (action) => {
            const token = localStorage.getItem("authToken");
            if (!token) {
                setSnackbar({open: true, message: "Authentication token not found", severity: "error"});
                return;
            }
            setSnackbar({open: true, message: `Executing '${action}'...`, severity: "info"});
            let successCount = 0;
            let errorCount = 0;
            const objectsToProcess = pendingAction?.target ? [pendingAction.target] : selectedObjects;
            const promises = objectsToProcess.map(async (objectName) => {
                const rawObj = objectStatus[objectName];
                if (!rawObj) {
                    errorCount++;
                    return;
                }
                const {namespace, kind, name} = parseObjectName(objectName);
                if ((action === "freeze" && rawObj.frozen === "frozen") || (action === "unfreeze" && rawObj.frozen === "unfrozen")) {
                    errorCount++;
                    return;
                }
                const url = `${URL_OBJECT}/${namespace}/${kind}/${name}/action/${action}`;
                try {
                    const response = await fetch(url, {
                        method: "POST",
                        headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
                    });
                    if (!response.ok) {
                        const error = new Error(`HTTP error! status: ${response.status}`);
                        logger.error(`Failed to execute ${action} on ${objectName}:`, error);
                        errorCount++;
                        return;
                    }
                    successCount++;

                    if (action === "freeze") {
                        updateFrozenStatusOptimistic(objectName, "frozen");
                    } else if (action === "unfreeze") {
                        updateFrozenStatusOptimistic(objectName, "unfrozen");
                    } else if (action === "delete") {
                        removeObject(objectName);
                    }
                } catch (error) {
                    logger.error(`Failed to execute ${action} on ${objectName}:`, error);
                    errorCount++;
                }
            });
            await Promise.all(promises);

            forceFlush();

            setSnackbar({
                open: true,
                message:
                    successCount && !errorCount
                        ? `'${action}' succeeded on ${successCount} object(s).`
                        : successCount
                            ? `'${action}' partially succeeded: ${successCount} ok, ${errorCount} errors.`
                            : `'${action}' failed on all ${objectsToProcess.length} object(s).`,
                severity: successCount && !errorCount ? "success" : successCount ? "warning" : "error",
            });
            setSelectedObjects([]);
            setPendingAction(null);
        },
        [pendingAction, selectedObjects, objectStatus, removeObject, updateFrozenStatusOptimistic]
    );

    const handleObjectClick = useCallback(
        (objectName) => {
            if (objectInstanceStatus[objectName]) navigate(`/objects/${encodeURIComponent(objectName)}`);
        },
        [objectInstanceStatus, navigate]
    );

    const handleSort = useCallback((column) => {
        if (column === "status" || allNodes.includes(column)) {
            if (sortColumn === column) {
                setStatusCycleIndex((prev) => (prev + 1) % 4);
            } else {
                setSortColumn(column);
                setStatusCycleIndex(0);
            }
            setSortDirection("asc");
        } else {
            if (sortColumn === column) {
                setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
            } else {
                setSortColumn(column);
                setSortDirection("asc");
            }
            setStatusCycleIndex(0);
        }
        setVisibleCount(30);
    }, [sortColumn, allNodes]);

    const handleSearchChange = useCallback((e) => {
        setSearchQuery(e.target.value);
        setVisibleCount(30);
    }, []);

    const toggleShowFilters = useCallback(() => {
        setShowFilters(prev => !prev);
    }, []);

    const handleGlobalStateChange = useCallback((state) => {
        setSelectedGlobalStates(prev => {
            if (prev.includes(state)) {
                return prev.filter(s => s !== state);
            } else {
                return [...prev, state];
            }
        });
    }, []);

    const handleNamespaceChange = useCallback((namespace) => {
        setSelectedNamespaces(prev => {
            if (prev.includes(namespace)) {
                return prev.filter(ns => ns !== namespace);
            } else {
                return [...prev, namespace];
            }
        });
    }, []);

    const handleKindChange = useCallback((kind) => {
        setSelectedKinds(prev => {
            if (prev.includes(kind)) {
                return prev.filter(k => k !== kind);
            } else {
                return [...prev, kind];
            }
        });
    }, []);

    const handleGlobalStateSelectChange = (event) => {
        setSelectedGlobalStates(event.target.value);
    };

    const handleNamespaceSelectChange = (event) => {
        setSelectedNamespaces(event.target.value);
    };

    const handleKindSelectChange = (event) => {
        setSelectedKinds(event.target.value);
    };

    const handleScroll = useCallback(() => {
        if (loading) return;

        const container = tableContainerRef.current;
        if (!container) return;

        const {scrollTop, scrollHeight, clientHeight} = container;
        const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

        if (scrollPercentage > 0.8 && visibleCount < sortedObjectNames.length) {
            setLoading(true);
            setTimeout(() => {
                setVisibleCount(prev => Math.min(prev + 30, sortedObjectNames.length));
                setLoading(false);
            }, 100);
        }
    }, [loading, visibleCount, sortedObjectNames.length]);

    useEffect(() => {
        const container = tableContainerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
            return () => container.removeEventListener('scroll', handleScroll);
        }
    }, [handleScroll]);

    useEffect(() => {
        setVisibleCount(30);
    }, [sortedObjectNames]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (!isMounted.current) return;
            const currentParams = new URLSearchParams(location.search);
            const currentGlobalStates = parseMultipleValues("globalState");
            const currentNamespaces = parseMultipleValues("namespace");
            const currentKinds = parseMultipleValues("kind");
            const currentName = currentParams.get("name") || "";

            const arraysEqual = (a, b) => {
                if (a.length !== b.length) return false;
                const sortedA = [...a].sort();
                const sortedB = [...b].sort();
                return sortedA.every((val, idx) => val === sortedB[idx]);
            };

            if (arraysEqual(currentGlobalStates, selectedGlobalStates) &&
                arraysEqual(currentNamespaces, selectedNamespaces) &&
                arraysEqual(currentKinds, selectedKinds) &&
                currentName === searchQuery) {
                return;
            }

            const newQueryParams = new URLSearchParams();
            if (selectedGlobalStates.length > 0) newQueryParams.set("globalState", selectedGlobalStates.join(','));
            if (selectedNamespaces.length > 0) newQueryParams.set("namespace", selectedNamespaces.join(','));
            if (selectedKinds.length > 0) newQueryParams.set("kind", selectedKinds.join(','));
            if (searchQuery.trim()) newQueryParams.set("name", searchQuery.trim());

            const queryString = newQueryParams.toString();
            const newUrl = `${location.pathname}${queryString ? `?${queryString}` : ""}`;
            if (newUrl !== location.pathname + location.search) {
                navigate(newUrl, {replace: true});
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [selectedGlobalStates, selectedNamespaces, selectedKinds, searchQuery, navigate, location.pathname, location.search]);

    useEffect(() => {
        setSelectedGlobalStates(rawGlobalStates);
        setSelectedNamespaces(rawNamespaces);
        setSelectedKinds(rawKinds);
        setSearchQuery(rawSearchQuery);
    }, [location.search]);

    const eventStarted = useRef(false);
    useEffect(() => {
        const token = localStorage.getItem("authToken");
        if (token && !eventStarted.current) {
            startEventReception(token, [
                "ObjectStatusUpdated",
                "InstanceStatusUpdated",
                "ObjectDeleted",
                "InstanceMonitorUpdated",
            ]);
            eventStarted.current = true;
        }
        return () => {
            closeEventSource();
            eventStarted.current = false;
        };
    }, []);

    useEffect(() => {
        return () => {
            isMounted.current = false;
        };
    }, []);

    const handleSelectAll = useCallback((e) => {
        setSelectedObjects(e.target.checked ? filteredObjectNames : []);
    }, [filteredObjectNames]);

    const handleSnackbarClose = useCallback(() => {
        setSnackbar(prev => ({...prev, open: false}));
    }, []);

    const handleClosePendingAction = useCallback(() => {
        setPendingAction(null);
    }, []);

    const filteredRowActions = useMemo(() => {
        if (!currentObject) return [];
        const objectData = objectStatus[currentObject];
        return OBJECT_ACTIONS.filter(
            (action) =>
                isActionAllowedForSelection(action.name, [currentObject]) &&
                (action.name !== "freeze" || !objectData?.frozen || objectData.frozen !== "frozen") &&
                (action.name !== "unfreeze" || objectData?.frozen === "frozen")
        );
    }, [currentObject, objectStatus]);

    return (
        <Box sx={{
            height: "100%",
            bgcolor: "background.default",
            display: "flex",
            flexDirection: "column",
            p: 0,
            position: 'relative',
            width: '100vw',
            margin: 0,
            overflow: 'hidden'
        }}>
            <Box sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                bgcolor: "background.paper",
                border: "2px solid",
                borderColor: "divider",
                borderRadius: 0,
                boxShadow: 3,
                p: {xs: 1, sm: 2, md: 3},
                m: 0,
                overflow: 'hidden'
            }}>
                <Box sx={{
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    backgroundColor: "background.paper",
                    pt: 2,
                    pb: 1,
                    mb: 2,
                    flexShrink: 0
                }}>
                    <Box sx={{
                        display: "flex",
                        flexDirection: {xs: "column", md: "row"},
                        justifyContent: "space-between",
                        alignItems: {xs: "stretch", md: "center"},
                        gap: 2
                    }}>
                        <Box sx={{display: "flex", alignItems: "center", gap: 1}}>
                            {isMobile && (
                                <Button
                                    onClick={toggleShowFilters}
                                    aria-label={showFilters ? "Hide filters" : "Show filters"}
                                    sx={{minWidth: 'auto', flexShrink: 0}}
                                    startIcon={<FilterListIcon/>}
                                >
                                    <Box component="span" sx={{display: {xs: 'none', sm: 'inline'}}}>
                                        Filters
                                    </Box>
                                    {showFilters ? <ExpandLessIcon/> : <ExpandMoreIcon/>}
                                </Button>
                            )}
                        </Box>

                        <Collapse in={showFilters} sx={{width: '100%'}}>
                            <Grid container spacing={2} sx={{mb: 2}}>
                                <Grid item xs={12} sm={6} md={4} lg={3}>
                                    <FormControl fullWidth size={isMobile ? "small" : "medium"}>
                                        <InputLabel id={globalStateId}>Global State</InputLabel>
                                        <Select
                                            labelId={globalStateId}
                                            multiple
                                            value={selectedGlobalStates}
                                            onChange={handleGlobalStateSelectChange}
                                            input={<OutlinedInput label="Global State"/>}
                                            renderValue={(selected) => {
                                                if (selected.length === 0) return '';

                                                const getStateIcon = (state) => {
                                                    switch (state) {
                                                        case "up":
                                                            return <FiberManualRecordIcon
                                                                sx={{color: green[500], fontSize: 14, mr: 0.5}}/>;
                                                        case "down":
                                                            return <FiberManualRecordIcon
                                                                sx={{color: red[500], fontSize: 14, mr: 0.5}}/>;
                                                        case "warn":
                                                            return <FiberManualRecordIcon
                                                                sx={{color: orange[500], fontSize: 14, mr: 0.5}}/>;
                                                        case "n/a":
                                                            return <FiberManualRecordIcon
                                                                sx={{color: grey[500], fontSize: 14, mr: 0.5}}/>;
                                                        case "unprovisioned":
                                                            return <PriorityHighIcon
                                                                sx={{color: red[500], fontSize: 14, mr: 0.5}}/>;
                                                        default:
                                                            return null;
                                                    }
                                                };

                                                return (
                                                    <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 0.5}}>
                                                        {selected.map((value) => (
                                                            <Chip
                                                                key={value}
                                                                label={
                                                                    <Box display="flex" alignItems="center">
                                                                        {getStateIcon(value)}
                                                                        {value.charAt(0).toUpperCase() + value.slice(1)}
                                                                    </Box>
                                                                }
                                                                onClick={() => handleGlobalStateChange(value)}
                                                                onDelete={() => handleGlobalStateChange(value)}
                                                                onMouseDown={(event) => {
                                                                    event.stopPropagation();
                                                                }}
                                                                size="small"
                                                                deleteIcon={<CloseIcon fontSize="small"
                                                                                       style={{cursor: 'pointer'}}/>}
                                                            />
                                                        ))}
                                                    </Box>
                                                );
                                            }}
                                        >
                                            {globalStates.map((state) => (
                                                <MenuItem key={state} value={state}>
                                                    <Checkbox checked={selectedGlobalStates.includes(state)}/>
                                                    <Box display="flex" alignItems="center" gap={1}>
                                                        {state === "up" &&
                                                            <FiberManualRecordIcon
                                                                sx={{color: green[500], fontSize: 18}}/>}
                                                        {state === "down" &&
                                                            <FiberManualRecordIcon
                                                                sx={{color: red[500], fontSize: 18}}/>}
                                                        {state === "warn" && <FiberManualRecordIcon
                                                            sx={{color: orange[500], fontSize: 18}}/>}
                                                        {state === "n/a" &&
                                                            <FiberManualRecordIcon
                                                                sx={{color: grey[500], fontSize: 18}}/>}
                                                        {state === "unprovisioned" &&
                                                            <PriorityHighIcon sx={{color: red[500], fontSize: 18}}/>}
                                                        {state.charAt(0).toUpperCase() + state.slice(1)}
                                                    </Box>
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={12} sm={6} md={4} lg={3}>
                                    <FormControl fullWidth size={isMobile ? "small" : "medium"}>
                                        <InputLabel id={namespaceId}>Namespace</InputLabel>
                                        <Select
                                            labelId={namespaceId}
                                            multiple
                                            value={selectedNamespaces}
                                            onChange={handleNamespaceSelectChange}
                                            input={<OutlinedInput label="Namespace"/>}
                                            renderValue={(selected) => (
                                                <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 0.5}}>
                                                    {selected.map((value) => (
                                                        <Chip
                                                            key={value}
                                                            label={value}
                                                            onDelete={() => handleNamespaceChange(value)}
                                                            onMouseDown={(event) => {
                                                                event.stopPropagation();
                                                            }}
                                                            size="small"
                                                            deleteIcon={<CloseIcon fontSize="small"
                                                                                   style={{cursor: 'pointer'}}/>}
                                                        />
                                                    ))}
                                                </Box>
                                            )}
                                        >
                                            {namespaces.map((namespace) => (
                                                <MenuItem key={namespace} value={namespace}>
                                                    <Checkbox checked={selectedNamespaces.includes(namespace)}/>
                                                    <ListItemText primary={namespace}/>
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={12} sm={6} md={4} lg={3}>
                                    <FormControl fullWidth size={isMobile ? "small" : "medium"}>
                                        <InputLabel id={kindId}>Kind</InputLabel>
                                        <Select
                                            labelId={kindId}
                                            multiple
                                            value={selectedKinds}
                                            onChange={handleKindSelectChange}
                                            input={<OutlinedInput label="Kind"/>}
                                            renderValue={(selected) => (
                                                <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 0.5}}>
                                                    {selected.map((value) => (
                                                        <Chip
                                                            key={value}
                                                            label={value}
                                                            onDelete={() => handleKindChange(value)}
                                                            onMouseDown={(event) => {
                                                                event.stopPropagation();
                                                            }}
                                                            size="small"
                                                            deleteIcon={<CloseIcon fontSize="small"
                                                                                   style={{cursor: 'pointer'}}/>}
                                                        />
                                                    ))}
                                                </Box>
                                            )}
                                        >
                                            {kinds.map((kind) => (
                                                <MenuItem key={kind} value={kind}>
                                                    <Checkbox checked={selectedKinds.includes(kind)}/>
                                                    <ListItemText primary={kind}/>
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={12} sm={6} md={4} lg={3}>
                                    <TextField
                                        id={nameSearchId}
                                        label="Name"
                                        value={searchQuery}
                                        onChange={handleSearchChange}
                                        fullWidth
                                        size={isMobile ? "small" : "medium"}
                                    />
                                </Grid>
                            </Grid>
                        </Collapse>

                        <Box sx={{display: "flex", justifyContent: {xs: "center", md: "flex-end"}}}>
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={handleActionsMenuOpen}
                                disabled={!selectedObjects.length}
                                aria-label="Actions on selected objects"
                                sx={{flexShrink: 0, whiteSpace: 'nowrap'}}
                                fullWidth={isMobile}
                            >
                                Actions ({selectedObjects.length})
                            </Button>
                        </Box>
                    </Box>

                    {/* Menu for row actions (per object) */}
                    <Menu
                        open={Boolean(rowMenuAnchor)}
                        anchorEl={rowMenuAnchor}
                        onClose={handleRowMenuClose}
                        onClick={(e) => e.stopPropagation()}
                        anchorOrigin={{
                            vertical: 'bottom',
                            horizontal: 'right',
                        }}
                        transformOrigin={{
                            vertical: 'top',
                            horizontal: 'right',
                        }}
                        sx={{
                            zIndex: 10000,
                            "& .MuiPaper-root": {
                                minWidth: 200,
                                boxShadow: "0px 5px 15px rgba(0,0,0,0.2)",
                            }
                        }}
                    >
                        {filteredRowActions.map((action) => {
                            const {name, icon, color} = action;
                            return (
                                <MenuItem
                                    key={name}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleActionClick(name, true, currentObject);
                                    }}
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                        color: color === "red" ? "error.main" : "inherit",
                                    }}
                                    aria-label={`${name} action for object ${currentObject}`}
                                >
                                    <ListItemIcon sx={{color: color === "red" ? "error.main" : "inherit"}}>
                                        {icon}
                                    </ListItemIcon>
                                    {name.charAt(0).toUpperCase() + name.slice(1)}
                                </MenuItem>
                            );
                        })}
                    </Menu>

                    {/* Menu for global actions */}
                    <Menu
                        open={Boolean(actionsMenuAnchor)}
                        anchorEl={actionsMenuAnchor}
                        onClose={handleActionsMenuClose}
                        anchorOrigin={{
                            vertical: 'bottom',
                            horizontal: 'right',
                        }}
                        transformOrigin={{
                            vertical: 'top',
                            horizontal: 'right',
                        }}
                        sx={{
                            zIndex: 10000,
                            "& .MuiPaper-root": {
                                minWidth: 200,
                                boxShadow: "0px 5px 15px rgba(0,0,0,0.2)"
                            }
                        }}
                    >
                        {OBJECT_ACTIONS.map((action) => {
                            const {name, icon, color} = action;
                            const isAllowed = isActionAllowedForSelection(name, selectedObjects);
                            return (
                                <MenuItem
                                    key={name}
                                    onClick={() => handleActionClick(name)}
                                    disabled={!isAllowed}
                                    sx={{
                                        color: isAllowed
                                            ? (color === "red" ? "error.main" : "inherit")
                                            : "text.disabled",
                                        "&.Mui-disabled": {opacity: 0.5}
                                    }}
                                    aria-label={`${name} action for selected objects`}
                                >
                                    <ListItemIcon sx={{
                                        color: isAllowed
                                            ? (color === "red" ? "error.main" : "inherit")
                                            : "text.disabled"
                                    }}>
                                        {icon}
                                    </ListItemIcon>
                                    <ListItemText>{name.charAt(0).toUpperCase() + name.slice(1)}</ListItemText>
                                </MenuItem>
                            );
                        })}
                    </Menu>
                </Box>
                <TableContainer
                    ref={tableContainerRef}
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        overflow: "auto",
                        boxShadow: "none",
                        border: "none",
                        position: 'relative'
                    }}
                >
                    <Table sx={{
                        position: 'relative',
                        tableLayout: 'fixed',
                        width: '100%'
                    }}>
                        <TableHead sx={{position: "sticky", top: 0, zIndex: 20, backgroundColor: "background.paper"}}>
                            <TableRow>
                                <TableCell sx={{
                                    padding: "16px 0px 16px 16px",
                                    minWidth: "60px",
                                    width: "60px",
                                    maxWidth: "60px",
                                    boxSizing: "border-box"
                                }}>
                                    <Checkbox
                                        checked={selectedObjects.length === filteredObjectNames.length && filteredObjectNames.length > 0}
                                        onChange={handleSelectAll}
                                        aria-label="Select all objects"
                                    />
                                </TableCell>
                                <TableCell sx={{
                                    minWidth: "150px",
                                    width: "150px",
                                    maxWidth: "150px",
                                    position: "relative",
                                    cursor: "pointer",
                                    padding: "16px 8px",
                                    boxSizing: "border-box"
                                }} onClick={() => handleSort("status")}>
                                    <Box sx={{
                                        width: "100%",
                                        height: "100%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between"
                                    }}>
                                        <Box sx={{
                                            width: "80px",
                                            display: "flex",
                                            justifyContent: "center",
                                            alignItems: "center",
                                            gap: 0.5
                                        }}>
                                            <strong>Status</strong>
                                            {sortColumn === "status" && (sortDirection === "asc" ?
                                                <KeyboardArrowUpIcon fontSize="small"/> :
                                                <KeyboardArrowDownIcon fontSize="small"/>)}
                                        </Box>
                                        <Box sx={{width: "70px"}}></Box>
                                    </Box>
                                </TableCell>
                                <TableCell sx={{
                                    cursor: "pointer",
                                    padding: "16px 8px",
                                    minWidth: "200px",
                                    width: "auto",
                                    boxSizing: "border-box"
                                }} onClick={() => handleSort("object")}>
                                    <Box sx={{display: "flex", alignItems: "center", gap: 0.5}}>
                                        <strong>Object</strong>
                                        {sortColumn === "object" && (sortDirection === "asc" ?
                                            <KeyboardArrowUpIcon fontSize="small"/> :
                                            <KeyboardArrowDownIcon fontSize="small"/>)}
                                    </Box>
                                </TableCell>
                                {isWideScreen && allNodes.map((node) => (
                                    <TableCell key={node} sx={{
                                        minWidth: "130px",
                                        width: "130px",
                                        maxWidth: "130px",
                                        position: "relative",
                                        cursor: "pointer",
                                        padding: "16px 8px",
                                        boxSizing: "border-box"
                                    }} onClick={() => handleSort(node)}>
                                        <Box sx={{
                                            width: "100%",
                                            height: "100%",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between"
                                        }}>
                                            <Box sx={{
                                                width: "80px",
                                                display: "flex",
                                                justifyContent: "center",
                                                alignItems: "center",
                                                gap: 0.5
                                            }}>
                                                <strong>{node}</strong>
                                                {sortColumn === node && (sortDirection === "asc" ?
                                                    <KeyboardArrowUpIcon fontSize="small"/> :
                                                    <KeyboardArrowDownIcon fontSize="small"/>)}
                                            </Box>
                                            <Box sx={{width: "50px"}}></Box>
                                        </Box>
                                    </TableCell>
                                ))}
                                <TableCell sx={{
                                    padding: "16px 8px",
                                    minWidth: "100px",
                                    width: "100px",
                                    maxWidth: "100px",
                                    boxSizing: "border-box"
                                }}>
                                    <strong>Actions</strong>
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {visibleObjectNames.map((objectName) => (
                                <TableRowComponent
                                    key={objectName}
                                    objectName={objectName}
                                    isSelected={selectedObjects.includes(objectName)}
                                    onSelectObject={handleSelectObject}
                                    onObjectClick={handleObjectClick}
                                    onRowMenuOpen={handleRowMenuOpen}
                                    isMenuOpen={Boolean(rowMenuAnchor) && currentObject === objectName}
                                    allNodes={allNodes}
                                    isWideScreen={isWideScreen}
                                    onActionClick={handleActionClick}
                                    onRowMenuClose={handleRowMenuClose}
                                />
                            ))}
                        </TableBody>
                    </Table>
                    {loading && (
                        <Box sx={{display: 'flex', justifyContent: 'center', padding: 2}}>
                            <CircularProgress size={24}/>
                        </Box>
                    )}
                    {visibleObjectNames.length === 0 && (
                        <Typography align="center" color="textSecondary" sx={{mt: 2, p: 3}}>
                            No objects found matching the current filters.
                        </Typography>
                    )}
                </TableContainer>
                <Snackbar
                    open={snackbar.open}
                    autoHideDuration={4000}
                    onClose={handleSnackbarClose}
                    anchorOrigin={{vertical: "bottom", horizontal: "center"}}
                >
                    <Alert severity={snackbar.severity} onClose={handleSnackbarClose}>
                        {snackbar.message}
                    </Alert>
                </Snackbar>
                <ActionDialogManager
                    pendingAction={pendingAction}
                    handleConfirm={handleExecuteActionOnSelected}
                    target={pendingAction?.target ? `object ${pendingAction.target}` : `${selectedObjects.length} objects`}
                    supportedActions={OBJECT_ACTIONS.map((action) => action.name)}
                    onClose={handleClosePendingAction}
                />
            </Box>
            <EventLogger eventTypes={objectEventTypes} title="Object Events Logger" buttonLabel="Object Events"/>
        </Box>
    );
};

export default Objects;
