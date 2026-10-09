import React, {useEffect, useState, useRef, useCallback, useMemo, useId} from "react";
import {Button, IconButton} from "../ui/components/Button";
import {StateGlyph} from "../ui/components/StateGlyph";
import {Input, Checkbox} from "../ui/components/Field";
import {Alert} from "../ui/components/Alert";
import {Spinner} from "../ui/components/Spinner";
import {CaretRightIcon, ChevronDownIcon, CloseIcon, DownloadIcon, PauseIcon, SearchIcon, TrashIcon} from "../ui/icons";
import {cn} from "../ui/cn";
import {URL_NODE} from "../config/apiPath.js";
import logger from '../utils/logger.js';
import {useTranslation} from "react-i18next";

const LogsViewer = ({
                        nodename,
                        type = "node",
                        namespace = "root",
                        kind = "svc",
                        instanceName,
                        maxLogs = 1000,
                        height = "500px",
                        bottomSpacing = 30,
                    }) => {
    const {t, i18n} = useTranslation();
    const [logs, setLogs] = useState([]);
    const [isPaused, setIsPaused] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [levelFilter, setLevelFilter] = useState([]);
    const [autoScroll, setAutoScroll] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [selectedLogId, setSelectedLogId] = useState(null);
    const [shouldScrollToLog, setShouldScrollToLog] = useState(false);
    const logsEndRef = useRef(null);
    const logsContainerRef = useRef(null);
    const isPausedRef = useRef(false);
    const abortControllerRef = useRef(null);
    const logBufferRef = useRef([]);
    const seenLogsRef = useRef(new Set());
    const scrollToLogTimeoutRef = useRef(null);
    const highlightTimeoutRef = useRef(null);
    const [highlightedLogId, setHighlightedLogId] = useState(null);
    const levelsLabelId = useId();

    useEffect(() => {
        isPausedRef.current = isPaused;
    }, [isPaused]);

    useEffect(() => {
        if (logsContainerRef.current) {
            logsContainerRef.current.scrollTop = 0;
        }
        setAutoScroll(false);
        setSelectedLogId(null);
        setShouldScrollToLog(false);
    }, [nodename, type, namespace, kind, instanceName]);

    const buildLogUrl = useCallback(() => {
        let baseUrl;
        if (type === "instance" && instanceName && instanceName.trim() !== "") {
            baseUrl = `${URL_NODE}/${nodename}/instance/path/${namespace}/${kind}/${instanceName}/log`;
        } else {
            baseUrl = `${URL_NODE}/${nodename}/log`;
        }
        return `${baseUrl}?follow=true`;
    }, [type, nodename, namespace, kind, instanceName]);

    const buildSubtitle = useCallback(() => {
        if (type === "instance" && instanceName && instanceName.trim() !== "") {
            return t("logs.subtitle", {instance: instanceName, node: nodename});
        }
        return nodename;
    }, [type, nodename, instanceName, t]);

    const buildDownloadFilename = useCallback(() => {
        const timestamp = new Date().toISOString();
        if (type === "instance" && instanceName && instanceName.trim() !== "") {
            return `${nodename}-${instanceName}-logs-${timestamp}.txt`;
        }
        return `${nodename}-logs-${timestamp}.txt`;
    }, [type, nodename, instanceName]);

    const parseLogMessage = useCallback(
        (logData) => {
            try {
                if (logData.JSON) {
                    const jsonData = JSON.parse(logData.JSON);
                    return {
                        timestamp: new Date(jsonData.time || logData.__REALTIME_TIMESTAMP / 1000),
                        level: jsonData.level || "info",
                        message: jsonData.message || logData.MESSAGE || "",
                        method: jsonData.method || logData.METHOD || "",
                        path: jsonData.path || logData.PATH || "",
                        node: jsonData.node || logData.NODE || nodename,
                        requestUuid: jsonData.request_uuid || logData.REQUEST_UUID || "",
                        pkg: jsonData.pkg || logData.PKG || "",
                        raw: logData,
                        __REALTIME_TIMESTAMP: logData.__REALTIME_TIMESTAMP,
                    };
                }
                return {
                    timestamp: new Date(parseInt(logData.__REALTIME_TIMESTAMP) / 1000),
                    level: "info",
                    message: logData.MESSAGE || JSON.stringify(logData),
                    node: logData.NODE || nodename,
                    raw: logData,
                    __REALTIME_TIMESTAMP: logData.__REALTIME_TIMESTAMP,
                };
            } catch (e) {
                logger.warn("Failed to parse log:", e);
                return {
                    timestamp: new Date(),
                    level: "info",
                    message: JSON.stringify(logData),
                    node: nodename,
                    raw: logData,
                    __REALTIME_TIMESTAMP: Date.now() * 1000,
                };
            }
        },
        [nodename]
    );

    const updateLogs = useCallback(() => {
        if (logBufferRef.current.length === 0 || isPausedRef.current) return;
        setLogs((prev) => {
            const newLogs = [...prev, ...logBufferRef.current].slice(-maxLogs);
            logBufferRef.current = [];
            return newLogs;
        });
    }, [maxLogs]);

    const fetchLogs = useCallback(
        async (signal) => {
            if (isPausedRef.current || !nodename) return;
            if (type === "instance" && (!instanceName || instanceName.trim() === "")) {
                setErrorMessage(t("logs.errors.instanceRequired"));
                return;
            }
            const token = localStorage.getItem("authToken");
            if (!token) {
                setErrorMessage(t("logs.errors.tokenNotFound"));
                setIsConnected(false);
                return;
            }
            try {
                const url = buildLogUrl();
                const response = await fetch(url, {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "text/event-stream",
                    },
                    signal,
                });
                if (!response.ok) {
                    setErrorMessage(t("logs.errors.http", {status: response.status}));
                    setIsConnected(false);
                    return;
                }
                if (!response.body) {
                    setErrorMessage(t("logs.errors.noStream"));
                    setIsConnected(false);
                    return;
                }
                setIsConnected(true);
                setErrorMessage("");
                setIsLoading(false);
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                while (true) {
                    const {value, done} = await reader.read();
                    if (done) break;
                    if (signal.aborted) {
                        reader.releaseLock();
                        return;
                    }
                    buffer += decoder.decode(value, {stream: true});
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";
                    for (const line of lines) {
                        if (line.startsWith("data: ") && !isPausedRef.current) {
                            try {
                                const jsonStr = line.slice(6).trim();
                                if (jsonStr) {
                                    const logData = JSON.parse(jsonStr);
                                    const parsedLog = parseLogMessage(logData);
                                    const timestamp = parsedLog.__REALTIME_TIMESTAMP;
                                    if (timestamp && !seenLogsRef.current.has(timestamp)) {
                                        seenLogsRef.current.add(timestamp);
                                        logBufferRef.current.push(parsedLog);
                                    }
                                }
                            } catch (e) {
                                logger.warn("Failed to parse log line:", e, line);
                            }
                        }
                    }
                    updateLogs();
                }
                updateLogs();
                reader.releaseLock();
            } catch (error) {
                if (error.name === "AbortError") return;
                logger.error("Failed to fetch logs:", error);
                setIsConnected(false);
                if (error.message.includes("401")) {
                    setErrorMessage(t("logs.errors.authFailed"));
                } else if (error.message.includes("404")) {
                    if (type === "instance") {
                        setErrorMessage(t("logs.errors.instanceNotFound", {instance: instanceName, node: nodename}));
                    } else {
                        setErrorMessage(t("logs.errors.nodeNotFound", {node: nodename}));
                    }
                } else {
                    setErrorMessage(t("logs.errors.fetchFailed", {message: error.message}));
                }
            } finally {
                setIsLoading(false);
            }
        },
        [nodename, type, instanceName, buildLogUrl, parseLogMessage, updateLogs, t]
    );

    const startStreaming = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setIsLoading(true);
        setErrorMessage("");
        const controller = new AbortController();
        abortControllerRef.current = controller;
        void fetchLogs(controller.signal);
    }, [fetchLogs]);

    const isFiltered = useMemo(() => {
        return levelFilter.length > 0 || searchTerm !== "";
    }, [levelFilter, searchTerm]);

    const filteredLogs = useMemo(() => {
        let filtered = logs;
        if (levelFilter.length > 0) {
            filtered = filtered.filter((log) => levelFilter.includes(log.level));
        }
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(
                (log) =>
                    log.message.toLowerCase().includes(term) ||
                    log.method?.toLowerCase().includes(term) ||
                    log.path?.toLowerCase().includes(term) ||
                    log.pkg?.toLowerCase().includes(term)
            );
        }
        return filtered;
    }, [logs, searchTerm, levelFilter]);

    useEffect(() => {
        if (autoScroll && logsEndRef.current && filteredLogs.length > 0) {
            logsEndRef.current.scrollIntoView({behavior: "smooth"});
        }
    }, [filteredLogs, autoScroll]);

    useEffect(() => {
        if (shouldScrollToLog && selectedLogId) {
            if (scrollToLogTimeoutRef.current) {
                clearTimeout(scrollToLogTimeoutRef.current);
            }
            scrollToLogTimeoutRef.current = setTimeout(() => {
                const logElement = document.getElementById(`log-${selectedLogId}`);
                if (logElement && logsContainerRef.current) {
                    setAutoScroll(false);
                    const container = logsContainerRef.current;
                    const elementRect = logElement.getBoundingClientRect();
                    const scrollTop =
                        logElement.offsetTop - container.clientHeight / 2 + elementRect.height / 2;
                    container.scrollTo({
                        top: scrollTop,
                        behavior: "smooth",
                    });
                    setHighlightedLogId(selectedLogId);
                    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
                    highlightTimeoutRef.current = setTimeout(() => setHighlightedLogId(null), 2000);
                }
                setShouldScrollToLog(false);
            }, 100);
        }
        return () => {
            if (scrollToLogTimeoutRef.current) clearTimeout(scrollToLogTimeoutRef.current);
        };
    }, [shouldScrollToLog, selectedLogId]);

    useEffect(() => () => {
        if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    }, []);

    useEffect(() => {
        if (!nodename) return;
        if (type === "instance" && (!instanceName || instanceName.trim() === "")) {
            setErrorMessage(t("logs.errors.instanceRequired"));
            return;
        }
        if (!isPaused) startStreaming();
        return () => {
            if (abortControllerRef.current) abortControllerRef.current.abort();
        };
    }, [nodename, type, instanceName, startStreaming, isPaused, t]);

    useEffect(() => {
        if (isPaused) {
            if (abortControllerRef.current) abortControllerRef.current.abort();
        } else {
            startStreaming();
        }
    }, [isPaused, startStreaming]);

    const handleScroll = useCallback(() => {
        if (!logsContainerRef.current) return;
        const {scrollTop, scrollHeight, clientHeight} = logsContainerRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        setAutoScroll(isAtBottom);
    }, []);

    const formatTime = (timestamp) =>
        timestamp.toLocaleTimeString(i18n.language, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            fractionalSecondDigits: 3,
        });

    // The level in a state colour, its name doubling the colour.
    const getLevelClass = (level) => {
        switch (level) {
            case "error":
                return "text-state-down";
            case "warn":
            case "warning":
                return "text-state-warn";
            case "debug":
                return "text-ink-muted";
            default:
                return "text-ink";
        }
    };

    const handleLogClick = (log) => {
        if (isFiltered) {
            setSearchTerm("");
            setLevelFilter([]);
            setSelectedLogId(log.__REALTIME_TIMESTAMP);
            setShouldScrollToLog(true);
        }
    };

    const getLogId = (log) => `log-${log.__REALTIME_TIMESTAMP}`;

    const handleDownload = () => {
        const content = filteredLogs
            .map(
                (log) => `[${log.timestamp.toISOString()}] [${log.level.toUpperCase()}] ${log.message}`
            )
            .join("\n");
        const blob = new Blob([content], {type: "text/plain"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = buildDownloadFilename();
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleManualReconnect = () => {
        setErrorMessage("");
        setLogs([]);
        seenLogsRef.current.clear();
        startStreaming();
    };

    const handleClearLogs = () => {
        setLogs([]);
        logBufferRef.current = [];
        seenLogsRef.current.clear();
    };

    const levelSummary = levelFilter.length === 0 ? t("logs.allLevels") : levelFilter.join(", ");

    return (
        <div className="flex h-full flex-col gap-2 text-ink">
            {/* Header: what is shown, the connection, the actions */}
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-ink-muted">{buildSubtitle()}</span>
                <span
                    className="inline-flex items-center gap-1"
                    data-state={isConnected ? "up" : "down"}
                >
                    <span className={isConnected ? "text-state-up" : "text-state-down"}>
                        <StateGlyph state={isConnected ? "up" : "down"}/>
                    </span>
                    <span>{isConnected ? t("logs.connected") : t("logs.disconnected")}</span>
                </span>
                {isLoading && <Spinner label={t("logs.loading")}/>}
                <div className="ml-auto flex items-center gap-2">
                    <Button
                        size="sm"
                        onClick={() => setIsPaused(!isPaused)}
                        aria-pressed={isPaused}
                        icon={isPaused ? <CaretRightIcon/> : <PauseIcon/>}
                    >
                        {isPaused ? t("logs.resume") : t("logs.pause")}
                    </Button>
                    <IconButton label={t("logs.clear")} onClick={handleClearLogs} disabled={logs.length === 0}>
                        <TrashIcon/>
                    </IconButton>
                    <IconButton label={t("logs.download")} onClick={handleDownload} disabled={filteredLogs.length === 0}>
                        <DownloadIcon/>
                    </IconButton>
                </div>
            </div>
            {errorMessage && (
                <Alert
                    tone="error"
                    action={
                        <Button size="sm" onClick={handleManualReconnect}>
                            {t("common.retry")}
                        </Button>
                    }
                >
                    {errorMessage}
                </Alert>
            )}
            {isLoading && !errorMessage && <Alert tone="info">{t("logs.loadingEllipsis")}</Alert>}
            {/* Filters, as the oc3 list toolbar */}
            <div className="flex flex-wrap items-center gap-3">
                <label className="flex min-w-[200px] flex-1 items-center gap-1 text-ink-muted">
                    <SearchIcon className="shrink-0"/>
                    <span className="sr-only">{t("common.search")}</span>
                    <Input
                        className="h-7"
                        placeholder={t("logs.searchPlaceholder")}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </label>
                <div className="flex items-center gap-1 text-ink-muted">
                    <span id={levelsLabelId}>{t("logs.levels")}</span>
                    <details className="relative">
                        <summary
                            aria-describedby={levelsLabelId}
                            className="flex h-7 cursor-pointer list-none items-center gap-1 rounded-(--radius-control) border border-line bg-surface px-2 text-ink [&::-webkit-details-marker]:hidden"
                        >
                            {levelSummary}
                            <ChevronDownIcon className="h-3 w-3 text-ink-muted"/>
                        </summary>
                        <div
                            role="group"
                            aria-label={t("logs.levelsGroup")}
                            className="absolute left-0 z-10 mt-1 flex min-w-[8rem] flex-col gap-1 rounded-(--radius-control) border border-line bg-surface-raised p-2 text-ink shadow-lg"
                        >
                            {["debug", "error", "info", "warn"].map((level) => (
                                <Checkbox
                                    key={level}
                                    label={level.charAt(0).toUpperCase() + level.slice(1)}
                                    checked={levelFilter.includes(level)}
                                    onChange={(e) =>
                                        setLevelFilter((prev) =>
                                            e.target.checked
                                                ? [...prev.filter((l) => l !== level), level]
                                                : prev.filter((l) => l !== level)
                                        )
                                    }
                                />
                            ))}
                        </div>
                    </details>
                </div>
                {isFiltered ? (
                    <span className="inline-flex items-center gap-1 rounded-(--radius-control) border border-line bg-surface-sunken pl-2 text-data">
                        {t("logs.filtersActive")}
                        <IconButton
                            size="sm"
                            label={t("logs.resetFilters")}
                            onClick={() => {
                                setSearchTerm("");
                                setLevelFilter([]);
                            }}
                        >
                            <CloseIcon className="h-3 w-3"/>
                        </IconButton>
                    </span>
                ) : null}
                <span className="ml-auto text-data text-ink-muted">
                    {t("logs.count", {shown: filteredLogs.length, total: logs.length})}
                </span>
            </div>
            {/* Log lines */}
            <div
                ref={logsContainerRef}
                onScroll={handleScroll}
                role="log"
                aria-live="off"
                aria-label={t("logs.lines")}
                tabIndex={0}
                className="relative min-h-0 flex-1 overflow-auto rounded-(--radius-control) border border-line bg-surface-sunken py-1 font-mono text-data"
                style={{height}}
            >
                {filteredLogs.length === 0 ? (
                    <p className="pt-4 text-center font-sans text-ink-muted">
                        {logs.length === 0 && !isLoading
                            ? t("logs.empty")
                            : t("logs.noMatch")}
                    </p>
                ) : (
                    filteredLogs.map((log) => (
                        <div
                            key={log.__REALTIME_TIMESTAMP}
                            className={cn(
                                "log-line flex gap-2 border-b border-line px-2 py-0.5 transition-colors",
                                isFiltered && "cursor-pointer hover:bg-surface-raised",
                                highlightedLogId === log.__REALTIME_TIMESTAMP && "bg-accent-soft"
                            )}
                            id={getLogId(log)}
                            onClick={() => handleLogClick(log)}
                        >
                            <span className="shrink-0 text-ink-muted">{formatTime(log.timestamp)}</span>
                            <span className={cn("w-[9ch] shrink-0 font-semibold", getLevelClass(log.level))}>
                                [{log.level.toUpperCase()}]
                            </span>
                            {log.method && <span className="shrink-0 font-semibold">{log.method}</span>}
                            {log.path && <span className="shrink-0 text-ink-muted">{log.path}</span>}
                            <span className="min-w-0 flex-1 break-words whitespace-pre-wrap">{log.message}</span>
                        </div>
                    ))
                )}
                <div ref={logsEndRef} style={{height: bottomSpacing}}/>
            </div>
            {!autoScroll && filteredLogs.length > 0 && (
                <Button
                    size="sm"
                    variant="ghost"
                    className="self-center"
                    onClick={() => {
                        setAutoScroll(true);
                        logsEndRef.current?.scrollIntoView({behavior: "smooth"});
                    }}
                >
                    {t("logs.goToBottom")}
                </Button>
            )}
        </div>
    );
};

export default LogsViewer;
