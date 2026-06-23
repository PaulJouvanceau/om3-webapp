import React, {useEffect, useState, useRef, useMemo, useCallback} from "react";
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
    Menu,
    MenuItem,
    Checkbox,
    Snackbar,
    Alert,
    useMediaQuery,
    useTheme,
    ListItemIcon,
    ListItemText,
    CircularProgress,
    IconButton,
} from "@mui/material";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import CloseIcon from "@mui/icons-material/Close";
import useFetchDaemonStatus from "../hooks/useFetchDaemonStatus.jsx";
import {closeEventSource, startEventReception} from "../eventSourceManager";
import useEventStore from "../hooks/useEventStore.js";
import NodeRow from "../components/NodeRow.jsx";
import LogsViewer from "../components/LogsViewer.jsx";
import logger from '../utils/logger.js';
import {URL_NODE} from "../config/apiPath.js";
import {NODE_ACTIONS} from "../constants/actions";
import ActionDialogManager from "./ActionDialogManager";
import EventLogger from "../components/EventLogger";

// Safari detection
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

const NodesTable = () => {
    const {daemon, fetchNodes} = useFetchDaemonStatus();
    const nodeStatus = useEventStore((state) => state.nodeStatus);
    const nodeStats = useEventStore((state) => state.nodeStats);
    const nodeMonitor = useEventStore((state) => state.nodeMonitor);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

    const [anchorEls, setAnchorEls] = useState({});
    const [selectedNodes, setSelectedNodes] = useState([]);
    const [actionsMenuAnchor, setActionsMenuAnchor] = useState(null);
    const [snackbar, setSnackbar] = useState({open: false, message: "", severity: "info"});
    const [pendingAction, setPendingAction] = useState(null);
    const [sortColumn, setSortColumn] = useState("name");
    const [sortDirection, setSortDirection] = useState("asc");
    const actionsMenuAnchorRef = useRef(null);
    const [menuPosition, setMenuPosition] = useState({top: 0, left: 0});

    // Logs drawer state
    const [logsDrawerOpen, setLogsDrawerOpen] = useState(false);
    const [selectedNodeForLogs, setSelectedNodeForLogs] = useState(null);
    const [drawerWidth, setDrawerWidth] = useState(600);
    const minDrawerWidth = 300;
    const maxDrawerWidth = window.innerWidth * 0.9;

    // Resize state
    const [isResizing, setIsResizing] = useState(false);
    const startXRef = useRef(0);
    const startWidthRef = useRef(0);
    const isDraggingRef = useRef(false);

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

    // Hauteur de la barre de navigation (AppBar) avec safe area
    const appBarHeight = `calc(${theme.mixins.toolbar.minHeight || 64}px + env(safe-area-inset-top, 0px))`;

    const getZoomLevel = () => {
        return window.devicePixelRatio || 1;
    };

    // Function to calculate the menu position
    const calculateMenuPosition = (anchorRef) => {
        if (anchorRef.current) {
            const zoomLevel = getZoomLevel();
            const rect = anchorRef.current.getBoundingClientRect();
            const scrollY = window.scrollY || window.pageYOffset;
            const scrollX = window.scrollX || window.pageXOffset;
            setMenuPosition({
                top: (rect.bottom + scrollY) / zoomLevel,
                left: (rect.right + scrollX) / zoomLevel,
            });
        }
    };

    const handleAction = (action, nodename = null) => {
        setPendingAction({action, node: nodename});
        if (nodename) {
            handleMenuClose(nodename);
        } else {
            handleActionsMenuClose();
        }
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

    // Resize handlers
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
        document.body.style.cursor = "ew-resize";
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
        document.body.style.cursor = "default";
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

    const handleMenuOpen = (event, nodename) => {
        setAnchorEls((prev) => ({...prev, [nodename]: event.currentTarget}));
    };

    const handleMenuClose = (nodename) => {
        setAnchorEls((prev) => ({...prev, [nodename]: null}));
    };

    const handleSelectNode = (event, nodename) => {
        if (event.target.checked) {
            setSelectedNodes((prev) => [...prev, nodename]);
        } else {
            setSelectedNodes((prev) => prev.filter((node) => node !== nodename));
        }
    };

    const handleActionsMenuOpen = (event) => {
        setActionsMenuAnchor(event.currentTarget);
        actionsMenuAnchorRef.current = event.currentTarget;
        if (isSafari) {
            setTimeout(() => calculateMenuPosition(actionsMenuAnchorRef), 0);
        }
    };

    const handleActionsMenuClose = () => {
        setActionsMenuAnchor(null);
        actionsMenuAnchorRef.current = null;
        setMenuPosition({top: 0, left: 0});
    };

    const postActionUrl = (node, action) => {
        if (action === "restart daemon") {
            return `${URL_NODE}/${node}/daemon/action/restart`;
        }
        return `${URL_NODE}/${node}/action/${action}`;
    };

    const handleDialogConfirm = async (action) => {
        if (!pendingAction) return;

        const token = localStorage.getItem("authToken");
        if (!token) {
            setSnackbar({
                open: true,
                message: "Authentication token not found",
                severity: "error",
            });
            return;
        }

        const actionLabel = action
            .split(" ")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
        setSnackbar({
            open: true,
            message: `Executing '${actionLabel}'...`,
            severity: "info",
        });
        let successCount = 0;
        let errorCount = 0;

        const nodesToProcess = pendingAction.node
            ? [pendingAction.node]
            : selectedNodes;

        const promises = nodesToProcess.map(async (node) => {
            const isFrozen = !!nodeStatus[node]?.frozen_at && nodeStatus[node]?.frozen_at !== "0001-01-01T00:00:00Z";
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
                    ? `✅ '${actionLabel}' succeeded on ${successCount} node(s).`
                    : successCount
                        ? `⚠️ '${actionLabel}' partially succeeded: ${successCount} ok, ${errorCount} errors.`
                        : `❌ '${actionLabel}' failed on all ${nodesToProcess.length} node(s).`,
            severity: successCount && !errorCount ? "success" : successCount ? "warning" : "error",
        });

        setSelectedNodes([]);
        setPendingAction(null);
    };

    const filteredMenuItems = NODE_ACTIONS.filter(({name}) => {
        if (selectedNodes.length === 0) return false;
        return selectedNodes.some((nodename) => {
            const isFrozen = !!nodeStatus[nodename]?.frozen_at && nodeStatus[nodename]?.frozen_at !== "0001-01-01T00:00:00Z";
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
                const bootedA = nodeStatus[a]?.booted_at || "0001-01-01T00:00:00Z";
                const bootedB = nodeStatus[b]?.booted_at || "0001-01-01T00:00:00Z";
                diff = new Date(bootedA).getTime() - new Date(bootedB).getTime();
            } else if (sortColumn === "updated_at") {
                const updatedA = nodeMonitor[a]?.updated_at || "0001-01-01T00:00:00Z";
                const updatedB = nodeMonitor[b]?.updated_at || "0001-01-01T00:00:00Z";
                diff = new Date(updatedA).getTime() - new Date(updatedB).getTime();
            }
            return sortDirection === "asc" ? diff : -diff;
        });
    }, [nodeStatus, nodeStats, nodeMonitor, sortColumn, sortDirection]);

    // Menu props configuration
    const menuSx = isSafari
        ? {
            "& .MuiMenu-paper": {
                position: "fixed",
                top: `${menuPosition.top}px !important`,
                left: `${menuPosition.left}px !important`,
                transform: "translateX(-100%)",
                boxShadow: "0px 5px 15px rgba(0,0,0,0.2)",
                zIndex: 1300,
            },
        }
        : {};

    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
        } else {
            setSortColumn(column);
            setSortDirection("asc");
        }
    };

    return (
        <Box
            sx={{
                minHeight: "100vh",
                bgcolor: "background.default",
                display: "flex",
                flexDirection: "row",
                width: "100vw",
                overflow: "hidden",
                p: 0,
                margin: 0,
            }}
        >
            <Box
                sx={{
                    flex: logsDrawerOpen ? `0 0 calc(100% - ${drawerWidth}px)` : "1 1 100%",
                    width: "100%",
                    bgcolor: "background.paper",
                    border: "2px solid",
                    borderColor: "divider",
                    borderRadius: 0,
                    boxShadow: 3,
                    p: 3,
                    m: 0,
                    overflow: "auto",
                    transition: theme.transitions.create("flex", {
                        easing: theme.transitions.easing.sharp,
                        duration: theme.transitions.duration.enteringScreen,
                    }),
                }}
            >
                {/* Container for the actions button */}
                <Box
                    sx={{
                        mb: 2,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 2,
                        position: "sticky",
                        top: 0,
                        zIndex: 10,
                        backgroundColor: "background.paper",
                        pt: 2,
                        pb: 1
                    }}
                >
                    {/* Left section  */}
                    <Box sx={{flexGrow: 1}}></Box>

                    {/* Right section */}
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleActionsMenuOpen}
                        disabled={selectedNodes.length === 0}
                        ref={actionsMenuAnchorRef}
                        sx={{flexShrink: 0}}
                    >
                        Actions on selected nodes
                    </Button>

                    <Menu
                        anchorEl={actionsMenuAnchor}
                        open={Boolean(actionsMenuAnchor)}
                        onClose={handleActionsMenuClose}
                        anchorOrigin={{
                            vertical: "bottom",
                            horizontal: "right",
                        }}
                        transformOrigin={{
                            vertical: "top",
                            horizontal: "right",
                        }}
                        sx={{
                            ...menuSx,
                            zIndex: 10000,
                        }}
                    >
                        {filteredMenuItems.map(({name, icon, color}) => (
                            <MenuItem
                                key={name}
                                onClick={() => handleAction(name)}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1,
                                    color: color === "red" ? "error.main" : "inherit",
                                }}
                            >
                                <ListItemIcon sx={{color: color === "red" ? "error.main" : "inherit"}}>
                                    {icon}
                                </ListItemIcon>
                                <ListItemText>
                                    {name
                                        .split(" ")
                                        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                                        .join(" ")}
                                </ListItemText>
                            </MenuItem>
                        ))}
                    </Menu>
                </Box>

                {Object.keys(nodeStatus).length === 0 ? (
                    <Box sx={{display: "flex", justifyContent: "center", my: 4}}>
                        <CircularProgress aria-label="Loading nodes"/>
                    </Box>
                ) : (
                    <TableContainer sx={{maxHeight: "60vh", overflow: "auto", boxShadow: "none", border: "none"}}>
                        <Table sx={{minWidth: 1100}} aria-label="nodes table">
                            <TableHead
                                sx={{position: "sticky", top: 0, zIndex: 1, backgroundColor: "background.paper"}}
                            >
                                <TableRow>
                                    <TableCell align="center" sx={{width: 50}}>
                                        <Checkbox
                                            checked={selectedNodes.length === Object.keys(nodeStatus).length}
                                            onChange={(e) =>
                                                setSelectedNodes(e.target.checked ? Object.keys(nodeStatus) : [])
                                            }
                                        />
                                    </TableCell>
                                    <TableCell
                                        onClick={() => handleSort("name")}
                                        sx={{cursor: "pointer", textAlign: "center"}}
                                    >
                                        <Box sx={{display: "flex", alignItems: "center", justifyContent: "center"}}>
                                            <strong>Name</strong>
                                            {sortColumn === "name" &&
                                                (sortDirection === "asc" ? <KeyboardArrowUpIcon/> :
                                                    <KeyboardArrowDownIcon/>)}
                                        </Box>
                                    </TableCell>
                                    <TableCell
                                        onClick={() => handleSort("state")}
                                        sx={{cursor: "pointer", textAlign: "center"}}
                                    >
                                        <Box sx={{display: "flex", alignItems: "center", justifyContent: "center"}}>
                                            <strong>State</strong>
                                            {sortColumn === "state" &&
                                                (sortDirection === "asc" ? <KeyboardArrowUpIcon/> :
                                                    <KeyboardArrowDownIcon/>)}
                                        </Box>
                                    </TableCell>
                                    <TableCell
                                        onClick={() => handleSort("score")}
                                        sx={{cursor: "pointer", textAlign: "center"}}
                                    >
                                        <Box sx={{display: "flex", alignItems: "center", justifyContent: "center"}}>
                                            <strong>Score</strong>
                                            {sortColumn === "score" &&
                                                (sortDirection === "asc" ? <KeyboardArrowUpIcon/> :
                                                    <KeyboardArrowDownIcon/>)}
                                        </Box>
                                    </TableCell>
                                    <TableCell
                                        onClick={() => handleSort("load_15m")}
                                        sx={{cursor: "pointer", textAlign: "center"}}
                                    >
                                        <Box sx={{display: "flex", alignItems: "center", justifyContent: "center"}}>
                                            <strong>Load (15m)</strong>
                                            {sortColumn === "load_15m" &&
                                                (sortDirection === "asc" ? <KeyboardArrowUpIcon/> :
                                                    <KeyboardArrowDownIcon/>)}
                                        </Box>
                                    </TableCell>
                                    <TableCell
                                        onClick={() => handleSort("mem_avail")}
                                        sx={{cursor: "pointer", textAlign: "center"}}
                                    >
                                        <Box sx={{display: "flex", alignItems: "center", justifyContent: "center"}}>
                                            <strong>Mem Avail</strong>
                                            {sortColumn === "mem_avail" &&
                                                (sortDirection === "asc" ? <KeyboardArrowUpIcon/> :
                                                    <KeyboardArrowDownIcon/>)}
                                        </Box>
                                    </TableCell>
                                    <TableCell
                                        onClick={() => handleSort("swap_avail")}
                                        sx={{cursor: "pointer", textAlign: "center"}}
                                    >
                                        <Box sx={{display: "flex", alignItems: "center", justifyContent: "center"}}>
                                            <strong>Swap Avail</strong>
                                            {sortColumn === "swap_avail" &&
                                                (sortDirection === "asc" ? <KeyboardArrowUpIcon/> :
                                                    <KeyboardArrowDownIcon/>)}
                                        </Box>
                                    </TableCell>
                                    <TableCell
                                        onClick={() => handleSort("version")}
                                        sx={{cursor: "pointer", textAlign: "center"}}
                                    >
                                        <Box sx={{display: "flex", alignItems: "center", justifyContent: "center"}}>
                                            <strong>Version</strong>
                                            {sortColumn === "version" &&
                                                (sortDirection === "asc" ? <KeyboardArrowUpIcon/> :
                                                    <KeyboardArrowDownIcon/>)}
                                        </Box>
                                    </TableCell>
                                    <TableCell
                                        onClick={() => handleSort("booted_at")}
                                        sx={{cursor: "pointer", textAlign: "center"}}
                                    >
                                        <Box sx={{display: "flex", alignItems: "center", justifyContent: "center"}}>
                                            <strong>Booted At</strong>
                                            {sortColumn === "booted_at" &&
                                                (sortDirection === "asc" ? <KeyboardArrowUpIcon/> :
                                                    <KeyboardArrowDownIcon/>)}
                                        </Box>
                                    </TableCell>
                                    <TableCell
                                        onClick={() => handleSort("updated_at")}
                                        sx={{cursor: "pointer", textAlign: "center"}}
                                    >
                                        <Box sx={{display: "flex", alignItems: "center", justifyContent: "center"}}>
                                            <strong>Updated At</strong>
                                            {sortColumn === "updated_at" &&
                                                (sortDirection === "asc" ? <KeyboardArrowUpIcon/> :
                                                    <KeyboardArrowDownIcon/>)}
                                        </Box>
                                    </TableCell>
                                    <TableCell align="center"><strong>Actions</strong></TableCell>
                                    <TableCell align="center"><strong>Logs</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
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
                                        onMenuOpen={handleMenuOpen}
                                        onMenuClose={handleMenuClose}
                                        onAction={(nodename, action) => handleAction(action, nodename)}
                                        onOpenLogs={handleOpenLogs}
                                        anchorEl={anchorEls[nodename]}
                                    />
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}

                <Snackbar
                    open={snackbar.open}
                    autoHideDuration={4000}
                    onClose={() => setSnackbar({...snackbar, open: false})}
                    anchorOrigin={{vertical: "bottom", horizontal: "center"}}
                >
                    <Alert
                        severity={snackbar.severity}
                        onClose={() => setSnackbar({...snackbar, open: false})}
                    >
                        {snackbar.message}
                    </Alert>
                </Snackbar>

                <ActionDialogManager
                    pendingAction={pendingAction}
                    handleConfirm={handleDialogConfirm}
                    target={pendingAction?.node ? `node ${pendingAction.node}` : `${selectedNodes.length} nodes`}
                    supportedActions={NODE_ACTIONS.map((action) => action.name)}
                    onClose={() => setPendingAction(null)}
                />
            </Box>

            {/* Logs panel */}
            {logsDrawerOpen && (
                <Box
                    sx={{
                        position: "fixed",
                        top: appBarHeight,
                        right: 0,
                        width: `${drawerWidth}px`,
                        maxWidth: "90vw",
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
                    {/* Resize handle */}
                    <Box
                        onMouseDown={handleResizeStart}
                        onTouchStart={handleResizeStart}
                        sx={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: isMobile ? "16px" : "8px",
                            height: "100%",
                            cursor: "ew-resize",
                            bgcolor: theme.palette.grey[300],
                            zIndex: 10,
                            touchAction: "none",
                            userSelect: "none",
                            WebkitUserSelect: "none",
                            "&:hover": {
                                bgcolor: theme.palette.primary.light,
                            },
                            "&:active": {
                                bgcolor: theme.palette.primary.main,
                            },
                        }}
                        aria-label="Resize drawer"
                    />

                    {/* Header */}
                    <Box sx={{display: "flex", justifyContent: "space-between", alignItems: "center", p: 2, pb: 1}}>
                        <Typography variant="h6">Node Logs</Typography>
                        <IconButton onClick={handleCloseLogsDrawer} size="large">
                            <CloseIcon/>
                        </IconButton>
                    </Box>

                    {/* LogsViewer container */}
                    <Box sx={{flexGrow: 1, overflow: "hidden", position: "relative"}}>
                        {selectedNodeForLogs !== null && (
                            <LogsViewer
                                nodename={selectedNodeForLogs}
                                type="node"
                                height="100%"
                            />
                        )}
                    </Box>
                </Box>
            )}

            <EventLogger eventTypes={nodeEventTypes} title="Node Events Logger" buttonLabel="Node Events"/>
        </Box>
    );
};

export default NodesTable;
