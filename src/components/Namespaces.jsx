import React, {useEffect, useState, useMemo, useCallback, useRef, useDeferredValue} from "react";
import {useNavigate, useLocation} from "react-router-dom";
import {closeEventSource, startEventReception} from "../eventSourceManager.jsx";
import EventLogger from "../components/EventLogger";
import {useNamespaceData} from "../hooks/useNamespaceData";
import {Table, HeaderRow, HeaderCell, SortHeaderCell, Row, Cell, EmptyRow} from "../ui/components/Table";
import {StatusCount} from "../ui/components/StatusCount";
import {Select} from "../ui/components/Field";
import {Spinner} from "../ui/components/Spinner";
import {IconButton} from "../ui/components/Button";
import {SlideOver} from "../ui/components/SlideOver";
import {CodeIcon} from "../ui/icons";
import NamespaceMetrics from "./NamespaceMetrics";

const STATUSES = ["up", "down", "warn", "n/a"];

const STATUS_COLUMNS = [
    {column: "up", label: "Up"},
    {column: "down", label: "Down"},
    {column: "warn", label: "Warn"},
    {column: "n/a", label: "N/A"},
];

const MARK_STATE = {up: "up", down: "down", warn: "warn", "n/a": "unknown"};

export const areStatusDotPropsEqual = (prev, next) =>
    prev.status === next.status && prev.count === next.count && prev.namespace === next.namespace;

/** A status mark and its count; the count opens the objects of the namespace in that state. */
const NamespaceStatusCount = React.memo(({status, count, namespace, onClick}) => (
    <StatusCount
        state={MARK_STATE[status]}
        count={count}
        label={`Show the ${count} ${status} object${count === 1 ? "" : "s"} of ${namespace}`}
        onClick={() => onClick(status)}
    />
), (prev, next) => areStatusDotPropsEqual(prev, next) && prev.onClick === next.onClick);

const NamespaceTableRow = React.memo(({
                                          namespace,
                                          counts,
                                          onNamespaceClick,
                                          onStatusClick,
                                          onOpenMetrics
                                      }) => {
    const total = useMemo(() =>
            counts.up + counts.down + counts.warn + counts["n/a"],
        [counts]
    );

    const handleRowClick = useCallback(() => {
        onNamespaceClick(namespace);
    }, [onNamespaceClick, namespace]);

    const handleStatusClick = useCallback((status) => {
        onStatusClick(namespace, status);
    }, [onStatusClick, namespace]);

    return (
        <Row onActivate={handleRowClick}>
            <Cell className="font-medium">{namespace}</Cell>
            {STATUSES.map((status) => (
                <Cell key={status} numeric>
                    <NamespaceStatusCount
                        status={status}
                        count={counts[status]}
                        namespace={namespace}
                        onClick={handleStatusClick}
                    />
                </Cell>
            ))}
            <Cell numeric className="font-semibold tabular-nums">{total}</Cell>
            <Cell align="center">
                <IconButton
                    size="sm"
                    className="align-middle"
                    label={`View metrics for namespace ${namespace}`}
                    onClick={(event) => {
                        event.stopPropagation();
                        onOpenMetrics(namespace);
                    }}
                >
                    <CodeIcon className="h-4 w-4"/>
                </IconButton>
            </Cell>
        </Row>
    );
}, (prev, next) => {
    return prev.namespace === next.namespace &&
        prev.onOpenMetrics === next.onOpenMetrics &&
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
    const [metricsNamespace, setMetricsNamespace] = useState(null);

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

    const handleNamespaceChange = useCallback((e) => {
        const newNamespace = e.target.value || "all";
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

    const handleOpenMetrics = useCallback((namespace) => {
        setMetricsNamespace(namespace);
    }, []);

    const handleCloseMetrics = useCallback(() => {
        setMetricsNamespace(null);
    }, []);

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

    // The filter may come from the URL with a namespace not in the list: keep it selectable.
    const namespaceOptions = useMemo(() => {
        const options = ["all", ...namespaces];
        if (!options.includes(selectedNamespace)) options.push(selectedNamespace);
        return options;
    }, [namespaces, selectedNamespace]);

    return (
        <div className="flex h-full flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1 text-ink-muted">
                    Filter by namespace
                    <Select className="h-7" value={selectedNamespace} onChange={handleNamespaceChange}>
                        {namespaceOptions.map((namespace) => (
                            <option key={namespace} value={namespace}>{namespace}</option>
                        ))}
                    </Select>
                </label>
            </div>

            <Table
                ref={tableContainerRef}
                sticky
                data-testid="table-container"
                className="min-h-0 flex-1 overflow-auto"
            >
                <thead>
                    <HeaderRow>
                        <SortHeaderCell
                            label="Namespace"
                            active={sortColumn === "namespace"}
                            direction={sortDirection}
                            onSort={() => handleSort("namespace")}
                        />
                        {STATUS_COLUMNS.map(({column, label}) => (
                            <SortHeaderCell
                                key={column}
                                label={label}
                                active={sortColumn === column}
                                direction={sortDirection}
                                onSort={() => handleSort(column)}
                                align="right"
                            />
                        ))}
                        <SortHeaderCell
                            label="Total"
                            active={sortColumn === "total"}
                            direction={sortDirection}
                            onSort={() => handleSort("total")}
                            align="right"
                        />
                        <HeaderCell align="center">Metrics</HeaderCell>
                    </HeaderRow>
                </thead>
                <tbody>
                    {visibleNamespaces.length > 0 ? (
                        visibleNamespaces.map(([namespace, counts]) => (
                            <NamespaceTableRow
                                key={namespace}
                                namespace={namespace}
                                counts={counts}
                                onNamespaceClick={handleNamespaceClick}
                                onStatusClick={handleStatusClick}
                                onOpenMetrics={handleOpenMetrics}
                            />
                        ))
                    ) : (
                        <EmptyRow colSpan={7}>
                            <span data-testid="no-namespaces-message">
                                {selectedNamespace !== "all"
                                    ? "No namespaces match the selected filter"
                                    : "No namespaces available"}
                            </span>
                        </EmptyRow>
                    )}
                </tbody>
            </Table>
            {loading && (
                <div className="flex justify-center">
                    <Spinner label="Loading more namespaces"/>
                </div>
            )}

            <SlideOver
                open={metricsNamespace !== null}
                title={metricsNamespace !== null ? `Metrics of ${metricsNamespace}` : "Metrics"}
                onClose={handleCloseMetrics}
                closeLabel="Close"
                size="wide"
                resizeLabel="Resize drawer"
            >
                {metricsNamespace !== null && <NamespaceMetrics namespace={metricsNamespace}/>}
            </SlideOver>

            <EventLogger
                eventTypes={namespaceEventTypes}
                title="Namespaces Events Logger"
                buttonLabel="Namespace Events"
            />
        </div>
    );
};

export default Namespaces;
