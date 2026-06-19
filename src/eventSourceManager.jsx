import useEventStore from './hooks/useEventStore.js';
import useEventLogStore from './hooks/useEventLogStore.js';
import {EventSourcePolyfill} from 'event-source-polyfill';
import {URL_NODE_EVENT} from './config/apiPath.js';
import logger from './utils/logger.js';

// Detect Safari
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// Constants for event names
export const EVENT_TYPES = {
    NODE_STATUS_UPDATED: 'NodeStatusUpdated',
    NODE_MONITOR_UPDATED: 'NodeMonitorUpdated',
    NODE_STATS_UPDATED: 'NodeStatsUpdated',
    DAEMON_HEARTBEAT_UPDATED: 'DaemonHeartbeatUpdated',
    OBJECT_STATUS_UPDATED: 'ObjectStatusUpdated',
    INSTANCE_STATUS_UPDATED: 'InstanceStatusUpdated',
    OBJECT_DELETED: 'ObjectDeleted',
    INSTANCE_MONITOR_UPDATED: 'InstanceMonitorUpdated',
    INSTANCE_CONFIG_UPDATED: 'InstanceConfigUpdated',
    INSTANCE_CONFIG_DELETED: 'InstanceConfigDeleted',
};

// Event Source connection event types (these are NOT API events)
export const CONNECTION_EVENTS = {
    CONNECTION_OPENED: 'CONNECTION_OPENED',
    CONNECTION_ERROR: 'CONNECTION_ERROR',
    RECONNECTION_ATTEMPT: 'RECONNECTION_ATTEMPT',
    MAX_RECONNECTIONS_REACHED: 'MAX_RECONNECTIONS_REACHED',
    CONNECTION_CLOSED: 'CONNECTION_CLOSED',
};

// Default filters for all events
export const DEFAULT_FILTERS = Object.values(EVENT_TYPES);

// Filters for specific objectName
const OBJECT_SPECIFIC_FILTERS = [
    EVENT_TYPES.OBJECT_STATUS_UPDATED,
    EVENT_TYPES.INSTANCE_STATUS_UPDATED,
    EVENT_TYPES.OBJECT_DELETED,
    EVENT_TYPES.INSTANCE_MONITOR_UPDATED,
    EVENT_TYPES.INSTANCE_CONFIG_UPDATED,
    EVENT_TYPES.INSTANCE_CONFIG_DELETED,
];

// Global state
let currentEventSource = null;
let currentLoggerEventSource = null;
let currentToken = null;
let reconnectAttempts = 0;
let isPageActive = true;
let flushTimeoutId = null;
let eventCount = 0;
let isFlushing = false;
let lastFlushTime = 0;
let needsFlush = false;

// Control buffer debug logging (set to true only for debugging buffer issues)
const DEBUG_BUFFERS = false;
const debugLog = (...args) => {
    if (DEBUG_BUFFERS) logger.debug(...args);
};

// Safari-specific optimizations
const SAFARI_BATCH_SIZE = 150;
const SAFARI_FLUSH_DELAY = 100;
const SAFARI_MIN_FLUSH_INTERVAL = 100;

// Performance optimizations
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const BATCH_SIZE = isSafari ? SAFARI_BATCH_SIZE : 50;
const FLUSH_DELAY = isSafari ? SAFARI_FLUSH_DELAY : 10;
const MIN_FLUSH_INTERVAL = isSafari ? SAFARI_MIN_FLUSH_INTERVAL : 10;

// Buffer management with pre-allocated structures
let buffers = {
    objectStatus: {},
    instanceStatus: {},
    nodeStatus: {},
    nodeMonitor: {},
    nodeStats: {},
    heartbeatStatus: {},
    instanceMonitor: {},
    instanceConfig: {},
    configUpdated: new Set(),
    instanceConfigDeleted: [],
};

// Deep equality check to detect actual changes
const isEqual = (a, b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;

    for (let i = 0; i < keysA.length; i++) {
        const key = keysA[i];
        const valA = a[key];
        const valB = b[key];

        if (typeof valA === 'object' && typeof valB === 'object') {
            if (!isEqual(valA, valB)) return false;
        } else if (valA !== valB) {
            return false;
        }
    }
    return true;
};

const createQueryString = (filters = DEFAULT_FILTERS, objectName = null, useCache = true) => {
    const validFilters = filters.filter(f => Object.values(EVENT_TYPES).includes(f));
    if (validFilters.length < filters.length) {
        logger.warn(`Invalid filters detected: ${filters.filter(f => !validFilters.includes(f)).join(', ')}. Using only valid ones.`);
    }
    if (validFilters.length === 0) {
        logger.warn('No valid API event filters provided, using default filters');
        validFilters.push(...DEFAULT_FILTERS);
    }

    let queryFilters;
    if (objectName) {
        queryFilters = OBJECT_SPECIFIC_FILTERS.map(
            filter => `${encodeURIComponent(filter)},path=${encodeURIComponent(objectName)}`
        );
    } else {
        queryFilters = validFilters.map(filter => encodeURIComponent(filter));
    }

    const cacheParam = useCache ? 'cache=true' : 'cache=false';
    return `${cacheParam}&${queryFilters.map(filter => `filter=${filter}`).join('&')}`;
};

// Get current token
export const getCurrentToken = () => {
    return currentToken || localStorage.getItem('authToken');
};

const getAndClearBuffers = () => {
    const buffersToFlush = {
        objectStatus: buffers.objectStatus,
        instanceStatus: buffers.instanceStatus,
        nodeStatus: buffers.nodeStatus,
        nodeMonitor: buffers.nodeMonitor,
        nodeStats: buffers.nodeStats,
        heartbeatStatus: buffers.heartbeatStatus,
        instanceMonitor: buffers.instanceMonitor,
        instanceConfig: buffers.instanceConfig,
        configUpdated: buffers.configUpdated,
        instanceConfigDeleted: buffers.instanceConfigDeleted,
    };

    buffers = {
        objectStatus: {},
        instanceStatus: {},
        nodeStatus: {},
        nodeMonitor: {},
        nodeStats: {},
        heartbeatStatus: {},
        instanceMonitor: {},
        instanceConfig: {},
        configUpdated: new Set(),
        instanceConfigDeleted: [],
    };

    return buffersToFlush;
};

const flushBuffers = () => {
    if (!isPageActive || isFlushing) return;

    const now = performance.now();
    if (now - lastFlushTime < MIN_FLUSH_INTERVAL) {
        if (!flushTimeoutId) {
            flushTimeoutId = setTimeout(flushBuffers, MIN_FLUSH_INTERVAL - (now - lastFlushTime));
        }
        return;
    }

    isFlushing = true;
    lastFlushTime = now;
    needsFlush = false;

    if (flushTimeoutId) {
        clearTimeout(flushTimeoutId);
        flushTimeoutId = null;
    }

    try {
        const buffersToFlush = getAndClearBuffers();
        const pendingDeletes = useEventStore.getState().pendingDeletes || {};

        for (const path in buffersToFlush.instanceStatus) {
            for (const node in buffersToFlush.instanceStatus[path]) {
                const key = `${path}:${node}`;
                if (pendingDeletes[key]) {
                    delete buffersToFlush.instanceStatus[path][node];
                }
            }
        }

        for (const path in buffersToFlush.instanceConfig) {
            for (const node in buffersToFlush.instanceConfig[path]) {
                const key = `${path}:${node}`;
                if (pendingDeletes[key]) {
                    delete buffersToFlush.instanceConfig[path][node];
                }
            }
        }

        if (buffersToFlush.configUpdated && buffersToFlush.configUpdated.size > 0) {
            const filtered = new Set();
            for (const update of buffersToFlush.configUpdated) {
                try {
                    const parsed = JSON.parse(update);
                    if (parsed.name && parsed.node) {
                        let ignore = false;
                        for (const key in pendingDeletes) {
                            const [path, pendingNode] = key.split(':');
                            if (pendingNode === parsed.node && path.includes(parsed.name)) {
                                ignore = true;
                                break;
                            }
                        }
                        if (!ignore) filtered.add(update);
                    } else {
                        filtered.add(update);
                    }
                } catch {
                    filtered.add(update);
                }
            }
            buffersToFlush.configUpdated = filtered;
        }

        const hasNodeStatus = Object.keys(buffersToFlush.nodeStatus).length > 0;
        const hasObjectStatus = Object.keys(buffersToFlush.objectStatus).length > 0;
        const hasHeartbeatStatus = Object.keys(buffersToFlush.heartbeatStatus).length > 0;
        const hasInstanceStatus = Object.keys(buffersToFlush.instanceStatus).length > 0;
        const hasNodeMonitor = Object.keys(buffersToFlush.nodeMonitor).length > 0;
        const hasNodeStats = Object.keys(buffersToFlush.nodeStats).length > 0;
        const hasInstanceMonitor = Object.keys(buffersToFlush.instanceMonitor).length > 0;
        const hasInstanceConfig = Object.keys(buffersToFlush.instanceConfig).length > 0;
        const hasConfigUpdated = buffersToFlush.configUpdated.size > 0;
        const hasInstanceConfigDeleted = buffersToFlush.instanceConfigDeleted.length > 0;

        if (hasObjectStatus) {
            const store = useEventStore.getState();
            const merged = {...store.objectStatus, ...buffersToFlush.objectStatus};
            debugLog('🔄 Flushing objectStatus:', {
                bufferUpdates: buffersToFlush.objectStatus,
                merged: merged
            });
            store.setObjectStatuses(merged);
        }
        if (hasNodeStatus) {
            const store = useEventStore.getState();
            store.setNodeStatuses({...store.nodeStatus, ...buffersToFlush.nodeStatus});
        }
        if (hasHeartbeatStatus) {
            const store = useEventStore.getState();
            store.setHeartbeatStatuses({...store.heartbeatStatus, ...buffersToFlush.heartbeatStatus});
        }
        if (hasInstanceStatus) {
            const store = useEventStore.getState();
            store.setInstanceStatuses(buffersToFlush.instanceStatus);
        }
        if (hasNodeMonitor) {
            const store = useEventStore.getState();
            store.setNodeMonitors({...store.nodeMonitor, ...buffersToFlush.nodeMonitor});
        }
        if (hasNodeStats) {
            const store = useEventStore.getState();
            store.setNodeStats({...store.nodeStats, ...buffersToFlush.nodeStats});
        }
        if (hasInstanceMonitor) {
            const store = useEventStore.getState();
            store.setInstanceMonitors({...store.instanceMonitor, ...buffersToFlush.instanceMonitor});
        }
        if (hasInstanceConfig) {
            const store = useEventStore.getState();
            for (const path in buffersToFlush.instanceConfig) {
                for (const node in buffersToFlush.instanceConfig[path]) {
                    store.setInstanceConfig(path, node, buffersToFlush.instanceConfig[path][node]);
                }
            }
        }
        if (hasConfigUpdated) {
            const store = useEventStore.getState();
            store.setConfigUpdated([...buffersToFlush.configUpdated]);
        }
        if (hasInstanceConfigDeleted) {
            const store = useEventStore.getState();
            for (const {path, node} of buffersToFlush.instanceConfigDeleted) {
                debugLog(`🗑️ Flushing InstanceConfigDeleted: path=${path} node=${node}`);
                store.removeInstanceFromObject(path, node);
                store.removePendingDelete(path, node);
            }
        }

        if (eventCount > 0) {
            debugLog(`✅ Flushed ${eventCount} events`);
        }
        // eventCount = 0;
    } catch (error) {
        logger.error('Error during buffer flush:', error);
    } finally {
        isFlushing = false;

        if (needsFlush && isPageActive) {
            debugLog('⚡ New events arrived during flush, scheduling immediate re-flush');
            needsFlush = false;
            if (eventCount > 0) {
                setTimeout(flushBuffers, 0);
            }
        }
        eventCount = 0;
    }
};

const scheduleFlush = () => {
    if (!isPageActive) return;

    if (isFlushing) {
        needsFlush = true;
        eventCount++;
        debugLog(`⏳ Event arrived during flush, will schedule new flush after current one completes (eventCount: ${eventCount})`);
        return;
    }

    eventCount++;

    if (eventCount >= BATCH_SIZE) {
        if (flushTimeoutId) {
            clearTimeout(flushTimeoutId);
            flushTimeoutId = null;
        }
        if (isSafari) {
            setTimeout(flushBuffers, 0);
        } else {
            requestAnimationFrame(flushBuffers);
        }
        return;
    }

    if (eventCount === 1) {
        if (!flushTimeoutId) {
            flushTimeoutId = setTimeout(() => {
                flushTimeoutId = null;
                flushBuffers();
            }, FLUSH_DELAY);
        }
        return;
    }

    if (!flushTimeoutId) {
        flushTimeoutId = setTimeout(() => {
            flushTimeoutId = null;
            if (eventCount > 0) {
                flushBuffers();
            }
        }, FLUSH_DELAY);
    }
};

const navigationService = {
    redirectToAuth: () => {
        window.dispatchEvent(new CustomEvent('om3:auth-redirect', {
            detail: '/auth-choice'
        }));
    }
};

const clearBuffers = () => {
    buffers = {
        objectStatus: {},
        instanceStatus: {},
        nodeStatus: {},
        nodeMonitor: {},
        nodeStats: {},
        heartbeatStatus: {},
        instanceMonitor: {},
        instanceConfig: {},
        configUpdated: new Set(),
        instanceConfigDeleted: [],
    };
    if (flushTimeoutId) {
        clearTimeout(flushTimeoutId);
        flushTimeoutId = null;
    }
    eventCount = 0;
    isFlushing = false;
    needsFlush = false;
};

export const clearEventBuffers = () => {
    clearBuffers();
};

const addEventListener = (eventSource, eventType, handler) => {
    eventSource.addEventListener(eventType, (event) => {
        if (!isPageActive) return;
        try {
            const parsed = JSON.parse(event.data);
            handler(parsed);
        } catch (e) {
            logger.warn(`⚠️ Invalid JSON in ${eventType} event:`, event.data);
        }
    });
};

const updateBuffer = (bufferName, key, value) => {
    if (bufferName === 'configUpdated') {
        buffers.configUpdated.add(value);
        debugLog(`📝 Buffer[configUpdated]: Added ${value}`);
        scheduleFlush();
        return;
    }

    if (bufferName === 'instanceConfigDeleted') {
        buffers.instanceConfigDeleted.push(value);
        debugLog(`📝 Buffer[instanceConfigDeleted]:`, value);
        scheduleFlush();
        return;
    }

    if (bufferName === 'objectStatus') {
        const existing = buffers.objectStatus[key];
        buffers.objectStatus[key] = existing ? {...existing, ...value} : value;
        debugLog(`📝 Buffer[objectStatus]: ${key}`, {
            incoming: value,
            existing: existing,
            merged: buffers.objectStatus[key]
        });
    } else if (bufferName === 'instanceStatus') {
        const [path, node] = key.split(':');
        if (!buffers.instanceStatus[path]) {
            buffers.instanceStatus[path] = {};
        }
        const existing = buffers.instanceStatus[path][node];
        buffers.instanceStatus[path][node] = existing ? {...existing, ...value} : value;
        debugLog(`📝 Buffer[instanceStatus]: ${path}:${node}`, {
            incoming: value,
            merged: buffers.instanceStatus[path][node]
        });
    } else if (bufferName === 'instanceConfig') {
        const [path, node] = key.split(':');
        if (!buffers.instanceConfig[path]) {
            buffers.instanceConfig[path] = {};
        }
        const existing = buffers.instanceConfig[path][node];
        buffers.instanceConfig[path][node] = existing ? {...existing, ...value} : value;
        debugLog(`📝 Buffer[instanceConfig]: ${path}:${node}`, value);
    } else if (bufferName === 'instanceMonitor') {
        const existing = buffers.instanceMonitor[key];
        buffers.instanceMonitor[key] = existing ? {...existing, ...value} : value;
        debugLog(`📝 Buffer[instanceMonitor]: ${key}`, value);
    } else {
        const existing = buffers[bufferName][key];
        buffers[bufferName][key] = existing ? {...existing, ...value} : value;
        debugLog(`📝 Buffer[${bufferName}]: ${key}`, value);
    }

    // Always schedule flush
    scheduleFlush();
};

// Simple cleanup function for testing
const cleanup = () => {
    // No-op cleanup function
};

// Create EventSource with comprehensive event handlers
export const createEventSource = (url, token, filters = DEFAULT_FILTERS) => {
    if (!token) {
        logger.error('❌ Missing token for EventSource!');
        return null;
    }

    if (currentEventSource) {
        logger.info('Closing existing EventSource');
        currentEventSource.close();
        currentEventSource = null;
    }

    currentToken = token;
    isPageActive = true;
    clearBuffers();

    logger.info('🔗 Creating EventSource with URL:', url);
    currentEventSource = new EventSourcePolyfill(url, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        withCredentials: true,
    });

    // Attach cleanup function for testing
    currentEventSource._cleanup = cleanup;

    // Store reference for cleanup
    const eventSourceRef = currentEventSource;

    currentEventSource.onopen = () => {
        logger.info('✅ EventSource connection established');
        reconnectAttempts = 0;
        // Log connection event
        useEventLogStore.getState().addEventLog(CONNECTION_EVENTS.CONNECTION_OPENED, {
            url,
            timestamp: new Date().toISOString()
        });
        // Flush any buffered data immediately on reconnect
        if (eventCount > 0) {
            flushBuffers();
        }
    };

    // Add event handlers for all API events in the filters
    const validApiFilters = filters.filter(f => Object.values(EVENT_TYPES).includes(f));
    validApiFilters.forEach(eventType => {
        addEventListener(currentEventSource, eventType, (data) => {
            // Process each event type
            switch (eventType) {
                case EVENT_TYPES.NODE_STATUS_UPDATED:
                    if (data.node && data.node_status) {
                        updateBuffer('nodeStatus', data.node, data.node_status);
                    }
                    break;
                case EVENT_TYPES.OBJECT_STATUS_UPDATED: {
                    const name = data.path || data.labels?.path;
                    if (name && data.object_status) {
                        debugLog('📩 OBJECT_STATUS_UPDATED event:', {
                            path: name,
                            object_status: data.object_status,
                            fullData: data
                        });
                        updateBuffer('objectStatus', name, data.object_status);
                    } else {
                        logger.warn('⚠️ OBJECT_STATUS_UPDATED missing data:', {
                            path: name,
                            has_object_status: !!data.object_status,
                            data
                        });
                    }
                    break;
                }
                case EVENT_TYPES.DAEMON_HEARTBEAT_UPDATED: {
                    const nodeName = data.node || data.labels?.node;
                    if (nodeName && data.heartbeat !== undefined) {
                        updateBuffer('heartbeatStatus', nodeName, data.heartbeat);
                    }
                    break;
                }
                case EVENT_TYPES.OBJECT_DELETED: {
                    const objectName = data.path || data.labels?.path;
                    if (objectName) {
                        logger.info('📩 Received ObjectDeleted event:', JSON.stringify({path: objectName}));
                        useEventStore.getState().removeObject(objectName);
                        // Clear from buffers
                        delete buffers.objectStatus[objectName];
                        delete buffers.instanceStatus[objectName];
                        delete buffers.instanceConfig[objectName];
                    } else {
                        logger.warn('⚠️ ObjectDeleted event missing objectName:', data);
                    }
                    break;
                }
                case EVENT_TYPES.INSTANCE_STATUS_UPDATED: {
                    const instName = data.path || data.labels?.path;
                    if (instName && data.node && data.instance_status) {
                        debugLog('📩 INSTANCE_STATUS_UPDATED event:', {
                            path: instName,
                            node: data.node,
                            instance_status: data.instance_status,
                            fullData: data
                        });
                        updateBuffer('instanceStatus', `${instName}:${data.node}`, data.instance_status);
                    } else {
                        logger.warn('⚠️ INSTANCE_STATUS_UPDATED missing data:', {
                            instName,
                            node: data.node,
                            has_status: !!data.instance_status,
                            data
                        });
                    }
                    break;
                }
                case EVENT_TYPES.NODE_MONITOR_UPDATED:
                    if (data.node && data.node_monitor) {
                        updateBuffer('nodeMonitor', data.node, data.node_monitor);
                    }
                    break;
                case EVENT_TYPES.NODE_STATS_UPDATED:
                    if (data.node && data.node_stats) {
                        updateBuffer('nodeStats', data.node, data.node_stats);
                    }
                    break;
                case EVENT_TYPES.INSTANCE_MONITOR_UPDATED:
                    if (data.node && data.path && data.instance_monitor) {
                        const key = `${data.node}:${data.path}`;
                        updateBuffer('instanceMonitor', key, data.instance_monitor);
                    }
                    break;
                case EVENT_TYPES.INSTANCE_CONFIG_UPDATED: {
                    const configName = data.path || data.labels?.path;
                    if (configName && data.node) {
                        if (data.instance_config) {
                            updateBuffer('instanceConfig', `${configName}:${data.node}`, data.instance_config);
                        }
                        updateBuffer('configUpdated', null, JSON.stringify({name: configName, node: data.node}));
                    } else {
                        logger.warn('⚠️ InstanceConfigUpdated event missing name or node:', data);
                    }
                    break;
                }
                case EVENT_TYPES.INSTANCE_CONFIG_DELETED: {
                    const deletedPath = data.path || data.labels?.path;
                    const deletedNode = data.node || data.labels?.node;
                    if (deletedPath && deletedNode) {
                        logger.info('📩 InstanceConfigDeleted event:', {path: deletedPath, node: deletedNode});
                        updateBuffer('instanceConfigDeleted', null, {path: deletedPath, node: deletedNode});
                    } else {
                        logger.warn('⚠️ InstanceConfigDeleted event missing path or node:', data);
                    }
                    break;
                }
            }
            useEventLogStore.getState().addEventLog(eventType, data);
        });
    });

    currentEventSource.onerror = (error) => {
        // Check if this is still the current EventSource
        if (currentEventSource !== eventSourceRef) return;

        logger.error('🚨 EventSource error:', error, 'URL:', url, 'readyState:', currentEventSource?.readyState);

        // Log connection error
        useEventLogStore.getState().addEventLog(CONNECTION_EVENTS.CONNECTION_ERROR, {
            error: error.message || 'Unknown error',
            status: error.status,
            url,
            timestamp: new Date().toISOString()
        });

        if (error.status === 401) {
            handleAuthError(token, url, filters);
            return;
        }

        handleReconnection(url, token, filters);
    };

    return currentEventSource;
};

const handleAuthError = (token, url) => {
    logger.warn('🔐 Authentication error detected');

    useEventLogStore.getState().addEventLog(CONNECTION_EVENTS.CONNECTION_ERROR, {
        error: 'Authentication failed',
        status: 401,
        url,
        timestamp: new Date().toISOString()
    });

    const newToken = localStorage.getItem('authToken');

    if (newToken && newToken !== token) {
        logger.info('🔄 New token available, updating EventSource');
        updateEventSourceToken(newToken);
        return;
    }

    if (window.oidcUserManager) {
        logger.info('🔄 Attempting silent token renewal...');
        window.oidcUserManager.signinSilent()
            .then(user => {
                const refreshedToken = user.access_token;
                localStorage.setItem('authToken', refreshedToken);
                localStorage.setItem('tokenExpiration', user.expires_at.toString());
                updateEventSourceToken(refreshedToken);
            })
            .catch(silentError => {
                logger.error('❌ Silent renew failed:', silentError);
                navigationService.redirectToAuth();
            });
        return;
    }

    navigationService.redirectToAuth();
};

const handleReconnection = (url, token, filters) => {
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && isPageActive) {
        reconnectAttempts++;

        // Log reconnection attempt
        useEventLogStore.getState().addEventLog(CONNECTION_EVENTS.RECONNECTION_ATTEMPT, {
            attempt: reconnectAttempts,
            maxAttempts: MAX_RECONNECT_ATTEMPTS,
            timestamp: new Date().toISOString()
        });

        const delay = Math.min(
            BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts) + Math.random() * 100,
            MAX_RECONNECT_DELAY
        );

        logger.info(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

        setTimeout(() => {
            const currentToken = getCurrentToken();
            if (currentToken && isPageActive) {
                createEventSource(url, currentToken, filters);
            }
        }, delay);
    } else if (isPageActive) {
        logger.error('❌ Max reconnection attempts reached');
        // Log max reconnections reached
        useEventLogStore.getState().addEventLog(CONNECTION_EVENTS.MAX_RECONNECTIONS_REACHED, {
            maxAttempts: MAX_RECONNECT_ATTEMPTS,
            timestamp: new Date().toISOString()
        });
        navigationService.redirectToAuth();
    }
};

export const createLoggerEventSource = (url, token, filters) => {
    if (!token) {
        logger.error('❌ Missing token for Logger EventSource!');
        return null;
    }

    if (currentLoggerEventSource) {
        logger.info('Closing existing Logger EventSource');
        currentLoggerEventSource.close();
        currentLoggerEventSource = null;
    }

    logger.info('🔗 Creating Logger EventSource with URL:', url);
    currentLoggerEventSource = new EventSourcePolyfill(url, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
        withCredentials: true,
    });

    // Attach cleanup function for testing
    currentLoggerEventSource._cleanup = cleanup;

    // Store reference for cleanup
    const loggerEventSourceRef = currentLoggerEventSource;

    currentLoggerEventSource.onopen = () => {
        logger.info('✅ Logger EventSource connection established');
        reconnectAttempts = 0;
    };

    currentLoggerEventSource.onerror = (error) => {
        // Check if this is still the current Logger EventSource
        if (currentLoggerEventSource !== loggerEventSourceRef) return;

        logger.error('🚨 Logger EventSource error:', error, 'URL:', url, 'readyState:', currentLoggerEventSource?.readyState);

        if (error.status === 401) {
            logger.warn('🔐 Authentication error detected in logger');
            const newToken = localStorage.getItem('authToken');

            if (newToken && newToken !== token) {
                logger.info('🔄 New token available, updating Logger EventSource');
                updateLoggerEventSourceToken(newToken);
                return;
            }

            if (window.oidcUserManager) {
                window.oidcUserManager.signinSilent()
                    .then(user => {
                        const refreshedToken = user.access_token;
                        localStorage.setItem('authToken', refreshedToken);
                        localStorage.setItem('tokenExpiration', user.expires_at.toString());
                        updateLoggerEventSourceToken(refreshedToken);
                    })
                    .catch(silentError => {
                        logger.error('❌ Silent renew failed for logger:', silentError);
                        navigationService.redirectToAuth();
                    });
                return;
            }
        }

        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && isPageActive) {
            reconnectAttempts++;
            const delay = Math.min(
                BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts) + Math.random() * 100,
                MAX_RECONNECT_DELAY
            );

            logger.info(`🔄 Logger reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

            setTimeout(() => {
                const currentToken = getCurrentToken();
                if (currentToken && isPageActive) {
                    createLoggerEventSource(url, currentToken, filters);
                }
            }, delay);
        } else if (isPageActive) {
            logger.error('❌ Max reconnection attempts reached for logger');
            navigationService.redirectToAuth();
        }
    };

    // Event handlers for logging only - filter out non-API events
    const validApiFilters = filters.filter(f => Object.values(EVENT_TYPES).includes(f));
    validApiFilters.forEach(eventType => {
        currentLoggerEventSource.addEventListener(eventType, (event) => {
            if (!isPageActive) return;
            try {
                const parsed = JSON.parse(event.data);
                useEventLogStore.getState().addEventLog(eventType, {
                    ...parsed,
                    _rawEvent: event.data
                });
            } catch (e) {
                logger.warn(`⚠️ Invalid JSON in ${eventType} event for logger:`, event.data);
                useEventLogStore.getState().addEventLog(`${eventType}_PARSE_ERROR`, {
                    error: e.message,
                    rawData: event.data
                });
            }
        });
    });

    return currentLoggerEventSource;
};

// Update EventSource token
export const updateEventSourceToken = (newToken) => {
    if (!newToken) return;

    currentToken = newToken;

    if (currentEventSource && currentEventSource.readyState !== EventSource.CLOSED) {
        logger.info('🔄 Token updated, restarting EventSource');
        const currentUrl = currentEventSource.url;
        closeEventSource();

        setTimeout(() => {
            // Extract filters from current URL
            const urlParams = new URLSearchParams(currentUrl.split('?')[1]);
            const filters = urlParams.getAll('filter').map(f => {
                // Remove any path parameters from filter
                return f.split(',')[0];
            });
            createEventSource(currentUrl, newToken, filters);
        }, 100);
    }
};

export const updateLoggerEventSourceToken = (newToken) => {
    if (!newToken) return;

    if (currentLoggerEventSource && currentLoggerEventSource.readyState !== EventSource.CLOSED) {
        logger.info('🔄 Token updated, restarting Logger EventSource');
        const currentUrl = currentLoggerEventSource.url;
        closeLoggerEventSource();

        setTimeout(() => {
            // Extract filters from current URL
            const urlParams = new URLSearchParams(currentUrl.split('?')[1]);
            const filters = urlParams.getAll('filter').map(f => f.split(',')[0]);
            createLoggerEventSource(currentUrl, newToken, filters);
        }, 100);
    }
};

// Close EventSource
export const closeEventSource = () => {
    if (currentEventSource) {
        logger.info('Closing current EventSource');
        // Log connection closed
        useEventLogStore.getState().addEventLog(CONNECTION_EVENTS.CONNECTION_CLOSED, {
            timestamp: new Date().toISOString()
        });

        // Call cleanup if present
        if (typeof currentEventSource._cleanup === 'function') {
            try {
                currentEventSource._cleanup();
            } catch (e) {
                logger.debug('Error during eventSource cleanup', e);
            }
        }

        currentEventSource.close();
        currentEventSource = null;
        currentToken = null;
        reconnectAttempts = 0;
    }
};

// Close Logger EventSource
export const closeLoggerEventSource = () => {
    if (currentLoggerEventSource) {
        logger.info('Closing current Logger EventSource');

        // Call cleanup if present
        if (typeof currentLoggerEventSource._cleanup === 'function') {
            try {
                currentLoggerEventSource._cleanup();
            } catch (e) {
                logger.debug('Error during logger eventSource cleanup', e);
            }
        }

        currentLoggerEventSource.close();
        currentLoggerEventSource = null;
    }
};

export const configureEventSource = (token, objectName = null, filters = DEFAULT_FILTERS, useCache = true) => {
    if (!token) {
        logger.error('❌ No token provided for SSE!');
        return;
    }

    const queryString = createQueryString(filters, objectName, useCache);
    const url = `${URL_NODE_EVENT}?${queryString}`;
    closeEventSource();
    currentEventSource = createEventSource(url, token, filters);
};

export const startEventReception = (token, filters = DEFAULT_FILTERS, objectName = null, useCache = true) => {
    if (!token) {
        logger.error('❌ No token provided for SSE!');
        return;
    }
    configureEventSource(token, objectName, filters, useCache);
};

export const configureLoggerEventSource = (token, objectName = null, filters = DEFAULT_FILTERS) => {
    if (!token) {
        logger.error('❌ No token provided for Logger SSE!');
        return;
    }

    const queryString = createQueryString(filters, objectName);
    const url = `${URL_NODE_EVENT}?${queryString}`;
    closeLoggerEventSource();
    currentLoggerEventSource = createLoggerEventSource(url, token, filters);
};

export const startLoggerReception = (token, filters = DEFAULT_FILTERS, objectName = null) => {
    if (!token) {
        logger.error('❌ No token provided for Logger SSE!');
        return;
    }
    configureLoggerEventSource(token, objectName, filters);
};

export const setPageActive = (active) => {
    isPageActive = active;
    if (!active) {
        clearBuffers();
        closeEventSource();
        closeLoggerEventSource();
    }
};

export const forceFlush = () => {
    if (flushTimeoutId) {
        clearTimeout(flushTimeoutId);
        flushTimeoutId = null;
    }
    if (eventCount > 0) {
        flushBuffers();
    }
};

// Export navigation service for external use
export {navigationService};

// Export prepareForNavigation as alias to forceFlush
export const prepareForNavigation = forceFlush;
