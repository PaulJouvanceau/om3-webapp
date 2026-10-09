import React, {useEffect, useState, useMemo, useCallback, useRef, useDeferredValue} from "react";
import {useLocation, useNavigate} from "react-router-dom";
import useEventStore from "../hooks/useEventStore.js";
import useFetchDaemonStatus from "../hooks/useFetchDaemonStatus";
import logger from '../utils/logger.js';
import {closeEventSource, startEventReception, forceFlush} from "../eventSourceManager";
import {URL_OBJECT} from "../config/apiPath.js";
import {extractNamespace, isActionAllowedForSelection} from "../utils/objectUtils";
import {OBJECT_ACTIONS} from "../constants/actions";
import ActionDialogManager from "./ActionDialogManager";
import EventLogger from "../components/EventLogger";
import {useObjectData} from "../hooks/useObjectData";
import {useNodeData} from "../hooks/useNodeData";
import {Table, HeaderRow, HeaderCell, SortHeaderCell, Row, Cell, EmptyRow} from "../ui/components/Table";
import {StoppedMark, RpoBreachedMark} from "../ui/components/StateMarks";
import {StatusMark} from "../ui/components/StatusMark";
import {FrozenMark} from "../ui/components/FrozenMark";
import {MenuButton} from "../ui/components/MenuButton";
import {Button, IconButton} from "../ui/components/Button";
import {Checkbox, Input} from "../ui/components/Field";
import {Alert} from "../ui/components/Alert";
import {Spinner} from "../ui/components/Spinner";
import {useMediaQuery} from "../ui/lib/media";
import {AlertTriangleIcon, ChevronDownIcon, CloseIcon, FilterIcon, SearchIcon} from "../ui/icons";

// The breakpoints of the MUI theme the view used: below md (900px) the filters fold
// behind a button, from lg (1200px) the node columns are shown.
const MOBILE_QUERY = "(max-width:899.95px)";
const WIDE_QUERY = "(min-width:1200px)";

/** How long a feedback message stays, as the snackbar it replaces. */
const FEEDBACK_DURATION_MS = 4000;

/** Feedback tones, from the severities of the snackbar it replaces. */
const TONES = {info: "info", success: "success", warning: "warning", error: "error"};

/** An availability as a mark state: n/a and anything unknown read as unknown. */
const MARK_STATE = {up: "up", down: "down", warn: "warn"};
const markState = (avail) => MARK_STATE[avail] ?? "unknown";

/** Icons of the action menus, the destructive ones in the down colour. */
const ACTION_ICON = "flex h-4 w-4 items-center justify-center text-ink-muted [&>svg]:h-4! [&>svg]:w-4!";
const DANGER_ACTION_ICON = "flex h-4 w-4 items-center justify-center text-state-down [&>svg]:h-4! [&>svg]:w-4!";

/** The zero timestamp of the API reads as "not set". */
const ZERO_TIME = "0001-01-01T00:00:00Z";
const hasTimestamp = (value) => !!value && value !== ZERO_TIME;

const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

const actionIcon = ({icon, color}) => (
    <span aria-hidden="true" className={color === "red" ? DANGER_ACTION_ICON : ACTION_ICON}>{icon}</span>
);

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

/** The not-provisioned mark: an icon in the down colour, named for screen readers. */
const NotProvisionedMark = () => (
    <span role="img" aria-label="Not provisioned" title="Not provisioned" className="inline-flex text-state-down">
        <AlertTriangleIcon className="h-3.5 w-3.5"/>
    </span>
);

/** Small muted text on one line: a global expect, a monitor state. */
const SideText = ({children}) => (
    <span title={children} className="text-[0.75rem] whitespace-nowrap text-ink-muted">{children}</span>
);

const StatusMarks = React.memo(({avail, isNotProvisioned, frozen, globalExpect}) => (
    <span className="inline-flex items-center gap-1.5">
        <StatusMark state={markState(avail)} label={avail || "n/a"}/>
        <FrozenMark frozen={frozen === "frozen"}/>
        {isNotProvisioned && <NotProvisionedMark/>}
        {globalExpect && <SideText>{globalExpect}</SideText>}
    </span>
), (prev, next) => prev.avail === next.avail && prev.isNotProvisioned === next.isNotProvisioned &&
    prev.frozen === next.frozen && prev.globalExpect === next.globalExpect);

const NodeStatus = React.memo(({objectName, node}) => {
    const nodeData = useNodeData(objectName, node);
    // Stopped and RPO breached come straight from the instance status: one string each.
    const stoppedAt = useEventStore((s) => s.objectInstanceStatus?.[objectName]?.[node]?.stopped_at);
    const rpoBreachedAt = useEventStore((s) => s.objectInstanceStatus?.[objectName]?.[node]?.rpo_breached_at);
    const hasData = Boolean(nodeData?.avail);
    if (!hasData) return null;
    const isNodeNotProvisioned = nodeData.provisioned === "false" || nodeData.provisioned === false;
    const isStopped = hasTimestamp(stoppedAt);
    const isLagging = hasTimestamp(rpoBreachedAt);

    return (
        <span className="inline-flex items-center gap-1.5" data-node={node}>
            <StatusMark state={markState(nodeData.avail)} label={nodeData.avail}/>
            {isStopped && <StoppedMark stoppedAt={stoppedAt}/>}
            {/* A breached RPO takes the place of the frozen mark, as in the other views. */}
            {isLagging ? <RpoBreachedMark/> : <FrozenMark frozen={nodeData.frozen === "frozen"}/>}
            {isNodeNotProvisioned && <NotProvisionedMark/>}
            {nodeData.state && <SideText>{nodeData.state}</SideText>}
        </span>
    );
}, (prev, next) => prev.objectName === next.objectName && prev.node === next.node);

/**
 * The columns of the object properties, read from its status: how the daemon
 * orchestrates it and how its instances are laid out. Objects without instances
 * to place (cfg, sec, usr) have no orchestrate nor topology.
 */
export const PROPERTY_COLUMNS = [
    {key: "orchestrate", label: "Orchestrate", value: (status) => status?.orchestrate},
    {key: "topology", label: "Topology", value: (status) => status?.topology},
];
const PROPERTY_COLUMN = Object.fromEntries(PROPERTY_COLUMNS.map((column) => [column.key, column]));

/** Values missing go last whatever the direction, as there is nothing to compare. */
const compareProperty = (a, b, direction) => {
    const missingA = a === undefined || a === null || a === "";
    const missingB = b === undefined || b === null || b === "";
    if (missingA || missingB) return missingA === missingB ? 0 : missingA ? 1 : -1;
    const diff = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
    return direction === "asc" ? diff : -diff;
};

/** The property cells of an object row, each read on its own from the store. */
const PropertyCells = ({objectName}) => {
    const status = (s) => s.objectStatus?.[objectName];
    const orchestrate = useEventStore((s) => status(s)?.orchestrate);
    const topology = useEventStore((s) => status(s)?.topology);
    const flexMin = useEventStore((s) => status(s)?.flex?.min);
    const flexMax = useEventStore((s) => status(s)?.flex?.max);
    const isFlex = topology === "flex" && flexMin !== undefined && flexMax !== undefined;

    return (
        <>
            <Cell className="whitespace-nowrap">{orchestrate}</Cell>
            <Cell className="whitespace-nowrap">
                {topology}
                {isFlex && <> <SideText>{`${flexMin}-${flexMax}`}</SideText></>}
            </Cell>
        </>
    );
};

const stopPropagation = (e) => e.stopPropagation();

const TableRowComponent = React.memo(({
                                          objectName,
                                          isSelected,
                                          onSelectObject,
                                          onObjectClick,
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

    return (
        <Row onActivate={handleRowClick} className={isSelected ? "bg-accent-soft" : undefined}>
            <Cell align="center" className="w-8">
                <Checkbox
                    checked={isSelected}
                    onChange={handleCheckboxChange}
                    onClick={stopPropagation}
                    aria-label={`Select object ${objectName}`}
                />
            </Cell>
            <Cell className="whitespace-nowrap">
                <StatusMarks
                    avail={objectData.avail}
                    isNotProvisioned={objectData.isNotProvisioned}
                    frozen={objectData.frozen}
                    globalExpect={objectData.globalExpect}
                />
            </Cell>
            <Cell className="text-data font-medium whitespace-nowrap">{objectName}</Cell>
            <PropertyCells objectName={objectName}/>
            {isWideScreen &&
                allNodes.map((node) => (
                    <Cell key={node} className="whitespace-nowrap">
                        <NodeStatus objectName={objectName} node={node}/>
                    </Cell>
                ))}
        </Row>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.objectName === nextProps.objectName &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.isWideScreen === nextProps.isWideScreen &&
        prevProps.allNodes.length === nextProps.allNodes.length &&
        prevProps.allNodes.every((node, i) => node === nextProps.allNodes[i])
    );
});

/**
 * A multi-valued filter of the toolbar: a popover of checkboxes, as oc3 does for its
 * column picker. The summary tells the filter and what it keeps; a click outside or
 * Escape closes the popover.
 */
const FilterPopover = ({label, options, selected, onToggle}) => {
    const ref = useRef(null);

    useEffect(() => {
        const onPointerDown = (event) => {
            const details = ref.current;
            if (details?.open && !details.contains(event.target)) details.open = false;
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, []);

    const onKeyDown = (event) => {
        const details = ref.current;
        if (event.key !== "Escape" || !details?.open) return;
        event.preventDefault();
        event.stopPropagation();
        details.open = false;
        details.querySelector("summary")?.focus();
    };

    const labelOf = (value) => options.find((option) => option.value === value)?.text ?? value;
    const summary = selected.length === 0 ? "All" : selected.map(labelOf).join(", ");

    return (
        <details ref={ref} className="relative" onKeyDown={onKeyDown}>
            <summary
                className="flex h-7 cursor-pointer list-none items-center gap-1 rounded-(--radius-control) border border-line bg-surface px-2 whitespace-nowrap text-ink-muted hover:border-line-strong [&::-webkit-details-marker]:hidden">
                {label}
                <span className="max-w-40 truncate text-ink">{summary}</span>
                <ChevronDownIcon className="h-3.5 w-3.5"/>
            </summary>
            <div
                role="group"
                aria-label={label}
                className="absolute top-full left-0 z-30 mt-1 flex max-h-72 min-w-44 flex-col gap-1 overflow-auto rounded-(--radius-panel) border border-line bg-surface-raised p-2 shadow-lg"
            >
                {options.length === 0 && <span className="text-ink-muted">None</span>}
                {options.map((option) => (
                    <Checkbox
                        key={option.value}
                        checked={selected.includes(option.value)}
                        onChange={() => onToggle(option.value)}
                        label={
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                {option.mark && <span aria-hidden="true" className="inline-flex">{option.mark}</span>}
                                {option.text}
                            </span>
                        }
                    />
                ))}
            </div>
        </details>
    );
};

/** The values on offer, plus those chosen (from the URL) that the data does not hold. */
const withSelected = (values, selected) => [...values, ...selected.filter((value) => !values.includes(value))];

const GLOBAL_STATE_MARKS = {
    up: <StatusMark state="up"/>,
    down: <StatusMark state="down"/>,
    warn: <StatusMark state="warn"/>,
    "n/a": <StatusMark state="unknown"/>,
    unprovisioned: <AlertTriangleIcon className="h-3.5 w-3.5 text-state-down"/>,
};

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
    const [selectedNamespaces, setSelectedNamespaces] = useState(rawNamespaces);
    const [selectedKinds, setSelectedKinds] = useState(rawKinds);
    const [selectedGlobalStates, setSelectedGlobalStates] = useState(rawGlobalStates);
    const [snackbar, setSnackbar] = useState({open: false, message: "", severity: "info"});
    const [pendingAction, setPendingAction] = useState(null);
    const [searchQuery, setSearchQuery] = useState(rawSearchQuery);
    const [sortColumn, setSortColumn] = useState("object");
    const [sortDirection, setSortDirection] = useState("asc");
    const [statusCycleIndex, setStatusCycleIndex] = useState(0);
    const isWideScreen = useMediaQuery(WIDE_QUERY);
    const isMobile = useMediaQuery(MOBILE_QUERY);
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

    const filtersId = React.useId();

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
            kindSet.add(parseObjectName(name).kind);
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
            if (deferredSelectedKinds.length > 0 && !deferredSelectedKinds.includes(parseObjectName(name).kind)) {
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

        const property = PROPERTY_COLUMN[deferredSortColumn];
        if (property) {
            return [...filteredObjectNames].sort((a, b) =>
                compareProperty(property.value(objects[a]), property.value(objects[b]), deferredSortDirection) ||
                a.localeCompare(b)
            );
        }

        return filteredObjectNames;
    }, [objects, filteredObjectNames, deferredSortColumn, deferredSortDirection, deferredStatusCycleIndex, objectStatus, objectInstanceStatus, allNodes]);

    const visibleObjectNames = useMemo(() => {
        return sortedObjectNames.slice(0, visibleCount);
    }, [sortedObjectNames, visibleCount]);

    const handleSelectObject = useCallback((event, objectName) => {
        setSelectedObjects((prev) =>
            event.target.checked ? [...prev, objectName] : prev.filter((obj) => obj !== objectName)
        );
    }, []);

    // The menus close themselves once an entry is chosen.
    const handleActionClick = useCallback(
        (action, isSingleObject = false, objectName = null) => {
            setPendingAction({action, target: isSingleObject ? objectName : null});
        },
        []
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
                const endpoint = OBJECT_ACTIONS.find((a) => a.name === action)?.endpoint ?? `action/${action}`;
                const url = `${URL_OBJECT}/${namespace}/${kind}/${name}/${endpoint}`;
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

    // The feedback message hides itself after a while, as the snackbar did.
    useEffect(() => {
        if (!snackbar.open) return;
        const timer = setTimeout(handleSnackbarClose, FEEDBACK_DURATION_MS);
        return () => clearTimeout(timer);
    }, [snackbar, handleSnackbarClose]);

    const globalStateOptions = useMemo(
        () => withSelected(globalStates, selectedGlobalStates).map((state) => ({
            value: state,
            text: capitalize(state),
            mark: GLOBAL_STATE_MARKS[state],
        })),
        [globalStates, selectedGlobalStates]
    );
    const namespaceOptions = useMemo(
        () => withSelected(namespaces, selectedNamespaces).map((namespace) => ({value: namespace, text: namespace})),
        [namespaces, selectedNamespaces]
    );
    const kindOptions = useMemo(
        () => withSelected(kinds, selectedKinds).map((kind) => ({value: kind, text: kind})),
        [kinds, selectedKinds]
    );

    // Kind-limited actions (svc-only enable / disable) are offered when the whole selection is of that kind.
    const bulkActions = useMemo(() => {
        const selectedKinds = new Set(selectedObjects.map((obj) => parseObjectName(obj).kind));
        return OBJECT_ACTIONS
            .filter((action) => !action.kinds ||
                (selectedKinds.size > 0 && [...selectedKinds].every((kind) => action.kinds.includes(kind))))
            .map((action) => ({
                key: action.name,
                label: capitalize(action.name),
                icon: actionIcon(action),
                disabled: !isActionAllowedForSelection(action.name, selectedObjects),
                onSelect: () => handleActionClick(action.name),
            }));
    }, [selectedObjects, handleActionClick]);

    const columnCount = 3 + PROPERTY_COLUMNS.length + (isWideScreen ? allNodes.length : 0);

    return (
        <div className="flex h-full flex-col gap-3 p-4">
            <div className="flex shrink-0 flex-wrap items-center gap-3">
                {isMobile && (
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={<FilterIcon className="h-4 w-4"/>}
                        onClick={toggleShowFilters}
                        aria-label={showFilters ? "Hide filters" : "Show filters"}
                        aria-expanded={showFilters}
                        aria-controls={filtersId}
                    >
                        <span className="hidden sm:inline">Filters</span>
                        <ChevronDownIcon className={showFilters ? "h-4 w-4 rotate-180" : "h-4 w-4"}/>
                    </Button>
                )}
                {(!isMobile || showFilters) && (
                    <div id={filtersId} className="flex flex-wrap items-center gap-3">
                        <FilterPopover
                            label="Global State"
                            options={globalStateOptions}
                            selected={selectedGlobalStates}
                            onToggle={handleGlobalStateChange}
                        />
                        <FilterPopover
                            label="Namespace"
                            options={namespaceOptions}
                            selected={selectedNamespaces}
                            onToggle={handleNamespaceChange}
                        />
                        <FilterPopover
                            label="Kind"
                            options={kindOptions}
                            selected={selectedKinds}
                            onToggle={handleKindChange}
                        />
                        <label className="flex items-center gap-1 text-ink-muted">
                            Name
                            <span className="relative flex items-center">
                                <SearchIcon className="pointer-events-none absolute left-2 h-3.5 w-3.5"/>
                                <Input
                                    type="search"
                                    className="h-7 w-48 pl-7"
                                    value={searchQuery}
                                    onChange={handleSearchChange}
                                />
                            </span>
                        </label>
                    </div>
                )}
                <div className="ml-auto flex items-center gap-3">
                    {selectedObjects.length > 0 && (
                        <span className="whitespace-nowrap text-ink-muted">{selectedObjects.length} selected</span>
                    )}
                    <MenuButton
                        label="Actions on selected objects"
                        disabled={!selectedObjects.length}
                        align="end"
                        items={bulkActions}
                    />
                </div>
            </div>

            {snackbar.open && (
                <Alert
                    tone={TONES[snackbar.severity] ?? "info"}
                    className="shrink-0"
                    action={
                        <IconButton label="Close" bare onClick={handleSnackbarClose}>
                            <CloseIcon className="h-4 w-4"/>
                        </IconButton>
                    }
                >
                    {snackbar.message}
                </Alert>
            )}

            <Table ref={tableContainerRef} sticky aria-label="Objects" className="min-h-0 flex-1">
                <thead>
                    <HeaderRow>
                        <HeaderCell align="center" className="w-8">
                            <Checkbox
                                checked={selectedObjects.length === filteredObjectNames.length && filteredObjectNames.length > 0}
                                onChange={handleSelectAll}
                                aria-label="Select all objects"
                            />
                        </HeaderCell>
                        <SortHeaderCell
                            label="Status"
                            active={sortColumn === "status"}
                            direction={sortDirection}
                            onSort={() => handleSort("status")}
                        />
                        <SortHeaderCell
                            label="Object"
                            active={sortColumn === "object"}
                            direction={sortDirection}
                            onSort={() => handleSort("object")}
                        />
                        {PROPERTY_COLUMNS.map(({key, label}) => (
                            <SortHeaderCell
                                key={key}
                                label={label}
                                active={sortColumn === key}
                                direction={sortDirection}
                                onSort={() => handleSort(key)}
                            />
                        ))}
                        {isWideScreen && allNodes.map((node) => (
                            <SortHeaderCell
                                key={node}
                                label={node}
                                active={sortColumn === node}
                                direction={sortDirection}
                                onSort={() => handleSort(node)}
                            />
                        ))}
                    </HeaderRow>
                </thead>
                <tbody>
                    {visibleObjectNames.map((objectName) => (
                        <TableRowComponent
                            key={objectName}
                            objectName={objectName}
                            isSelected={selectedObjects.includes(objectName)}
                            onSelectObject={handleSelectObject}
                            onObjectClick={handleObjectClick}
                            allNodes={allNodes}
                            isWideScreen={isWideScreen}
                        />
                    ))}
                    {visibleObjectNames.length === 0 && (
                        <EmptyRow colSpan={columnCount}>
                            No objects found matching the current filters.
                        </EmptyRow>
                    )}
                </tbody>
            </Table>
            {loading && (
                <div className="flex shrink-0 justify-center">
                    <Spinner label="Loading more objects"/>
                </div>
            )}

            <ActionDialogManager
                pendingAction={pendingAction}
                handleConfirm={handleExecuteActionOnSelected}
                target={pendingAction?.target ? `object ${pendingAction.target}` : `${selectedObjects.length} objects`}
                supportedActions={OBJECT_ACTIONS.map((action) => action.name)}
                onClose={handleClosePendingAction}
            />
            <EventLogger eventTypes={objectEventTypes} title="Object Events Logger" buttonLabel="Object Events"/>
        </div>
    );
};

export default Objects;
