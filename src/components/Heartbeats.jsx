import React, {
    useEffect,
    useState,
    useMemo,
    useCallback,
    useRef,
    useDeferredValue,
    useSyncExternalStore,
} from "react";
import {useLocation, useNavigate} from "react-router-dom";
import {useTranslation} from "react-i18next";

import useEventStore from "../hooks/useEventStore.js";
import {closeEventSource, startEventReception} from "../eventSourceManager.jsx";
import EventLogger from "../components/EventLogger";
import {Table, HeaderRow, SortHeaderCell, Row, Cell, EmptyRow} from "../ui/components/Table";
import {StatusMark} from "../ui/components/StatusMark";
import {Select} from "../ui/components/Field";
import {Button} from "../ui/components/Button";
import {Spinner} from "../ui/components/Spinner";
import {ChevronDownIcon, FilterIcon} from "../ui/icons";

// The breakpoints of the MUI theme the view used: below md (900px) the filters fold
// behind a button, from lg (1200px) they are always shown at first.
const MOBILE_QUERY = "(max-width:899.95px)";
const WIDE_QUERY = "(min-width:1200px)";

/** Whether a media query matches, kept up to date; false where matchMedia is missing. */
const useMediaQuery = (query) => useSyncExternalStore(
    useCallback((onChange) => {
        if (typeof window.matchMedia !== "function") return () => {};
        const list = window.matchMedia(query);
        list.addEventListener("change", onChange);
        return () => list.removeEventListener("change", onChange);
    }, [query]),
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
);

/** A running stream is up, a stopped or failed one down, a warning one warn. */
const STREAM_STATUS = {running: "up", warning: "warn", stopped: "down", failed: "down"};

/** The columns of the table, their titles translated at render. */
const COLUMNS = [
    {labelKey: "heartbeats.columns.running", key: "state"},
    {labelKey: "heartbeats.columns.beating", key: "beating"},
    {labelKey: "heartbeats.columns.id", key: "id"},
    {labelKey: "heartbeats.columns.node", key: "node"},
    {labelKey: "heartbeats.columns.peer", key: "peer"},
    {labelKey: "heartbeats.columns.type", key: "type"},
    {labelKey: "heartbeats.columns.desc", key: "desc"},
    {labelKey: "heartbeats.columns.changedAt", key: "changed_at"},
    {labelKey: "heartbeats.columns.lastBeatingAt", key: "last_beating_at"}
];

const StateMark = React.memo(({state}) => {
    const {t} = useTranslation();
    return <StatusMark state={STREAM_STATUS[state] ?? "unknown"} label={t("heartbeats.marks.state", {state: state || "unknown"})}/>;
}, (prev, next) => prev.state === next.state);

/** A beating peer is up, a stale one down. A single node has no peer to miss: up. */
const BeatingMark = React.memo(({isBeating, isSingleNode}) => {
    const {t} = useTranslation();
    return isSingleNode || isBeating
        ? <StatusMark state="up" label={t(isSingleNode ? "heartbeats.marks.healthySingleNode" : "heartbeats.marks.beating")}/>
        : <StatusMark state="down" label={t("heartbeats.marks.stale")}/>;
}, (prev, next) => prev.isBeating === next.isBeating && prev.isSingleNode === next.isSingleNode);

const HeartbeatRow = React.memo(({row, isSingleNode}) => {
    return (
        <Row>
            <Cell><StateMark state={row.state}/></Cell>
            <Cell><BeatingMark isBeating={row.isBeating} isSingleNode={isSingleNode}/></Cell>
            <Cell>{row.id}</Cell>
            <Cell>{row.node}</Cell>
            <Cell>{row.peer}</Cell>
            <Cell>{row.type}</Cell>
            <Cell>{row.desc}</Cell>
            {/* The dates stay on one line: wrapped, they would make the row taller than the others. */}
            <Cell className="whitespace-nowrap">{row.changedAt}</Cell>
            <Cell className="whitespace-nowrap">{row.lastBeatingAt}</Cell>
        </Row>
    );
}, (prev, next) => {
    return (
        prev.row.id === next.row.id &&
        prev.row.node === next.row.node &&
        prev.row.peer === next.row.peer &&
        prev.row.isBeating === next.row.isBeating &&
        prev.row.state === next.row.state &&
        prev.isSingleNode === next.isSingleNode
    );
});

const Heartbeats = () => {
    const {t} = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const eventStarted = useRef(false);
    const tableContainerRef = useRef(null);
    const isMobile = useMediaQuery(MOBILE_QUERY);
    const isWideScreen = useMediaQuery(WIDE_QUERY);

    const heartbeatStatus = useEventStore((state) => state.heartbeatStatus);
    const [stoppedStreamsCache, setStoppedStreamsCache] = useState({});
    const [sortColumn, setSortColumn] = useState("node");
    const [sortDirection, setSortDirection] = useState("asc");
    const [visibleCount, setVisibleCount] = useState(30);
    const [loading, setLoading] = useState(false);

    const [showFilters, setShowFilters] = useState(() => isWideScreen ? true : !isMobile);

    // Read query parameters
    const queryParams = new URLSearchParams(location.search);
    const rawStatus = queryParams.get("status") || "all";
    const rawNode = queryParams.get("node") || "all";
    const rawState = queryParams.get("state") || "all";
    const rawId = queryParams.get("id") || "all";

    const [filterBeating, setFilterBeating] = useState(
        ["all", "beating", "stale"].includes(rawStatus) ? rawStatus : "all"
    );
    const [filterNode, setFilterNode] = useState(rawNode);
    const [filterState, setFilterState] = useState(rawState);
    const [filterId, setFilterId] = useState(() => {
        let cleaned = rawId;
        if (cleaned.startsWith("hb#")) {
            cleaned = cleaned.replace(/^hb#/, "");
        }
        return cleaned.replace(/\.(rx|tx)$/, "");
    });

    const deferredFilterBeating = useDeferredValue(filterBeating);
    const deferredFilterNode = useDeferredValue(filterNode);
    const deferredFilterState = useDeferredValue(filterState);
    const deferredFilterId = useDeferredValue(filterId);
    const deferredSortColumn = useDeferredValue(sortColumn);
    const deferredSortDirection = useDeferredValue(sortDirection);

    const heartbeatEventTypes = useMemo(() => [
        "DaemonHeartbeatUpdated",
        "CONNECTION_OPENED",
        "CONNECTION_ERROR",
        "RECONNECTION_ATTEMPT",
        "MAX_RECONNECTIONS_REACHED",
        "CONNECTION_CLOSED"
    ], []);

    // Update URL when filters change
    useEffect(() => {
        const timer = setTimeout(() => {
            const currentParams = new URLSearchParams(location.search);
            const currentStatus = currentParams.get("status") || "all";
            const currentNode = currentParams.get("node") || "all";
            const currentState = currentParams.get("state") || "all";
            const currentId = currentParams.get("id") || "all";

            if (currentStatus === filterBeating &&
                currentNode === filterNode &&
                currentState === filterState &&
                currentId === filterId) {
                return;
            }

            const newQueryParams = new URLSearchParams();
            if (filterBeating !== "all") newQueryParams.set("status", filterBeating);
            if (filterNode !== "all") newQueryParams.set("node", filterNode);
            if (filterState !== "all") newQueryParams.set("state", filterState);
            if (filterId !== "all") newQueryParams.set("id", filterId);

            const queryString = newQueryParams.toString();
            const newUrl = `${location.pathname}${queryString ? `?${queryString}` : ""}`;

            if (newUrl !== location.pathname + location.search) {
                navigate(newUrl, {replace: true});
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [filterBeating, filterNode, filterState, filterId, navigate, location.pathname, location.search]);

    // Initialize filter states from URL
    useEffect(() => {
        let cleanedId = rawId;
        if (cleanedId.startsWith("hb#")) {
            cleanedId = cleanedId.replace(/^hb#/, "");
        }
        const baseId = cleanedId.replace(/\.(rx|tx)$/, "");

        setFilterBeating(["all", "beating", "stale"].includes(rawStatus) ? rawStatus : "all");
        setFilterNode(rawNode);
        setFilterState(rawState);
        setFilterId(baseId);
    }, [location.search, rawStatus, rawNode, rawState, rawId]);

    // Cache stopped streams with their last known peers
    useEffect(() => {
        setStoppedStreamsCache((prev) => {
            const newCache = {...prev};
            const entries = Object.entries(heartbeatStatus);

            for (let i = 0; i < entries.length; i++) {
                const [node, nodeData] = entries[i];
                const streams = nodeData.streams || [];

                if (!newCache[node]) newCache[node] = {};

                for (let j = 0; j < streams.length; j++) {
                    const stream = streams[j];
                    if (Object.keys(stream.peers || {}).length > 0) {
                        newCache[node][stream.id] = {
                            ...stream,
                            peers: {...stream.peers},
                        };
                    }
                }
            }

            return newCache;
        });
    }, [heartbeatStatus]);

    // Start event reception with heartbeat-specific filters
    useEffect(() => {
        const token = localStorage.getItem("authToken");
        if (token && !eventStarted.current) {
            startEventReception(token, heartbeatEventTypes);
            eventStarted.current = true;
        }

        return () => {
            closeEventSource();
            eventStarted.current = false;
        };
    }, [heartbeatEventTypes]);

    const nodes = useMemo(() => {
        return [...new Set(Object.keys(heartbeatStatus))].sort();
    }, [heartbeatStatus]);

    const isSingleNode = nodes.length === 1;

    const availableStates = useMemo(() => {
        const states = new Set(["all"]);
        const values = Object.values(heartbeatStatus);

        for (let i = 0; i < values.length; i++) {
            const streams = values[i].streams || [];
            for (let j = 0; j < streams.length; j++) {
                if (streams[j].state) states.add(streams[j].state);
            }
        }

        return Array.from(states).sort();
    }, [heartbeatStatus]);

    const availableIds = useMemo(() => {
        const ids = new Set();
        const values = Object.values(heartbeatStatus);

        for (let i = 0; i < values.length; i++) {
            const streams = values[i].streams || [];
            for (let j = 0; j < streams.length; j++) {
                const stream = streams[j];
                if (stream.id && stream.id !== "all") {
                    const cleanedId = stream.id.replace(/^hb#/, "");
                    const baseId = cleanedId.replace(/\.(rx|tx)$/, "");
                    ids.add(baseId);
                }
            }
        }

        return Array.from(ids).sort();
    }, [heartbeatStatus]);

    const streamRows = useMemo(() => {
        const notAvailable = t("common.notAvailable");
        const rows = [];
        const entries = Object.entries(heartbeatStatus);

        for (let i = 0; i < entries.length; i++) {
            const [node, nodeData] = entries[i];
            const streams = nodeData.streams || [];

            for (let j = 0; j < streams.length; j++) {
                const stream = streams[j];
                const cachedStream = stoppedStreamsCache[node]?.[stream.id] || {};
                const peers = stream.state === "stopped" && Object.keys(stream.peers || {}).length === 0
                    ? cachedStream.peers || {}
                    : stream.peers || {};

                const cleanedId = stream.id.replace(/^hb#/, "");

                if (Object.keys(peers).length === 0 && stream.state === "stopped") {
                    rows.push({
                        id: cleanedId,
                        node: node,
                        peer: notAvailable,
                        type: stream.type || notAvailable,
                        desc: notAvailable,
                        isBeating: false,
                        changedAt: notAvailable,
                        lastBeatingAt: notAvailable,
                        state: stream.state,
                    });
                } else {
                    const peerEntries = Object.entries(peers);
                    for (let k = 0; k < peerEntries.length; k++) {
                        const [peerKey, peerData] = peerEntries[k];
                        rows.push({
                            id: cleanedId,
                            node,
                            peer: peerKey || notAvailable,
                            type: stream.type || notAvailable,
                            desc: peerData?.desc || notAvailable,
                            isBeating: peerData?.is_beating || false,
                            changedAt: peerData?.changed_at || notAvailable,
                            lastBeatingAt: peerData?.last_beating_at || notAvailable,
                            state: stream.state || "unknown",
                        });
                    }
                }
            }
        }

        return rows;
    }, [heartbeatStatus, stoppedStreamsCache, t]);

    const sortedRows = useMemo(() => {
        const stateOrder = {running: 4, warning: 3, stopped: 2, failed: 1, unknown: 0};

        return [...streamRows].sort((a, b) => {
            let diff = 0;
            if (deferredSortColumn === "state") {
                diff = stateOrder[a.state] - stateOrder[b.state];
            } else if (deferredSortColumn === "beating") {
                diff = Number(a.isBeating) - Number(b.isBeating);
            } else if (deferredSortColumn === "id") {
                diff = a.id.localeCompare(b.id, undefined, {sensitivity: "base"});
            } else if (deferredSortColumn === "node") {
                diff = a.node.localeCompare(b.node, undefined, {sensitivity: "base"});
            } else if (deferredSortColumn === "peer") {
                diff = a.peer.localeCompare(b.peer, undefined, {sensitivity: "base"});
            } else if (deferredSortColumn === "type") {
                diff = a.type.localeCompare(b.type, undefined, {sensitivity: "base"});
            } else if (deferredSortColumn === "desc") {
                diff = a.desc.localeCompare(b.desc, undefined, {sensitivity: "base"});
            } else if (deferredSortColumn === "changed_at") {
                diff = a.changedAt.localeCompare(b.changedAt, undefined, {sensitivity: "base"});
            } else if (deferredSortColumn === "last_beating_at") {
                diff = a.lastBeatingAt.localeCompare(b.lastBeatingAt, undefined, {sensitivity: "base"});
            }
            return deferredSortDirection === "asc" ? diff : -diff;
        });
    }, [streamRows, deferredSortColumn, deferredSortDirection]);

    const filteredRows = useMemo(() => {
        return sortedRows.filter((row) => {
            const rowBaseId = row.id.replace(/\.(rx|tx)$/, "");
            return (
                (deferredFilterBeating === "all" ||
                    (deferredFilterBeating === "beating" && row.isBeating === true) ||
                    (deferredFilterBeating === "stale" && row.isBeating === false)) &&
                (deferredFilterNode === "all" || row.node === deferredFilterNode) &&
                (deferredFilterState === "all" || row.state === deferredFilterState) &&
                (deferredFilterId === "all" || rowBaseId === deferredFilterId)
            );
        });
    }, [sortedRows, deferredFilterBeating, deferredFilterNode, deferredFilterState, deferredFilterId]);

    const visibleRows = useMemo(() => {
        return filteredRows.slice(0, visibleCount);
    }, [filteredRows, visibleCount]);

    const handleSort = useCallback((column) => {
        setSortColumn(prev => {
            if (prev === column) {
                setSortDirection(dir => dir === "asc" ? "desc" : "asc");
                return column;
            }
            setSortDirection("asc");
            return column;
        });
        setVisibleCount(30);
    }, []);

    const toggleShowFilters = useCallback(() => {
        setShowFilters(prev => !prev);
    }, []);

    const handleFilterChange = useCallback((setter) => (event) => {
        setter(event.target.value);
        setVisibleCount(30);
    }, []);

    const handleScroll = useCallback(() => {
        if (loading) return;

        const container = tableContainerRef.current;
        const {scrollTop, scrollHeight, clientHeight} = container;
        const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

        if (scrollPercentage > 0.8 && visibleCount < filteredRows.length) {
            setLoading(true);
            setTimeout(() => {
                setVisibleCount(prev => Math.min(prev + 30, filteredRows.length));
                setLoading(false);
            }, 100);
        }
    }, [loading, visibleCount, filteredRows.length]);

    useEffect(() => {
        const container = tableContainerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
            return () => container.removeEventListener('scroll', handleScroll);
        }
    }, [handleScroll]);

    useEffect(() => {
        setVisibleCount(30);
    }, [filteredRows]);

    const filterSelect = (label, value, setter, options) => (
        <label className="flex items-center gap-1 text-ink-muted">
            {label}
            <Select className="h-7" value={value} onChange={handleFilterChange(setter)}>
                <option value="all">{t("common.all")}</option>
                {options.map(([optionValue, optionLabel]) => (
                    <option key={optionValue} value={optionValue}>{optionLabel}</option>
                ))}
            </Select>
        </label>
    );

    return (
        <div className="flex h-full flex-col p-4 space-y-3">
            <div className="flex shrink-0 flex-wrap items-center gap-3">
                {isMobile && (
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={<FilterIcon className="h-4 w-4"/>}
                        onClick={toggleShowFilters}
                        aria-label={showFilters ? t("heartbeats.filters.hide") : t("heartbeats.filters.show")}
                        aria-expanded={showFilters}
                        aria-controls="heartbeats-filters"
                    >
                        <span className="hidden sm:inline">{t("common.filters")}</span>
                        <ChevronDownIcon className={showFilters ? "h-4 w-4 rotate-180" : "h-4 w-4"}/>
                    </Button>
                )}
                <div
                    id="heartbeats-filters"
                    hidden={!showFilters}
                    className="flex flex-wrap items-center gap-3"
                >
                    {filterSelect(t("heartbeats.filters.running"), filterState, setFilterState, availableStates
                        .filter(s => s !== "all")
                        .map(state => [state, state.charAt(0).toUpperCase() + state.slice(1)]))}
                    {filterSelect(t("heartbeats.filters.beating"), filterBeating, setFilterBeating, [
                        ["beating", t("heartbeats.marks.beating")],
                        ["stale", t("heartbeats.marks.stale")],
                    ])}
                    {filterSelect(t("common.node"), filterNode, setFilterNode, nodes.map(node => [node, node]))}
                    {filterSelect(t("heartbeats.filters.id"), filterId, setFilterId, availableIds.map(id => [id, id]))}
                </div>
            </div>

            <Table sticky ref={tableContainerRef} className="min-h-0 overflow-auto">
                <thead>
                    <HeaderRow>
                        {COLUMNS.map(({labelKey, key}) => (
                            <SortHeaderCell
                                key={key}
                                label={t(labelKey)}
                                active={sortColumn === key}
                                direction={sortDirection}
                                onSort={() => handleSort(key)}
                            />
                        ))}
                    </HeaderRow>
                </thead>
                <tbody>
                    {visibleRows.map(row => (
                        <HeartbeatRow
                            key={`${row.node}-${row.id}-${row.peer}`}
                            row={row}
                            isSingleNode={isSingleNode}
                        />
                    ))}
                    {visibleRows.length === 0 && (
                        <EmptyRow colSpan={COLUMNS.length}>
                            {t("heartbeats.empty")}
                        </EmptyRow>
                    )}
                </tbody>
            </Table>
            {loading && (
                <div className="flex shrink-0 justify-center">
                    <Spinner label={t("heartbeats.loadingMore")}/>
                </div>
            )}

            <EventLogger eventTypes={heartbeatEventTypes} title={t("heartbeats.eventsLogger")}
                         buttonLabel={t("heartbeats.events")}/>
        </div>
    );
};

export default Heartbeats;
