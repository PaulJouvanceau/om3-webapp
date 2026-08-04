import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
    Box,
    Button,
    Checkbox,
    Chip,
    Divider,
    Drawer,
    IconButton,
    Tooltip,
    Typography,
    useTheme,
    CircularProgress
} from "@mui/material";
import {
    Sensors,
    Close,
    DeleteOutline,
    ExpandMore,
    Pause,
    PlayArrow,
    Settings
} from "@mui/icons-material";
import useEventLogStore from "../hooks/useEventLogStore";
import logger from "../utils/logger.js";
import {startLoggerReception, closeLoggerEventSource} from "../eventSourceManager";

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

const SubscriptionDialog = ({
                                open,
                                onClose,
                                isDarkMode,
                                theme,
                                subscribedEventTypes,
                                setManualSubscriptions,
                                filteredEventTypes,
                                eventStats,
                                clearLogs
                            }) => {
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

    const EventTypeItem = ({eventType, checked, onChange, eventCount}) => (
        <Box key={eventType} sx={{display: 'flex', alignItems: 'center', py: 0.5, pl: 2}}>
            <Checkbox checked={checked} onChange={onChange} size="small"/>
            <Box sx={{flex: 1}}>
                <Typography variant="body2">{eventType}</Typography>
                <Typography variant="caption">{eventCount} events received</Typography>
            </Box>
        </Box>
    );

    const renderEventTypeList = (eventTypes, isPageEvents = false) => (
        <Box sx={{mb: 3}}>
            <Typography
                variant="subtitle2"
                color={isDarkMode ? (isPageEvents ? '#90caf9' : '#a5d6a7') : (isPageEvents ? 'primary.main' : 'success.dark')}
                sx={{mb: 1}}
            >
                {isPageEvents ? 'Page Events' : 'Additional Events'} ({eventTypes.length})
            </Typography>
            {eventTypes.sort().map(eventType => (
                <EventTypeItem
                    key={String(eventType)}
                    eventType={eventType}
                    checked={tempSubscribedEventTypes.includes(eventType)}
                    onChange={(e) => {
                        setTempSubscribedEventTypes(prev =>
                            e.target.checked
                                ? [...new Set([...prev, eventType])]
                                : prev.filter(et => et !== eventType)
                        );
                    }}
                    eventCount={eventStats[eventType] || 0}
                />
            ))}
        </Box>
    );

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            sx={{
                '& .MuiDrawer-paper': {
                    width: 500,
                    maxWidth: '90vw',
                    p: 2,
                    backgroundColor: isDarkMode ? theme.palette.background.paper : '#ffffff'
                }
            }}
        >
            <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2}}>
                <Typography variant="h6" color={isDarkMode ? '#ffffff' : 'inherit'}>
                    Event Subscriptions
                </Typography>
                <IconButton onClick={onClose} aria-label="Close">
                    <Close sx={{color: isDarkMode ? '#ffffff' : 'inherit'}}/>
                </IconButton>
            </Box>
            <Divider sx={{mb: 2}}/>
            <Typography variant="body2" color={isDarkMode ? '#cccccc' : 'text.secondary'} sx={{mb: 2}}>
                Select which event types you want to SUBSCRIBE to (future events only):
            </Typography>
            <Box sx={{mb: 3, display: 'flex', gap: 1, flexWrap: 'wrap'}}>
                <Button size="small" variant="outlined" onClick={handleSubscribeAll}>
                    Subscribe to All
                </Button>
                <Button
                    size="small"
                    variant="outlined"
                    onClick={handleSubscribePageEvents}
                    disabled={filteredEventTypes.length === 0}
                >
                    Subscribe to Page Events
                </Button>
                <Button size="small" variant="outlined" color="error" onClick={handleUnsubscribeAll}>
                    Unsubscribe from All
                </Button>
            </Box>
            <Box sx={{maxHeight: '60vh', overflow: 'auto'}}>
                {filteredEventTypes.length > 0 && renderEventTypeList(filteredEventTypes, true)}
                {otherEventTypes.length > 0 && renderEventTypeList(otherEventTypes, false)}
                {tempSubscribedEventTypes.length === 0 && (
                    <Typography sx={{textAlign: 'center', py: 4}}>
                        No event types selected. You won't receive any events.
                    </Typography>
                )}
            </Box>
            <Box sx={{mt: 'auto', pt: 2}}>
                <Button
                    fullWidth
                    variant="contained"
                    onClick={() => {
                        setManualSubscriptions(tempSubscribedEventTypes);
                        clearLogs();
                        onClose();
                    }}
                >
                    Apply Subscriptions ({tempSubscribedEventTypes.length})
                </Button>
            </Box>
        </Drawer>
    );
};

const SimpleJSONView = ({data}) => {
    const jsonString = useMemo(() => {
        try {
            return JSON.stringify(data, null, 0);
        } catch {
            return String(data);
        }
    }, [data]);
    return (
        <pre style={{
            fontFamily: 'Monaco, Consolas, "Courier New", monospace',
            fontSize: "0.80rem",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            margin: 0,
            lineHeight: 1.2,
            opacity: 0.9,
            maxHeight: 160,
            overflow: "hidden",
            backgroundColor: 'transparent',
            color: 'inherit'
        }}>
            {jsonString}
        </pre>
    );
};

const FullJSONView = ({data, isDarkMode, theme}) => {
    const escapeHtml = (text) => {
        if (typeof text !== 'string') return text;
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };
    const syntaxHighlightJSON = (json) => {
        /* istanbul ignore next */
        if (typeof json !== 'string') {
            try {
                json = JSON.stringify(json, null, 2);
            } catch {
                json = String(json);
            }
        }
        const escapedJson = escapeHtml(json);
        return escapedJson.replace(
            /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
            (match) => {
                let cls = 'json-number';
                /* istanbul ignore next */
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) {
                        cls = 'json-key';
                    } else {
                        cls = 'json-string';
                    }
                } else if (/true|false/.test(match)) {
                    cls = 'json-boolean';
                } else if (/null/.test(match)) {
                    cls = 'json-null';
                }
                return `<span class="${cls}">${match}</span>`;
            }
        );
    };
    const jsonString = useMemo(() => {
        try {
            return JSON.stringify(data, null, 2);
        } catch {
            return String(data);
        }
    }, [data]);
    const coloredJSON = useMemo(() => syntaxHighlightJSON(jsonString), [jsonString]);
    return (
        <pre
            style={{
                fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                fontSize: "0.78rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                margin: 0,
                lineHeight: 1.4,
                backgroundColor: 'transparent',
                color: isDarkMode ? '#ffffff' : theme.palette.text.primary
            }}
            dangerouslySetInnerHTML={{__html: coloredJSON}}
        />
    );
};

const LogRow = React.memo(({
                               log,
                               isOpen,
                               onToggle,
                               isDarkMode,
                               theme
                           }) => {
    const formatTimestamp = (ts) => {
        try {
            return new Date(ts).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                fractionalSecondDigits: 3
            });
        } catch {
            return "INVALID_DATE";
        }
    };
    const getEventColor = (eventType = "") => {
        if (eventType.includes("ERROR")) return "error";
        if (eventType.includes("UPDATED")) return "primary";
        if (eventType.includes("DELETED")) return "warning";
        if (eventType.includes("CONNECTION")) return "info";
        return "default";
    };
    const EventTypeChip = ({eventType}) => {
        const color = getEventColor(eventType);
        return (
            <Chip
                label={eventType}
                size="small"
                color={color === "default" ? "default" : color}
                sx={{
                    fontWeight: '600',
                    backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : undefined,
                    color: isDarkMode ? '#ffffff' : undefined
                }}
            />
        );
    };
    return (
        <Box
            onClick={onToggle}
            sx={{
                cursor: "pointer",
                borderBottom: `1px solid ${isDarkMode ? theme.palette.divider : theme.palette.divider}`,
                mb: 1,
                borderRadius: 1,
                "&:hover": {
                    bgcolor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : theme.palette.action.hover
                },
                bgcolor: isOpen
                    ? isDarkMode ? 'rgba(255, 255, 255, 0.1)' : theme.palette.action.selected
                    : "transparent",
                transition: "background-color 0.2s ease",
                touchAction: 'manipulation',
                p: 1
            }}
        >
            <Box sx={{display: "flex", alignItems: "center", gap: 1}}>
                <EventTypeChip eventType={log.eventType}/>
                <Typography variant="caption" color={isDarkMode ? '#cccccc' : 'textSecondary'}>
                    {formatTimestamp(log.timestamp)}
                </Typography>
                <ExpandMore sx={{
                    marginLeft: "auto",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "0.2s",
                    color: isDarkMode ? '#ffffff' : theme.palette.text.secondary
                }}/>
            </Box>
            {!isOpen && (
                <Box sx={{
                    maxHeight: 160,
                    overflow: "hidden",
                    backgroundColor: isDarkMode ? theme.palette.grey[800] : theme.palette.background.default,
                    borderRadius: 1,
                    mt: 1,
                    p: 1
                }}>
                    <SimpleJSONView data={log.data}/>
                </Box>
            )}
            {isOpen && (
                <Box sx={{
                    borderTop: `1px solid ${isDarkMode ? theme.palette.divider : theme.palette.divider}`,
                    backgroundColor: isDarkMode ? theme.palette.grey[800] : theme.palette.background.default,
                    borderRadius: 1,
                    mt: 1,
                    p: 1
                }}>
                    <FullJSONView data={log.data} isDarkMode={isDarkMode} theme={theme}/>
                </Box>
            )}
        </Box>
    );
}, (prevProps, nextProps) => {
    return prevProps.log === nextProps.log &&
        prevProps.isOpen === nextProps.isOpen &&
        prevProps.isDarkMode === nextProps.isDarkMode;
});

const EventDrawerContent = ({
                                eventTypes,
                                objectName,
                                isDarkMode,
                                theme,
                                onClose,
                                title
                            }) => {
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
            <Box sx={{p: 1, display: "flex", alignItems: "center", justifyContent: "space-between"}}>
                <Box sx={{display: "flex", alignItems: "center", gap: 1}}>
                    <Typography variant="h6" sx={{fontSize: "1rem", color: isDarkMode ? '#ffffff' : 'inherit'}}>
                        {title}
                    </Typography>
                    <Chip
                        label={`${visibleLogs.length}/${filteredLogs.length} events`}
                        size="small"
                        variant="outlined"
                        sx={{
                            backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : undefined,
                            color: isDarkMode ? '#ffffff' : undefined,
                            borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.2)' : undefined
                        }}
                    />
                    {isPaused && (
                        <Chip
                            label="PAUSED"
                            color="warning"
                            size="small"
                            sx={{
                                backgroundColor: isDarkMode ? 'rgba(255, 152, 0, 0.2)' : undefined,
                                color: isDarkMode ? '#ff9800' : undefined
                            }}
                        />
                    )}
                </Box>
                <Box sx={{display: 'flex', gap: 0.5, alignItems: "center"}}>
                    <Tooltip title="Manage subscriptions">
                        <IconButton
                            onClick={() => setSubscriptionDialogOpen(true)}
                            size="small"
                            sx={{color: isDarkMode ? '#ffffff' : undefined}}
                        >
                            <Settings/>
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={isPaused ? "Resume" : "Pause"}>
                        <IconButton
                            onClick={() => setPaused(!isPaused)}
                            color={isPaused ? "warning" : "primary"}
                            size="small"
                            sx={{color: isDarkMode ? '#ffffff' : undefined}}
                        >
                            {isPaused ? <PlayArrow/> : <Pause/>}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Clear logs">
                        <IconButton
                            onClick={handleClear}
                            size="small"
                            disabled={eventLogs.length === 0}
                            sx={{color: isDarkMode ? '#ffffff' : undefined}}
                        >
                            <DeleteOutline/>
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Close">
                        <IconButton
                            onClick={onClose}
                            size="small"
                            sx={{color: isDarkMode ? '#ffffff' : undefined}}
                        >
                            <Close/>
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>
            <Divider sx={{backgroundColor: isDarkMode ? theme.palette.divider : undefined}}/>

            {availableEventTypes.length > 0 && (
                <Box sx={{p: 1, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center'}}>
                    <Typography variant="body2" color={isDarkMode ? '#cccccc' : 'text.secondary'} sx={{mr: 1}}>
                        Filter by type:
                    </Typography>
                    {availableEventTypes.map((eventType) => {
                        const isPageEvent = filteredEventTypes.includes(eventType);
                        const isSelected = selectedEventTypes.includes(eventType);

                        let chipSx = {
                            cursor: 'pointer',
                            fontWeight: 500,
                            borderColor: isDarkMode ? 'rgba(255,255,255,0.2)' : undefined,
                            '&:hover': {
                                filter: 'brightness(0.95)'
                            }
                        };

                        if (isSelected) {
                            if (isPageEvent) {
                                chipSx.backgroundColor = isDarkMode ? '#90caf9' : '#1976d2';
                                chipSx.color = isDarkMode ? '#000000' : '#ffffff';
                            } else {
                                /* istanbul ignore next */
                                chipSx.backgroundColor = isDarkMode ? '#a5d6a7' : '#2e7d32';
                                chipSx.color = isDarkMode ? '#000000' : '#ffffff';
                            }
                        } else {
                            if (isPageEvent) {
                                chipSx.backgroundColor = isDarkMode ? 'rgba(144, 202, 249, 0.2)' : 'rgba(25, 118, 210, 0.1)';
                                chipSx.color = isDarkMode ? '#90caf9' : '#1976d2';
                            } else {
                                chipSx.backgroundColor = isDarkMode ? 'rgba(165, 214, 167, 0.2)' : 'rgba(46, 125, 50, 0.1)';
                                chipSx.color = isDarkMode ? '#a5d6a7' : '#2e7d32';
                            }
                        }

                        return (
                            <Chip
                                key={eventType}
                                label={`${eventType} (${eventStats[eventType] || 0})`}
                                size="small"
                                onClick={() => toggleEventTypeFilter(eventType)}
                                sx={chipSx}
                            />
                        );
                    })}
                </Box>
            )}

            <Divider sx={{backgroundColor: isDarkMode ? theme.palette.divider : undefined}}/>

            <Box
                ref={logsContainerRef}
                onScroll={handleScroll}
                sx={{
                    flex: 1,
                    overflow: "auto",
                    backgroundColor: isDarkMode ? theme.palette.grey[900] : theme.palette.grey[50],
                    padding: 1,
                    WebkitOverflowScrolling: 'touch',
                    position: 'relative'
                }}
            >
                {initialLoading ? (
                    <Box sx={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%'}}>
                        <CircularProgress size={40}/>
                    </Box>
                ) : visibleLogs.length === 0 ? (
                    <Box sx={{p: 4, textAlign: "center"}}>
                        <Typography color={isDarkMode ? '#cccccc' : 'textSecondary'}>
                            {eventLogs.length === 0
                                ? "No events logged"
                                : "No events match current filters"}
                        </Typography>
                    </Box>
                ) : (
                    <>
                        {visibleLogs.map((log) => {
                            const safeId = log.id ?? `log-${log.timestamp}-${log.eventType}`;
                            const isOpen = expandedLogIds.includes(safeId);
                            return (
                                <LogRow
                                    key={safeId}
                                    log={log}
                                    isOpen={isOpen}
                                    onToggle={() => toggleExpand(safeId)}
                                    isDarkMode={isDarkMode}
                                    theme={theme}
                                />
                            );
                        })}
                        {loadingMore && (
                            <Box sx={{display: 'flex', justifyContent: 'center', py: 1}}>
                                <CircularProgress size={24}/>
                            </Box>
                        )}
                    </>
                )}
            </Box>

            <SubscriptionDialog
                open={subscriptionDialogOpen}
                onClose={() => setSubscriptionDialogOpen(false)}
                isDarkMode={isDarkMode}
                theme={theme}
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
                                    title = "Event Logger",
                                    buttonLabel = "Events"
                                }) => {
    const theme = useTheme();
    const isDarkMode = theme.palette.mode === 'dark';
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

    const paperStyle = {
        height: drawerHeight,
        maxHeight: "80vh",
        overflow: "hidden",
        borderTopLeftRadius: 8,
        borderTopRightRadius: 8,
        backgroundColor: isDarkMode ? theme.palette.grey[900] : theme.palette.background.paper,
        touchAction: 'none'
    };

    return (
        <>
            {!drawerOpen && (
                <Tooltip title={title}>
                    <Button
                        variant="contained"
                        startIcon={<Sensors/>}
                        onClick={() => setDrawerOpen(true)}
                        sx={{
                            position: "fixed",
                            bottom: 16,
                            right: 16,
                            zIndex: 9999,
                            borderRadius: "20px",
                            px: 2,
                            backgroundColor: isDarkMode
                                ? 'rgba(30, 30, 30, 0.88)'
                                : 'rgba(255, 255, 255, 0.88)',
                            color: isDarkMode ? '#ffffff' : '#000000',
                            '&:hover': {
                                backgroundColor: isDarkMode
                                    ? 'rgba(30, 30, 30, 0.96)'
                                    : 'rgba(255, 255, 255, 0.96)',
                            },
                            '& .MuiButton-startIcon': {
                                color: isDarkMode ? '#ffffff' : '#000000'
                            }
                        }}
                    >
                        {buttonLabel}
                    </Button>
                </Tooltip>
            )}
            {/* istanbul ignore next */}
            <Drawer
                anchor="bottom"
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                variant="persistent"
                slotProps={{
                    /* istanbul ignore next */
                    paper: {
                        style: paperStyle
                    }
                }}
            >
                <div
                    onMouseDown={handleResizeStart}
                    onTouchStart={handleResizeStart}
                    style={{
                        width: "100%",
                        height: 24,
                        minHeight: 24,
                        backgroundColor: isResizing
                            ? (isDarkMode ? theme.palette.primary.dark : theme.palette.primary.light)
                            : (isDarkMode ? theme.palette.grey[700] : theme.palette.grey[300]),
                        cursor: "row-resize",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        touchAction: "none",
                        userSelect: "none",
                        WebkitUserSelect: "none",
                        MozUserSelect: "none",
                        msUserSelect: "none",
                        position: "relative",
                        zIndex: 2,
                        transition: "background-color 0.2s ease"
                    }}
                    className="resize-handle"
                    aria-label="Resize handle"
                >
                    <div style={{
                        width: 60,
                        height: 6,
                        backgroundColor: isDarkMode ? theme.palette.grey[500] : theme.palette.grey[500],
                        borderRadius: 3,
                        opacity: isResizing ? 0.8 : 1
                    }}/>
                </div>
                {drawerOpen && (
                    <EventDrawerContent
                        eventTypes={eventTypes}
                        objectName={objectName}
                        isDarkMode={isDarkMode}
                        theme={theme}
                        onClose={() => setDrawerOpen(false)}
                        title={title}
                    />
                )}
            </Drawer>
            <style>{`
                .json-key { color: ${isDarkMode ? '#90caf9' : theme.palette.primary.main}; font-weight: 600; }
                .json-string { color: ${isDarkMode ? '#a5d6a7' : theme.palette.success.dark}; }
                .json-number { color: ${isDarkMode ? '#80cbc4' : theme.palette.info.main}; font-weight: 500; }
                .json-boolean { color: ${isDarkMode ? '#ffcc80' : theme.palette.warning.dark}; font-weight: 600; }
                .json-null { color: ${isDarkMode ? theme.palette.grey[400] : theme.palette.grey[500]}; font-weight: 600; }
                @media (max-width: 768px) {
                    .MuiDrawer-paper {
                        max-height: 90vh !important;
                        touch-action: none;
                    }
                    .resize-handle {
                        height: 32px !important;
                        min-height: 32px !important;
                    }
                    .MuiChip-root {
                        font-size: 0.7rem !important;
                    }
                    .MuiTypography-body2 {
                        font-size: 0.8rem !important;
                    }
                    .MuiButton-root {
                        padding: 6px 12px !important;
                        min-height: 36px !important;
                    }
                    .MuiIconButton-root {
                        padding: 6px !important;
                        min-width: 36px !important;
                        min-height: 36px !important;
                    }
                }
                @media screen and (max-width: 768px) {
                    input, select, textarea {
                        font-size: 16px !important;
                    }
                }
            `}</style>
        </>
    );
});

export default EventLogger;
