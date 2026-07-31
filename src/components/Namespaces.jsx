import React, {useEffect, useState, useMemo, useCallback, useRef, useDeferredValue} from "react";
import {
    Box,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
    Autocomplete,
    TextField,
    CircularProgress,
} from "@mui/material";
import {green, red, orange, grey} from "@mui/material/colors";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import {useNavigate, useLocation} from "react-router-dom";
import {closeEventSource, startEventReception} from "../eventSourceManager.jsx";
import EventLogger from "../components/EventLogger";
import {useNamespaceData} from "../hooks/useNamespaceData";
import {SortableTableCell} from "../utils/objectUtils";

const getColorByStatus = (status) => {
    switch (status) {
        case "up":
            return green[500];
        case "down":
            return red[500];
        case "warn":
            return orange[500];
        default:
            return grey[500];
    }
};

export const areStatusDotPropsEqual = (prev, next) =>
    prev.status === next.status && prev.count === next.count;

const StatusDot = React.memo(({status, count}) => (
    <Box display="flex" justifyContent="center" alignItems="center" gap={1}>
        <FiberManualRecordIcon
            sx={{fontSize: 18, color: getColorByStatus(status)}}
        />
        <Typography variant="body1">{count}</Typography>
    </Box>
), areStatusDotPropsEqual);

const NamespaceTableRow = React.memo(({
                                          namespace,
                                          counts,
                                          onNamespaceClick,
                                          onStatusClick
                                      }) => {
    const total = useMemo(() =>
            counts.up + counts.down + counts.warn + counts["n/a"],
        [counts]
    );

    const handleRowClick = useCallback(() => {
        onNamespaceClick(namespace);
    }, [onNamespaceClick, namespace]);

    const handleStatusClick = useCallback((e, status) => {
        e.stopPropagation();
        onStatusClick(namespace, status);
    }, [onStatusClick, namespace]);

    return (
        <TableRow
            hover
            onClick={handleRowClick}
            sx={{cursor: "pointer"}}
        >
            <TableCell sx={{fontWeight: 500}}>
                {namespace}
            </TableCell>
            {["up", "down", "warn", "n/a"].map((status) => (
                <TableCell
                    key={status}
                    align="center"
                    onClick={(e) => handleStatusClick(e, status)}
                    sx={{cursor: "pointer"}}
                >
                    <StatusDot status={status} count={counts[status]}/>
                </TableCell>
            ))}
            <TableCell align="center">
                <Typography variant="body1" fontWeight={600}>
                    {total}
                </Typography>
            </TableCell>
        </TableRow>
    );
}, (prev, next) => {
    return prev.namespace === next.namespace &&
        prev.counts.up === next.counts.up &&
        prev.counts.down === next.counts.down &&
        prev.counts.warn === next.counts.warn &&
        prev.counts["n/a"] === next.counts["n/a"];
});

const Namespaces = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const isMounted = useRef(true);
    const tableContainerRef = useRef(null);

    const queryParams = new URLSearchParams(location.search);
    const urlNamespace = queryParams.get("namespace");

    const [sortColumn, setSortColumn] = useState("namespace");
    const [sortDirection, setSortDirection] = useState("asc");
    const [selectedNamespace, setSelectedNamespace] = useState(urlNamespace || "all");
    const [visibleCount, setVisibleCount] = useState(50);
    const [loading, setLoading] = useState(false);

    const {statusByNamespace, namespaces} = useNamespaceData();

    const deferredSelectedNamespace = useDeferredValue(selectedNamespace);
    const deferredSortColumn = useDeferredValue(sortColumn);
    const deferredSortDirection = useDeferredValue(sortDirection);

    const namespaceEventTypes = useMemo(() => [
        'ObjectStatusUpdated',
        'InstanceStatusUpdated',
        'ObjectDeleted',
        'InstanceConfigUpdated'
    ], []);

    useEffect(() => {
        const token = localStorage.getItem("authToken");
        if (token) {
            startEventReception(token, namespaceEventTypes);
        }
        return () => {
            closeEventSource();
        };
    }, [namespaceEventTypes]);

    useEffect(() => {
        setSelectedNamespace(urlNamespace || "all");
    }, [urlNamespace]);

    const sortedNamespaces = useMemo(() => {
        const entries = Object.entries(statusByNamespace);

        const filtered = deferredSelectedNamespace === "all"
            ? entries
            : entries.filter(([namespace]) => namespace === deferredSelectedNamespace);

        return filtered.sort((a, b) => {
            const [namespaceA, countsA] = a;
            const [namespaceB, countsB] = b;
            let diff = 0;

            if (deferredSortColumn === "namespace") {
                diff = namespaceA.localeCompare(namespaceB);
            } else if (deferredSortColumn === "up") {
                diff = countsA.up - countsB.up;
            } else if (deferredSortColumn === "down") {
                diff = countsA.down - countsB.down;
            } else if (deferredSortColumn === "warn") {
                diff = countsA.warn - countsB.warn;
            } else if (deferredSortColumn === "n/a") {
                diff = countsA["n/a"] - countsB["n/a"];
            } else if (deferredSortColumn === "total") {
                const totalA = countsA.up + countsA.down + countsA.warn + countsA["n/a"];
                const totalB = countsB.up + countsB.down + countsB.warn + countsB["n/a"];
                diff = totalA - totalB;
            }

            return deferredSortDirection === "asc" ? diff : -diff;
        });
    }, [statusByNamespace, deferredSelectedNamespace, deferredSortColumn, deferredSortDirection]);

    const visibleNamespaces = useMemo(() =>
            sortedNamespaces.slice(0, visibleCount),
        [sortedNamespaces, visibleCount]
    );

    const handleSort = useCallback((column) => {
        setSortColumn(prev => {
            if (prev === column) {
                setSortDirection(dir => dir === "asc" ? "desc" : "asc");
                return column;
            }
            setSortDirection("asc");
            return column;
        });
        setVisibleCount(50);
    }, []);

    const handleNamespaceChange = useCallback((e, val) => {
        const newNamespace = val || "all";
        setSelectedNamespace(newNamespace);
        setVisibleCount(50);

        if (newNamespace === "all") {
            navigate("/namespaces");
        } else {
            navigate(`/namespaces?namespace=${newNamespace}`);
        }
    }, [navigate]);

    const handleNamespaceClick = useCallback((namespace) => {
        navigate(`/objects?namespace=${namespace}`);
    }, [navigate]);

    const handleStatusClick = useCallback((namespace, status) => {
        const url = `/objects?namespace=${namespace}&globalState=${status}`;
        navigate(url);
    }, [navigate]);

    const handleScroll = useCallback(() => {
        if (loading) return;

        const container = tableContainerRef.current;
        if (!container) return;

        const {scrollTop, scrollHeight, clientHeight} = container;
        const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

        if (scrollPercentage > 0.8 && visibleCount < sortedNamespaces.length) {
            setLoading(true);
            setTimeout(() => {
                setVisibleCount(prev => Math.min(prev + 50, sortedNamespaces.length));
                setLoading(false);
            }, 100);
        }
    }, [loading, visibleCount, sortedNamespaces.length]);

    useEffect(() => {
        const container = tableContainerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
            return () => container.removeEventListener('scroll', handleScroll);
        }
    }, [handleScroll]);

    useEffect(() => {
        setVisibleCount(50);
    }, [sortedNamespaces]);

    useEffect(() => {
        return () => {
            isMounted.current = false;
        };
    }, []);

    const renderTextField = useCallback((params) => (
        <TextField {...params} label="Filter by namespace"/>
    ), []);

    return (
        <Box
            sx={{
                bgcolor: "background.default",
                display: "flex",
                justifyContent: "center",
                p: 0,
                position: 'relative',
                minHeight: '100vh',
                width: '100vw',
                margin: 0,
            }}
        >
            <Box
                sx={{
                    width: "100%",
                    bgcolor: "background.paper",
                    border: "2px solid",
                    borderColor: "divider",
                    borderRadius: 0,
                    boxShadow: 3,
                    p: 3,
                    m: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    height: '100vh'
                }}
            >
                {/* Namespace Filter */}
                <Box sx={{mb: 3, flexShrink: 0}}>
                    <Autocomplete
                        sx={{width: 300}}
                        options={["all", ...namespaces]}
                        value={selectedNamespace}
                        onChange={handleNamespaceChange}
                        renderInput={renderTextField}
                    />
                </Box>

                <TableContainer
                    ref={tableContainerRef}
                    sx={{
                        flex: 1,
                        minHeight: 0,
                        overflow: "auto",
                        boxShadow: "none",
                        border: "none"
                    }}
                >
                    <Table>
                        <TableHead sx={{position: "sticky", top: 0, zIndex: 20, backgroundColor: "background.paper"}}>
                            <TableRow>
                                <SortableTableCell
                                    column="namespace"
                                    label="Namespace"
                                    currentSortColumn={sortColumn}
                                    sortDirection={sortDirection}
                                    onSort={handleSort}
                                />
                                <SortableTableCell
                                    column="up"
                                    label="Up"
                                    currentSortColumn={sortColumn}
                                    sortDirection={sortDirection}
                                    onSort={handleSort}
                                    align="center"
                                />
                                <SortableTableCell
                                    column="down"
                                    label="Down"
                                    currentSortColumn={sortColumn}
                                    sortDirection={sortDirection}
                                    onSort={handleSort}
                                    align="center"
                                />
                                <SortableTableCell
                                    column="warn"
                                    label="Warn"
                                    currentSortColumn={sortColumn}
                                    sortDirection={sortDirection}
                                    onSort={handleSort}
                                    align="center"
                                />
                                <SortableTableCell
                                    column="n/a"
                                    label="N/A"
                                    currentSortColumn={sortColumn}
                                    sortDirection={sortDirection}
                                    onSort={handleSort}
                                    align="center"
                                />
                                <SortableTableCell
                                    column="total"
                                    label="Total"
                                    currentSortColumn={sortColumn}
                                    sortDirection={sortDirection}
                                    onSort={handleSort}
                                    align="center"
                                />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {visibleNamespaces.length > 0 ? (
                                visibleNamespaces.map(([namespace, counts]) => (
                                    <NamespaceTableRow
                                        key={namespace}
                                        namespace={namespace}
                                        counts={counts}
                                        onNamespaceClick={handleNamespaceClick}
                                        onStatusClick={handleStatusClick}
                                    />
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} align="center">
                                        <Typography data-testid="no-namespaces-message">
                                            {selectedNamespace !== "all"
                                                ? "No namespaces match the selected filter"
                                                : "No namespaces available"}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                    {loading && (
                        <Box sx={{display: 'flex', justifyContent: 'center', padding: 2}}>
                            <CircularProgress size={24}/>
                        </Box>
                    )}
                </TableContainer>

                <EventLogger
                    eventTypes={namespaceEventTypes}
                    title="Namespaces Events Logger"
                    buttonLabel="Namespace Events"
                />
            </Box>
        </Box>
    );
};

export default Namespaces;
