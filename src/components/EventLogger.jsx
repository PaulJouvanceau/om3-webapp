import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Button, IconButton} from "../ui/components/Button";
import {Checkbox} from "../ui/components/Field";
import {SlideOver} from "../ui/components/SlideOver";
import {Spinner} from "../ui/components/Spinner";
import {useAnyPanelOpen} from "../ui/components/slide-over-open";
import {CaretRightIcon, ChevronDownIcon, CloseIcon, GearIcon, PauseIcon, RssIcon, TrashIcon} from "../ui/icons";
import {cn} from "../ui/cn";
import useEventLogStore from "../hooks/useEventLogStore";
import logger from "../utils/logger.js";
import {startLoggerReception, closeLoggerEventSource} from "../eventSourceManager";
import {useTranslation} from "react-i18next";

const CONNECTION_EVENTS = [
    'CONNECTION_OPENED',
    'CONNECTION_ERROR',
    'RECONNECTION_ATTEMPT',
    'MAX_RECONNECTIONS_REACHED',
    'CONNECTION_CLOSED'
];

const ALL_EVENT_TYPES = [
    'NodeStatusUpdated',
    'NodeMonitorUpdated',
    'NodeStatsUpdated',
    'DaemonHeartbeatUpdated',
    'ObjectStatusUpdated',
    'InstanceStatusUpdated',
    'ObjectDeleted',
    'InstanceMonitorUpdated',
    'InstanceConfigUpdated'
];

export const hashCode = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
};

/** Larger tap targets on narrow screens. */
const TOOL = "max-md:h-9 max-md:w-9";

const SubscriptionDialog = ({
                                open,
                                onClose,
                                subscribedEventTypes,
                                setManualSubscriptions,
                                filteredEventTypes,
                                eventStats,
                                clearLogs
                            }) => {
    const {t} = useTranslation();
    const [tempSubscribedEventTypes, setTempSubscribedEventTypes] = useState(subscribedEventTypes);

    useEffect(() => {
        if (open) {
            setTempSubscribedEventTypes(subscribedEventTypes);
        }
    }, [open, subscribedEventTypes]);

    const otherEventTypes = useMemo(() => {
        return ALL_EVENT_TYPES.filter(type => !filteredEventTypes.includes(type)).sort();
    }, [filteredEventTypes]);

    const handleSubscribeAll = () => {
        setTempSubscribedEventTypes([...ALL_EVENT_TYPES]);
    };

    const handleSubscribePageEvents = () => {
        const currentOther = tempSubscribedEventTypes.filter(
            type => !filteredEventTypes.includes(type)
        );
        setTempSubscribedEventTypes(
            [...new Set([...currentOther, ...filteredEventTypes])]
        );
    };

    const handleUnsubscribeAll = () => {
        setTempSubscribedEventTypes([]);
    };

    const renderEventTypeList = (eventTypes, isPageEvents = false) => (
        <section className="space-y-1">
            <h3 className={cn("font-semibold", isPageEvents ? "text-accent" : "text-ink-muted")}>
                {isPageEvents
                    ? t("events.subscriptions.pageEvents", {total: eventTypes.length})
                    : t("events.subscriptions.additionalEvents", {total: eventTypes.length})}
            </h3>
            {eventTypes.sort().map(eventType => (
                <div key={String(eventType)} className="py-0.5 pl-2">
                    <Checkbox
                        checked={tempSubscribedEventTypes.includes(eventType)}
                        onChange={(e) => {
                            const checked = e.target.checked;
                            setTempSubscribedEventTypes(prev =>
                                checked
                                    ? [...new Set([...prev, eventType])]
                                    : prev.filter(et => et !== eventType)
                            );
                        }}
                        label={
                            <span className="flex flex-col leading-tight">
                                <span>{eventType}</span>
                                <span className="text-data text-ink-muted">
                                    {t("events.subscriptions.received", {count: eventStats[eventType] || 0})}
                                </span>
                            </span>
                        }
                    />
                </div>
            ))}
        </section>
    );

    return (
        // Above the bottom panel of the event logger.
        <div className="relative z-[1250]">
            <SlideOver
                open={open}
                onClose={onClose}
                title={t("events.subscriptions.title")}
                closeLabel={t("events.subscriptions.close")}
            >
                <div className="flex min-h-full flex-col gap-4">
                    <p className="text-ink-muted">
                        {t("events.subscriptions.intro")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={handleSubscribeAll}>
                            {t("events.subscriptions.subscribeAll")}
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSubscribePageEvents}
                            disabled={filteredEventTypes.length === 0}
                        >
                            {t("events.subscriptions.subscribePage")}
                        </Button>
                        <Button size="sm" className="text-state-down" onClick={handleUnsubscribeAll}>
                            {t("events.subscriptions.unsubscribeAll")}
                        </Button>
                    </div>
                    <div className="space-y-4">
                        {filteredEventTypes.length > 0 && renderEventTypeList(filteredEventTypes, true)}
                        {otherEventTypes.length > 0 && renderEventTypeList(otherEventTypes, false)}
                        {tempSubscribedEventTypes.length === 0 && (
                            <p className="py-8 text-center text-ink-muted">
                                {t("events.subscriptions.noneSelected")}
                            </p>
                        )}
                    </div>
                    <div className="sticky bottom-0 mt-auto bg-surface-raised pt-2">
                        <Button
                            variant="primary"
                            className="w-full"
                            onClick={() => {
                                setManualSubscriptions(tempSubscribedEventTypes);
                                clearLogs();
                                onClose();
                            }}
                        >
                            {t("events.subscriptions.apply", {total: tempSubscribedEventTypes.length})}
                        </Button>
                    </div>
                </div>
            </SlideOver>
        </div>
    );
};

/** Text of the JSON, or what the value says of itself when it cannot be serialised. */
const toJSON = (data, indent) => {
    try {
        return JSON.stringify(data, null, indent) ?? String(data);
    } catch {
        return String(data);
    }
};

const JSON_TOKEN = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;

/** Class names written out in full, for Tailwind. */
const TOKEN_CLASSES = {
    key: "text-code-key font-semibold",
    string: "text-code-string",
    number: "text-code-number",
    boolean: "text-code-keyword font-semibold",
    null: "text-code-keyword font-semibold",
};

/** Splits a JSON text into coloured tokens; between them, only punctuation and spaces. */
const highlightJSON = (json) => {
    const parts = [];
    let last = 0;
    for (const match of json.matchAll(JSON_TOKEN)) {
        const text = match[0];
        if (match.index > last) {
            parts.push({kind: "punct", text: json.slice(last, match.index)});
        }
        if (text.startsWith('"')) {
            if (match[3]) {
                const colon = text.length - match[3].length;
                parts.push({kind: "key", text: text.slice(0, colon)});
                parts.push({kind: "punct", text: text.slice(colon)});
            } else {
                parts.push({kind: "string", text});
            }
        } else if (text === "true" || text === "false") {
            parts.push({kind: "boolean", text});
        } else if (text === "null") {
            parts.push({kind: "null", text});
        } else {
            parts.push({kind: "number", text});
        }
        last = match.index + text.length;
    }
    if (last < json.length) parts.push({kind: "punct", text: json.slice(last)});
    return parts;
};

const FullJSONView = ({data}) => {
    const parts = useMemo(() => highlightJSON(toJSON(data, 2)), [data]);
    return (
        <pre className="m-0 font-mono text-data leading-snug break-words whitespace-pre-wrap text-ink">
            {parts.map((part, i) => (
                <span
                    key={i}
                    data-token={part.kind}
                    className={part.kind === "punct" ? "text-code-punct" : TOKEN_CLASSES[part.kind]}
                >
                    {part.text}
                </span>
            ))}
        </pre>
    );
};

const formatTimestamp = (ts, language) => {
    try {
        return new Date(ts).toLocaleTimeString(language, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            fractionalSecondDigits: 3
        });
    } catch {
        return "INVALID_DATE";
    }
};

/** Tone of an event type: the label itself tells the type, the colour only doubles it. */
const getEventTone = (eventType = "") => {
    if (eventType.includes("ERROR")) return "error";
    if (eventType.includes("UPDATED")) return "primary";
    if (eventType.includes("DELETED")) return "warning";
    if (eventType.includes("CONNECTION")) return "info";
    return "default";
};

const TONE_CLASSES = {
    error: "text-state-down",
    primary: "text-accent",
    warning: "text-state-warn",
    info: "text-ink-muted",
    default: "text-ink",
};

const LogRow = React.memo(({log, isOpen, onToggle}) => {
    const {i18n} = useTranslation();
    const tone = getEventTone(log.eventType);
    const preview = useMemo(() => (isOpen ? "" : toJSON(log.data, 0)), [isOpen, log.data]);
    return (
        <li className={cn("border-b border-line", isOpen && "bg-surface-sunken")}>
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={isOpen}
                className="flex h-[30px] w-full touch-manipulation items-center gap-2 px-3 text-left text-data hover:bg-surface-sunken"
            >
                <span className="shrink-0 tabular-nums text-ink-muted">{formatTimestamp(log.timestamp, i18n.language)}</span>
                <span data-tone={tone} className={cn("shrink-0 font-semibold", TONE_CLASSES[tone])}>
                    {log.eventType}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-ink-muted">{preview}</span>
                <ChevronDownIcon
                    className={cn("ml-auto shrink-0 text-ink-muted transition-transform", isOpen && "rotate-180")}
                />
            </button>
            {isOpen && (
                <div className="border-t border-line bg-surface px-3 py-2">
                    <FullJSONView data={log.data}/>
                </div>
            )}
        </li>
    );
}, (prevProps, nextProps) => {
    return prevProps.log === nextProps.log &&
        prevProps.isOpen === nextProps.isOpen;
});

const EventDrawerContent = ({
                                eventTypes,
                                objectName,
                                onClose,
                                title
                            }) => {
    const {t} = useTranslation();
    const [selectedEventTypes, setSelectedEventTypes] = useState([]);
    const [expandedLogIds, setExpandedLogIds] = useState([]);
    const [visibleCount, setVisibleCount] = useState(20);
    const [loadingMore, setLoadingMore] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false);
    const [manualSubscriptions, setManualSubscriptions] = useState([]);
    const logsContainerRef = useRef(null);

    const filteredEventTypes = useMemo(() => {
        return eventTypes.filter(et => !CONNECTION_EVENTS.includes(et));
    }, [eventTypes]);

    const pageKey = useMemo(() => {
        const baseKey = objectName || 'global';
        const eventTypesKey = filteredEventTypes.sort().join(',');
        const hash = hashCode(eventTypesKey);
        return `eventLogger_${baseKey}_${hash}`;
    }, [objectName, filteredEventTypes]);

    useEffect(() => {
        setManualSubscriptions([...filteredEventTypes]);
    }, [filteredEventTypes]);

    useEffect(() => {
        const token = localStorage.getItem("authToken");
        if (token) {
            const eventsToSubscribe = [...manualSubscriptions];
            const connectionEvents = eventTypes.filter(et => CONNECTION_EVENTS.includes(et));
            eventsToSubscribe.push(...connectionEvents);
            const uniqueEvents = [...new Set(eventsToSubscribe)];
            if (uniqueEvents.length > 0) {
                logger.log("Starting logger reception (drawer opened):", {
                    pageKey,
                    manualSubscriptions,
                    allEvents: uniqueEvents,
                    objectName
                });
                try {
                    startLoggerReception(token, uniqueEvents, objectName);
                } catch (error) {
                    logger.warn("Failed to start logger reception:", error);
                }
            } else {
                logger.log("No events to subscribe to for this page");
                closeLoggerEventSource();
            }
        }
        return () => {
            logger.log("Closing logger reception (drawer closing)");
            closeLoggerEventSource();
        };
    }, [manualSubscriptions, objectName, eventTypes, pageKey]);

    const {eventLogs = [], isPaused, setPaused, clearLogs} = useEventLogStore();

    const baseFilteredLogs = useMemo(() => {
        let filtered = Array.isArray(eventLogs) ? eventLogs : [];
        if (manualSubscriptions.length === 0 && filteredEventTypes.length > 0) {
            filtered = filtered.filter(log => filteredEventTypes.includes(log.eventType));
        } else if (manualSubscriptions.length > 0) {
            filtered = filtered.filter(log => manualSubscriptions.includes(log.eventType));
        }
        const connectionEventsFromPage = eventTypes.filter(et => CONNECTION_EVENTS.includes(et));
        if (connectionEventsFromPage.length > 0) {
            filtered = filtered.filter(log =>
                manualSubscriptions.includes(log.eventType) ||
                connectionEventsFromPage.includes(log.eventType)
            );
        }
        if (objectName) {
            filtered = filtered.filter(log => {
                const data = log.data || {};
                if (log.eventType?.includes?.("CONNECTION")) return true;
                if (log.eventType === "ObjectDeleted" && data._rawEvent) {
                    try {
                        const raw = JSON.parse(data._rawEvent);
                        if (raw.path === objectName || raw.labels?.path === objectName) return true;
                    } catch {
                    }
                }
                if (data.path === objectName) return true;
                if (data.labels?.path === objectName) return true;
                if (data.data?.path === objectName) return true;
                return data.data?.labels?.path === objectName;
            });
        }
        return filtered;
    }, [eventLogs, manualSubscriptions, objectName, eventTypes, filteredEventTypes]);

    const availableEventTypes = useMemo(() => {
        const types = new Set();
        baseFilteredLogs.forEach(log => types.add(log.eventType));
        return Array.from(types).sort();
    }, [baseFilteredLogs]);

    const eventStats = useMemo(() => {
        const stats = {};
        baseFilteredLogs.forEach(log => {
            stats[log.eventType] = (stats[log.eventType] || 0) + 1;
        });
        return stats;
    }, [baseFilteredLogs]);

    const filteredLogs = useMemo(() => {
        let result = [...baseFilteredLogs];
        if (selectedEventTypes.length > 0) {
            result = result.filter(log => selectedEventTypes.includes(log.eventType));
        }
        return result;
    }, [baseFilteredLogs, selectedEventTypes]);

    const visibleLogs = useMemo(() => {
        return filteredLogs.slice(0, visibleCount);
    }, [filteredLogs, visibleCount]);

    useEffect(() => {
        const timer = setTimeout(() => setInitialLoading(false), 200);
        return () => clearTimeout(timer);
    }, []);

    const handleScroll = useCallback(() => {
        /* istanbul ignore next */
        if (loadingMore) return;
        /* istanbul ignore next */
        const container = logsContainerRef.current;
        if (!container) return;
        const {scrollTop, scrollHeight, clientHeight} = container;
        const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
        if (scrollPercentage > 0.8 && visibleCount < filteredLogs.length) {
            setLoadingMore(true);
            setTimeout(() => {
                setVisibleCount(prev => Math.min(prev + 20, filteredLogs.length));
                setLoadingMore(false);
            }, 100);
        }
    }, [loadingMore, visibleCount, filteredLogs.length, initialLoading]);

    useEffect(() => {
        const container = logsContainerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
            return () => container.removeEventListener('scroll', handleScroll);
        }
    }, [handleScroll]);

    useEffect(() => {
        setVisibleCount(20);
    }, [selectedEventTypes]);

    const handleClear = useCallback(() => {
        clearLogs();
        setSelectedEventTypes([]);
        setExpandedLogIds([]);
        setVisibleCount(20);
    }, [clearLogs]);

    const toggleExpand = useCallback((id) => {
        setExpandedLogIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    }, []);

    const toggleEventTypeFilter = useCallback((eventType) => {
        setSelectedEventTypes(prev =>
            prev.includes(eventType)
                ? prev.filter(et => et !== eventType)
                : [...prev, eventType]
        );
    }, []);

    return (
        <>
            <div className="flex items-center gap-2 border-b border-line px-3 py-1.5">
                <h2 className="truncate font-semibold">{title}</h2>
                <span className="shrink-0 rounded-full border border-line px-2 text-data text-ink-muted tabular-nums">
                    {t("events.count", {visible: visibleLogs.length, total: filteredLogs.length})}
                </span>
                {isPaused && (
                    <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-state-warn bg-state-warn-soft px-2 text-data font-semibold text-state-warn">
                        <PauseIcon className="h-3 w-3"/>
                        {t("events.paused")}
                    </span>
                )}
                <div className="ml-auto flex shrink-0 items-center gap-1">
                    <IconButton
                        label={t("events.manageSubscriptions")}
                        className={TOOL}
                        onClick={() => setSubscriptionDialogOpen(true)}
                    >
                        <GearIcon/>
                    </IconButton>
                    <IconButton
                        label={isPaused ? t("events.resume") : t("events.pause")}
                        className={cn(TOOL, isPaused && "border-state-warn text-state-warn")}
                        onClick={() => setPaused(!isPaused)}
                    >
                        {isPaused ? <CaretRightIcon/> : <PauseIcon/>}
                    </IconButton>
                    <IconButton
                        label={t("events.clear")}
                        className={TOOL}
                        onClick={handleClear}
                        disabled={eventLogs.length === 0}
                    >
                        <TrashIcon/>
                    </IconButton>
                    <IconButton label={t("common.close")} className={TOOL} onClick={onClose}>
                        <CloseIcon/>
                    </IconButton>
                </div>
            </div>

            {availableEventTypes.length > 0 && (
                <div
                    role="group"
                    aria-label={t("events.filterByType")}
                    className="flex max-h-24 shrink-0 flex-wrap items-center gap-1.5 overflow-y-auto border-b border-line px-3 py-1.5 text-data"
                >
                    <span aria-hidden="true" className="mr-1 text-ink-muted">{t("events.filterByTypeColon")}</span>
                    {availableEventTypes.map((eventType) => {
                        const isPageEvent = filteredEventTypes.includes(eventType);
                        const isSelected = selectedEventTypes.includes(eventType);
                        return (
                            <button
                                key={eventType}
                                type="button"
                                aria-pressed={isSelected}
                                data-page-event={isPageEvent}
                                title={isPageEvent ? t("events.pageEvent") : t("events.additionalEvent")}
                                onClick={() => toggleEventTypeFilter(eventType)}
                                className={cn(
                                    "inline-flex h-6 items-center rounded-full border px-2 font-medium whitespace-nowrap max-md:h-8",
                                    isPageEvent
                                        ? (isSelected
                                            ? "border-accent bg-accent text-accent-ink"
                                            : "border-accent bg-accent-soft text-accent hover:brightness-95")
                                        : (isSelected
                                            ? "border-ink bg-ink text-surface-raised"
                                            : "border-dashed border-line-strong bg-surface text-ink hover:bg-surface-sunken")
                                )}
                            >
                                {`${eventType} (${eventStats[eventType] || 0})`}
                            </button>
                        );
                    })}
                </div>
            )}

            <div
                ref={logsContainerRef}
                onScroll={handleScroll}
                role="region"
                aria-label={t("events.list")}
                tabIndex={0}
                className="relative min-h-0 flex-1 overflow-auto bg-surface outline-none"
            >
                {initialLoading ? (
                    <div className="flex h-full items-center justify-center">
                        <Spinner label={t("events.loading")}/>
                    </div>
                ) : visibleLogs.length === 0 ? (
                    <p className="p-8 text-center text-ink-muted">
                        {eventLogs.length === 0
                            ? t("events.empty")
                            : t("events.noMatch")}
                    </p>
                ) : (
                    <>
                        <ul>
                            {visibleLogs.map((log) => {
                                const safeId = log.id ?? `log-${log.timestamp}-${log.eventType}`;
                                const isOpen = expandedLogIds.includes(safeId);
                                return (
                                    <LogRow
                                        key={safeId}
                                        log={log}
                                        isOpen={isOpen}
                                        onToggle={() => toggleExpand(safeId)}
                                    />
                                );
                            })}
                        </ul>
                        {loadingMore && (
                            <div className="flex justify-center py-1">
                                <Spinner label={t("events.loadingMore")}/>
                            </div>
                        )}
                    </>
                )}
            </div>

            <SubscriptionDialog
                open={subscriptionDialogOpen}
                onClose={() => setSubscriptionDialogOpen(false)}
                subscribedEventTypes={manualSubscriptions}
                setManualSubscriptions={setManualSubscriptions}
                filteredEventTypes={filteredEventTypes}
                eventStats={eventStats}
                clearLogs={clearLogs}
            />
        </>
    );
};

const EventLogger = React.memo(({
                                    eventTypes = [],
                                    objectName = null,
                                    title: titleProp,
                                    buttonLabel: buttonLabelProp
                                }) => {
    const {t} = useTranslation();
    const title = titleProp ?? t("events.title");
    const buttonLabel = buttonLabelProp ?? t("events.button");
    const anyPanelOpen = useAnyPanelOpen();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerHeight, setDrawerHeight] = useState(320);
    const [isResizing, setIsResizing] = useState(false);
    const startYRef = useRef(0);
    const startHeightRef = useRef(0);
    const isDraggingRef = useRef(false);
    const resizeTimeoutRef = useRef(null);

    const handleResizeStart = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        isDraggingRef.current = true;
        startYRef.current = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
        startHeightRef.current = drawerHeight;
        document.body.style.userSelect = 'none';
        document.body.style.touchAction = 'none';
        document.body.style.overflow = 'hidden';
        if (resizeTimeoutRef.current) {
            clearTimeout(resizeTimeoutRef.current);
            resizeTimeoutRef.current = null;
        }
    }, [drawerHeight]);

    const handleResizeMove = useCallback((e) => {
        if (!isDraggingRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
        const deltaY = startYRef.current - clientY;
        const newHeight = Math.max(220, Math.min(window.innerHeight * 0.8, startHeightRef.current + deltaY));
        if (resizeTimeoutRef.current) {
            clearTimeout(resizeTimeoutRef.current);
        }
        resizeTimeoutRef.current = setTimeout(() => {
            setDrawerHeight(newHeight);
        }, 16);
    }, []);

    const handleResizeEnd = useCallback(() => {
        if (!isDraggingRef.current) return;
        setIsResizing(false);
        isDraggingRef.current = false;
        document.body.style.userSelect = '';
        document.body.style.touchAction = '';
        document.body.style.overflow = '';
        if (resizeTimeoutRef.current) {
            clearTimeout(resizeTimeoutRef.current);
            resizeTimeoutRef.current = null;
        }
    }, []);

    useEffect(() => {
        const handleMouseMove = (e) => handleResizeMove(e);
        const handleTouchMove = (e) => handleResizeMove(e);
        const handleMouseUp = (e) => handleResizeEnd(e);
        const handleTouchEnd = (e) => handleResizeEnd(e);
        const handleTouchCancel = (e) => handleResizeEnd(e);
        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('touchmove', handleTouchMove, {passive: false});
            document.addEventListener('mouseup', handleMouseUp);
            document.addEventListener('touchend', handleTouchEnd);
            document.addEventListener('touchcancel', handleTouchCancel);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('touchend', handleTouchEnd);
            document.removeEventListener('touchcancel', handleTouchCancel);
            if (resizeTimeoutRef.current) {
                clearTimeout(resizeTimeoutRef.current);
                resizeTimeoutRef.current = null;
            }
        };
    }, [isResizing, handleResizeMove, handleResizeEnd]);

    return (
        <>
            {/* Hidden while a side panel is open, as oc3 hides its floating controls:
                it would sit over the bottom of the panel. */}
            {!drawerOpen && !anyPanelOpen && (
                <button
                    type="button"
                    title={title}
                    onClick={() => setDrawerOpen(true)}
                    className="fixed right-4 bottom-4 z-[1200] inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface-raised px-3 font-medium text-ink shadow hover:bg-surface-sunken max-md:h-9"
                >
                    <RssIcon className="shrink-0 text-ink-muted"/>
                    {buttonLabel}
                </button>
            )}
            {drawerOpen && (
                <section
                    aria-label={title}
                    style={{height: drawerHeight}}
                    className="fixed inset-x-0 bottom-0 z-[1200] flex max-h-[80vh] touch-none flex-col overflow-hidden rounded-t-(--radius-panel) border-t border-line bg-surface-raised text-ink shadow-lg max-md:max-h-[90vh]"
                >
                    <div
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={t("events.resizeHandle")}
                        title={t("events.dragToResize")}
                        data-resizing={isResizing}
                        onMouseDown={handleResizeStart}
                        onTouchStart={handleResizeStart}
                        className={cn(
                            "flex h-6 shrink-0 cursor-row-resize touch-none items-center justify-center select-none transition-colors max-md:h-8",
                            isResizing ? "bg-accent-soft" : "hover:bg-surface-sunken"
                        )}
                    >
                        <span
                            aria-hidden="true"
                            className={cn("h-1 w-12 rounded-full", isResizing ? "bg-accent" : "bg-line-strong")}
                        />
                    </div>
                    <EventDrawerContent
                        eventTypes={eventTypes}
                        objectName={objectName}
                        onClose={() => setDrawerOpen(false)}
                        title={title}
                    />
                </section>
            )}
        </>
    );
});

export default EventLogger;
