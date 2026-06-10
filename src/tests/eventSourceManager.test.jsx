import * as eventSourceManager from '../eventSourceManager';
import {EventSourcePolyfill} from 'event-source-polyfill';
import useEventStore from '../hooks/useEventStore.js';
import useEventLogStore from '../hooks/useEventLogStore.js';
import {URL_NODE_EVENT} from '../config/apiPath.js';

jest.mock('event-source-polyfill');
jest.mock('../hooks/useEventStore.js');
jest.mock('../hooks/useEventLogStore.js');
jest.useFakeTimers();

let mockNow = 0;
const originalPerformance = global.performance;
beforeAll(() => {
    global.performance = {now: () => mockNow};
});
afterAll(() => {
    global.performance = originalPerformance;
});

const mockShallowEqual = (a, b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    const keysA = Object.keys(a);
    if (keysA.length !== Object.keys(b).length) return false;
    return keysA.every(key => a[key] === b[key]);
};

// Helper: get handler for a given event type from a mock eventSource
const getHandler = (eventSource, eventType) =>
    eventSource.addEventListener.mock.calls.find(c => c[0] === eventType)[1];

describe('eventSourceManager', () => {
    let mockStore, mockLogStore, mockEventSource, mockLoggerEventSource;
    let originalConsole, localStorageMock, originalDebug, originalLocation;

    beforeEach(() => {
        jest.clearAllMocks();
        mockNow += 1_000_000;

        mockStore = {
            nodeStatus: {}, nodeMonitor: {}, nodeStats: {}, objectStatus: {},
            objectInstanceStatus: {}, heartbeatStatus: {}, instanceMonitor: {},
            instanceConfig: {}, configUpdates: [],
            pendingDeletes: {},
            setNodeStatuses: jest.fn((v) => {
                if (!mockShallowEqual(mockStore.nodeStatus, v)) mockStore.nodeStatus = v;
            }),
            setNodeMonitors: jest.fn((v) => {
                if (!mockShallowEqual(mockStore.nodeMonitor, v)) mockStore.nodeMonitor = v;
            }),
            setNodeStats: jest.fn((v) => {
                if (!mockShallowEqual(mockStore.nodeStats, v)) mockStore.nodeStats = v;
            }),
            setObjectStatuses: jest.fn((v) => {
                if (!mockShallowEqual(mockStore.objectStatus, v)) mockStore.objectStatus = v;
            }),
            setInstanceStatuses: jest.fn((v) => {
                if (JSON.stringify(mockStore.objectInstanceStatus) !== JSON.stringify(v)) mockStore.objectInstanceStatus = v;
            }),
            setHeartbeatStatuses: jest.fn((v) => {
                if (!mockShallowEqual(mockStore.heartbeatStatus, v)) mockStore.heartbeatStatus = v;
            }),
            setInstanceMonitors: jest.fn((v) => {
                if (!mockShallowEqual(mockStore.instanceMonitor, v)) mockStore.instanceMonitor = v;
            }),
            removeObject: jest.fn((name) => {
                delete mockStore.objectStatus[name];
                delete mockStore.objectInstanceStatus[name];
                delete mockStore.instanceConfig[name];
            }),
            setConfigUpdated: jest.fn((v) => {
                mockStore.configUpdates = v || [];
            }),
            setInstanceConfig: jest.fn((path, node, config) => {
                if (!mockStore.instanceConfig[path]) mockStore.instanceConfig[path] = {};
                if (!mockShallowEqual(mockStore.instanceConfig[path][node], config))
                    mockStore.instanceConfig[path][node] = config;
            }),
            removeInstanceFromObject: jest.fn(),
            removePendingDelete: jest.fn(),
        };
        useEventStore.getState.mockReturnValue(mockStore);

        mockLogStore = {addEventLog: jest.fn()};
        useEventLogStore.getState.mockReturnValue(mockLogStore);

        mockEventSource = {
            onopen: jest.fn(), onerror: null, addEventListener: jest.fn(),
            close: jest.fn(), readyState: 1,
            url: URL_NODE_EVENT + '?cache=true&filter=NodeStatusUpdated',
        };
        mockLoggerEventSource = {
            onopen: jest.fn(), onerror: null, addEventListener: jest.fn(),
            close: jest.fn(), readyState: 1,
            url: URL_NODE_EVENT + '?cache=true&filter=ObjectStatusUpdated',
        };
        EventSourcePolyfill.mockImplementation(() => mockEventSource);

        localStorageMock = {getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(), clear: jest.fn()};
        Object.defineProperty(global, 'localStorage', {value: localStorageMock, writable: true});

        originalConsole = {
            log: console.log,
            error: console.error,
            warn: console.warn,
            info: console.info,
            debug: console.debug
        };
        originalDebug = console.debug;
        console.log = jest.fn();
        console.error = jest.fn();
        console.warn = jest.fn();
        console.info = jest.fn();
        console.debug = jest.fn();

        originalLocation = window.location;
        Object.defineProperty(window, 'location', {configurable: true, value: {href: ''}});
        window.oidcUserManager = null;
        window.dispatchEvent = jest.fn();
        global.EventSource = {CLOSED: 2};
        global.requestAnimationFrame = jest.fn((cb) => {
            setTimeout(cb, 0);
            return 1;
        });
    });

    afterEach(() => {
        jest.runAllTimers();
        eventSourceManager.setPageActive(false);
        eventSourceManager.setPageActive(true);
        jest.clearAllTimers();
        Object.assign(console, originalConsole);
        console.debug = originalDebug;
        Object.defineProperty(window, 'location', {configurable: true, value: originalLocation});
        eventSourceManager.closeEventSource();
        eventSourceManager.closeLoggerEventSource();
        delete window.oidcUserManager;
    });

    describe('EventSource lifecycle and management', () => {
        test('should create an EventSource and attach event listeners', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            expect(EventSourcePolyfill).toHaveBeenCalled();
            expect(es.addEventListener).toHaveBeenCalledTimes(10);
        });

        test('should close existing EventSource before creating a new one', () => {
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            EventSourcePolyfill.mockImplementationOnce(() => ({...mockEventSource}));
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            expect(mockEventSource.close).toHaveBeenCalled();
        });

        test('should not create EventSource if no token', () => {
            expect(eventSourceManager.createEventSource(URL_NODE_EVENT, '')).toBeNull();
            expect(console.error).toHaveBeenCalledWith('❌ Missing token for EventSource!');
        });

        test('should close EventSource and not throw on missing source', () => {
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            eventSourceManager.closeEventSource();
            expect(mockEventSource.close).toHaveBeenCalled();
            expect(() => eventSourceManager.closeEventSource()).not.toThrow();
        });

        test('should call and handle errors in _cleanup', () => {
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const cleanupSpy = jest.fn();
            mockEventSource._cleanup = cleanupSpy;
            eventSourceManager.closeEventSource();
            expect(cleanupSpy).toHaveBeenCalled();

            // Error case
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            mockEventSource._cleanup = () => {
                throw new Error('cleanup error');
            };
            expect(() => eventSourceManager.closeEventSource()).not.toThrow();
            expect(console.debug).toHaveBeenCalledWith('Error during eventSource cleanup', expect.any(Error));
        });

        test('should return token from localStorage or currentToken', () => {
            localStorageMock.getItem.mockReturnValue('local-storage-token');
            expect(eventSourceManager.getCurrentToken()).toBe('local-storage-token');

            localStorageMock.getItem.mockReturnValue(null);
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'current-token');
            expect(eventSourceManager.getCurrentToken()).toBe('current-token');
        });

        test('should not update if no new token in updateEventSourceToken', () => {
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'old-token');
            eventSourceManager.updateEventSourceToken('');
            expect(mockEventSource.close).not.toHaveBeenCalled();
        });

        test('should configure EventSource with and without objectName', () => {
            eventSourceManager.configureEventSource('fake-token', 'test-object', ['NodeStatusUpdated']);
            expect(EventSourcePolyfill).toHaveBeenCalled();

            jest.clearAllMocks();
            eventSourceManager.configureEventSource('fake-token');
            expect(EventSourcePolyfill.mock.calls[0][0]).toContain('cache=true');
            expect(EventSourcePolyfill.mock.calls[0][0]).not.toContain('path=');
        });

        test('should handle missing token in configureEventSource and startEventReception', () => {
            eventSourceManager.configureEventSource('');
            expect(console.error).toHaveBeenCalledWith('❌ No token provided for SSE!');
            eventSourceManager.startEventReception('');
            expect(console.error).toHaveBeenCalledWith('❌ No token provided for SSE!');
        });

        test('should startEventReception with valid and custom filters', () => {
            eventSourceManager.startEventReception('fake-token', ['NodeStatusUpdated', 'ObjectStatusUpdated']);
            expect(EventSourcePolyfill.mock.calls[0][0]).toContain('filter=NodeStatusUpdated');
            expect(EventSourcePolyfill.mock.calls[0][0]).toContain('filter=ObjectStatusUpdated');
        });

        test('should handle connection open event and log it', () => {
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            mockEventSource.onopen();
            expect(console.info).toHaveBeenCalledWith('✅ EventSource connection established');
            expect(mockLogStore.addEventLog).toHaveBeenCalledWith('CONNECTION_OPENED', {
                url: expect.any(String), timestamp: expect.any(String)
            });
        });

        test('should log connection error with correct data', () => {
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            mockEventSource.onerror({status: 500, message: 'Test error'});
            expect(mockLogStore.addEventLog).toHaveBeenCalledWith('CONNECTION_ERROR', {
                error: 'Test error', status: 500, url: expect.any(String), timestamp: expect.any(String)
            });
        });

        test('should ignore onerror if not current EventSource', () => {
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            eventSourceManager.closeEventSource();
            mockEventSource.onerror({status: 500});
            expect(console.info).not.toHaveBeenCalledWith(expect.stringContaining('Reconnecting'));
        });

        test('should log reconnection attempt and max reconnections reached', () => {
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            mockEventSource.onerror({status: 500});
            expect(mockLogStore.addEventLog).toHaveBeenCalledWith('RECONNECTION_ATTEMPT', expect.any(Object));

            for (let i = 0; i < 10; i++) {
                mockEventSource.onerror({status: 500});
                jest.advanceTimersByTime(2000);
            }
            expect(mockLogStore.addEventLog).toHaveBeenCalledWith('MAX_RECONNECTIONS_REACHED', expect.any(Object));
        });

        test('should handle auth error: same token, no oidcUserManager', () => {
            localStorageMock.getItem.mockReturnValue('old-token');
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'old-token');
            mockEventSource.onerror({status: 401});
            expect(console.warn).toHaveBeenCalledWith('🔐 Authentication error detected');
            expect(window.dispatchEvent).toHaveBeenCalledWith(expect.any(CustomEvent));
        });

        test('should handle auth error: new token from storage', () => {
            localStorageMock.getItem.mockReturnValue('new-token');
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'old-token');
            mockEventSource.onerror({status: 401});
            expect(console.info).toHaveBeenCalledWith('🔄 New token available, updating EventSource');
        });

        test('should handle silent renew success and failure', async () => {
            // Success
            const mockUser = {access_token: 'silent-renewed-token', expires_at: Date.now() + 3600000};
            window.oidcUserManager = {signinSilent: jest.fn().mockResolvedValue(mockUser)};
            localStorageMock.getItem.mockReturnValue(null);
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'old-token');
            mockEventSource.onerror({status: 401});
            await Promise.resolve();
            expect(localStorageMock.setItem).toHaveBeenCalledWith('authToken', 'silent-renewed-token');

            // Failure
            window.oidcUserManager = {signinSilent: jest.fn().mockRejectedValue(new Error('renew fail'))};
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'old-token');
            mockEventSource.onerror({status: 401});
            await Promise.resolve();
            await Promise.resolve();
            expect(console.error).toHaveBeenCalledWith('❌ Silent renew failed:', expect.any(Error));
            expect(window.dispatchEvent).toHaveBeenCalledWith(expect.any(CustomEvent));
        });

        test('should log connection closed on closeEventSource', () => {
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            eventSourceManager.closeEventSource();
            expect(mockLogStore.addEventLog).toHaveBeenCalledWith('CONNECTION_CLOSED', expect.any(Object));
        });

        test('should restart EventSource when updateEventSourceToken called with open connection', () => {
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const recreatedMock = {...mockEventSource, close: jest.fn(), addEventListener: jest.fn()};
            EventSourcePolyfill.mockImplementation(() => recreatedMock);
            localStorageMock.getItem.mockReturnValue('new-token');
            eventSourceManager.updateEventSourceToken('new-token');
            expect(mockEventSource.close).toHaveBeenCalled();
            jest.advanceTimersByTime(200);
            expect(EventSourcePolyfill).toHaveBeenCalledTimes(2);
        });

        test('should not restart EventSource when connection is already closed', () => {
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'old-token');
            mockEventSource.readyState = 2;
            eventSourceManager.updateEventSourceToken('new-token');
            expect(EventSourcePolyfill).toHaveBeenCalledTimes(1);
        });
    });

    describe('Event processing and buffer management', () => {
        test('should process NodeStatusUpdated events and skip if unchanged', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'NodeStatusUpdated');
            handler({data: JSON.stringify({node: 'node1', node_status: {status: 'up'}})});
            jest.runAllTimers();
            expect(mockStore.setNodeStatuses).toHaveBeenCalledWith(expect.objectContaining({node1: {status: 'up'}}));

            mockStore.nodeStatus = {node1: {status: 'up'}};
            handler({data: JSON.stringify({node: 'node1', node_status: {status: 'up'}})});
            jest.runAllTimers();
            expect(mockStore.nodeStatus).toEqual({node1: {status: 'up'}});
        });

        test('should process NodeMonitorUpdated and flush multiple entries', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'NodeMonitorUpdated');
            handler({data: JSON.stringify({node: 'node1', node_monitor: {monitor: 'active'}})});
            handler({data: JSON.stringify({node: 'node2', node_monitor: {monitor: 'inactive'}})});
            jest.runAllTimers();
            expect(mockStore.setNodeMonitors).toHaveBeenCalledWith(expect.objectContaining({
                node1: {monitor: 'active'}, node2: {monitor: 'inactive'},
            }));
        });

        test('should process NodeStatsUpdated events', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'NodeStatsUpdated');
            handler({data: JSON.stringify({node: 'node1', node_stats: {cpu: 50, memory: 70}})});
            jest.runAllTimers();
            expect(mockStore.setNodeStats).toHaveBeenCalledWith(expect.objectContaining({
                node1: {
                    cpu: 50,
                    memory: 70
                }
            }));
        });

        test('should process ObjectStatusUpdated with path, labels.path, and handle missing fields', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'ObjectStatusUpdated');
            handler({data: JSON.stringify({path: 'object1', object_status: {status: 'active'}})});
            handler({data: JSON.stringify({labels: {path: 'object2'}, object_status: {status: 'ok'}})});
            jest.runAllTimers();
            expect(mockStore.setObjectStatuses).toHaveBeenCalledWith(expect.objectContaining({
                object1: {status: 'active'}, object2: {status: 'ok'},
            }));

            jest.clearAllMocks();
            handler({data: JSON.stringify({object_status: {status: 'active'}})});
            handler({data: JSON.stringify({path: 'object1'})});
            jest.runAllTimers();
            expect(mockStore.setObjectStatuses).not.toHaveBeenCalled();
        });

        test('should merge objectStatus updates in buffer preserving all fields', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'ObjectStatusUpdated');
            handler({data: JSON.stringify({path: 'obj1', object_status: {avail: 'up', frozen: false}})});
            handler({data: JSON.stringify({path: 'obj1', object_status: {avail: 'down', provisioned: true}})});
            jest.runAllTimers();
            expect(mockStore.setObjectStatuses).toHaveBeenCalledWith(expect.objectContaining({
                'obj1': expect.objectContaining({avail: 'down', frozen: false, provisioned: true})
            }));
        });

        test('should process InstanceStatusUpdated with path, labels.path, handle missing and skip equal', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'InstanceStatusUpdated');
            handler({data: JSON.stringify({path: 'object1', node: 'node1', instance_status: {status: 'running'}})});
            handler({
                data: JSON.stringify({
                    labels: {path: 'object1'},
                    node: 'node2',
                    instance_status: {status: 'stopped'}
                })
            });
            jest.runAllTimers();
            expect(mockStore.setInstanceStatuses).toHaveBeenCalledWith(expect.objectContaining({
                object1: {node1: {status: 'running'}, node2: {status: 'stopped'}}
            }));

            // Missing fields
            jest.clearAllMocks();
            handler({data: JSON.stringify({node: 'node1', instance_status: {status: 'running'}})});
            handler({data: JSON.stringify({path: 'object1', instance_status: {status: 'running'}})});
            handler({data: JSON.stringify({path: 'object1', node: 'node1'})});
            jest.runAllTimers();
            expect(mockStore.setInstanceStatuses).not.toHaveBeenCalled();

            // Skip equal
            mockStore.objectInstanceStatus = {'object1': {'node1': {status: 'running'}}};
            handler({data: JSON.stringify({path: 'object1', node: 'node1', instance_status: {status: 'running'}})});
            jest.runAllTimers();
            expect(mockStore.objectInstanceStatus).toEqual({'object1': {'node1': {status: 'running'}}});
        });

        test('should process DaemonHeartbeatUpdated with node, labels.node, and handle missing', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'DaemonHeartbeatUpdated');

            handler({data: JSON.stringify({node: 'node1', heartbeat: {status: 'alive'}})});
            eventSourceManager.forceFlush();
            expect(mockStore.setHeartbeatStatuses).toHaveBeenCalledWith(expect.objectContaining({node1: {status: 'alive'}}));

            jest.clearAllMocks();
            mockNow += 100;
            handler({data: JSON.stringify({labels: {node: 'node2'}, heartbeat: {status: 'alive'}})});
            eventSourceManager.forceFlush();
            expect(mockStore.setHeartbeatStatuses).toHaveBeenCalledWith(expect.objectContaining({node2: {status: 'alive'}}));

            jest.clearAllMocks();
            mockNow += 100;
            handler({data: JSON.stringify({heartbeat: {status: 'alive'}})});
            handler({data: JSON.stringify({node: 'node1'})});
            eventSourceManager.forceFlush();
            expect(mockStore.setHeartbeatStatuses).not.toHaveBeenCalled();
        });

        test('should process ObjectDeleted with path, labels.path, and handle missing name', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'ObjectDeleted');
            handler({data: JSON.stringify({})});
            expect(console.warn).toHaveBeenCalledWith('⚠️ ObjectDeleted event missing objectName:', {});
            expect(mockStore.removeObject).not.toHaveBeenCalled();

            handler({data: JSON.stringify({path: 'object1'})});
            expect(mockStore.removeObject).toHaveBeenCalledWith('object1');

            handler({data: JSON.stringify({labels: {path: 'object2'}})});
            expect(mockStore.removeObject).toHaveBeenCalledWith('object2');
        });

        test('should process InstanceMonitorUpdated with and without missing fields, skip equal', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'InstanceMonitorUpdated');
            handler({data: JSON.stringify({node: 'node1', path: 'object1', instance_monitor: {monitor: 'active'}})});
            jest.runAllTimers();
            expect(mockStore.setInstanceMonitors).toHaveBeenCalledWith(
                expect.objectContaining({'node1:object1': {monitor: 'active'}})
            );

            jest.clearAllMocks();
            handler({data: JSON.stringify({path: 'object1', instance_monitor: {monitor: 'active'}})});
            handler({data: JSON.stringify({node: 'node1', instance_monitor: {monitor: 'active'}})});
            handler({data: JSON.stringify({node: 'node1', path: 'object1'})});
            jest.runAllTimers();
            expect(mockStore.setInstanceMonitors).not.toHaveBeenCalled();

            // Skip equal
            mockStore.instanceMonitor = {'node1:object1': {monitor: 'active'}};
            handler({data: JSON.stringify({node: 'node1', path: 'object1', instance_monitor: {monitor: 'active'}})});
            jest.runAllTimers();
            expect(mockStore.instanceMonitor).toEqual({'node1:object1': {monitor: 'active'}});
        });

        test('should process InstanceConfigUpdated with config, labels.path, missing fields, and multiple nodes', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'InstanceConfigUpdated');

            handler({data: JSON.stringify({path: 'object1', node: 'node1', instance_config: {config: 'v1'}})});
            handler({data: JSON.stringify({path: 'object1', node: 'node2', instance_config: {config: 'v2'}})});
            eventSourceManager.forceFlush();
            expect(mockStore.setInstanceConfig).toHaveBeenCalledWith('object1', 'node1', {config: 'v1'});
            expect(mockStore.setInstanceConfig).toHaveBeenCalledWith('object1', 'node2', {config: 'v2'});
            expect(mockStore.setConfigUpdated).toHaveBeenCalled();

            jest.clearAllMocks();
            mockNow += 100;
            handler({data: JSON.stringify({labels: {path: 'object1'}, node: 'node1'})});
            eventSourceManager.forceFlush();
            expect(mockStore.setConfigUpdated).toHaveBeenCalledWith(expect.arrayContaining([expect.any(String)]));

            jest.clearAllMocks();
            mockNow += 100;
            handler({data: JSON.stringify({node: 'node1'})});
            handler({data: JSON.stringify({path: 'object1'})});
            eventSourceManager.forceFlush();
            expect(console.warn).toHaveBeenCalledWith('⚠️ InstanceConfigUpdated event missing name or node:', expect.any(Object));
            expect(mockStore.setConfigUpdated).not.toHaveBeenCalled();
        });

        test('should handle invalid JSON in events', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            getHandler(es, 'NodeStatusUpdated')({data: 'invalid json {['});
            expect(console.warn).toHaveBeenCalledWith('⚠️ Invalid JSON in NodeStatusUpdated event:', 'invalid json {[');
        });

        test('should handle empty buffers gracefully', () => {
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            jest.runAllTimers();
            expect(mockStore.setNodeStatuses).not.toHaveBeenCalled();
            eventSourceManager.forceFlush();
            expect(console.error).not.toHaveBeenCalled();
        });

        test('should handle errors during buffer flush', () => {
            mockStore.setNodeStatuses.mockImplementation(() => {
                throw new Error('Test error');
            });
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            getHandler(es, 'NodeStatusUpdated')({data: JSON.stringify({node: 'node1', node_status: {status: 'up'}})});
            jest.runAllTimers();
            expect(console.error).toHaveBeenCalledWith('Error during buffer flush:', expect.any(Error));
        });

        test('should clear all buffers and reset state via setPageActive', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            getHandler(es, 'NodeStatusUpdated')({data: JSON.stringify({node: 'node1', node_status: {status: 'up'}})});
            eventSourceManager.setPageActive(false);
            eventSourceManager.setPageActive(true);
            eventSourceManager.forceFlush();
            expect(mockStore.setNodeStatuses).not.toHaveBeenCalled();
        });

        test('should not flush when page not active', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            eventSourceManager.setPageActive(false);
            getHandler(es, 'NodeStatusUpdated')({data: JSON.stringify({node: 'node1', node_status: {status: 'up'}})});
            jest.runAllTimers();
            expect(mockStore.setNodeStatuses).not.toHaveBeenCalled();
        });

        test('should clear existing timeout when eventCount reaches BATCH_SIZE', () => {
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'NodeStatusUpdated');
            for (let i = 0; i < 100; i++)
                handler({data: JSON.stringify({node: `node${i}`, node_status: {status: 'up'}})});
            expect(clearTimeoutSpy).toHaveBeenCalled();
            clearTimeoutSpy.mockRestore();
        });

        test('should reschedule flush when MIN_FLUSH_INTERVAL not elapsed', () => {
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'NodeStatusUpdated');
            handler({data: JSON.stringify({node: 'node1', node_status: {status: 'up'}})});
            jest.clearAllTimers();
            const flushTime = mockNow;
            eventSourceManager.forceFlush();
            mockNow = flushTime + 2;
            handler({data: JSON.stringify({node: 'node2', node_status: {status: 'down'}})});
            jest.clearAllTimers();
            setTimeoutSpy.mockClear();
            eventSourceManager.forceFlush();
            expect(setTimeoutSpy).toHaveBeenCalled();
            mockNow = flushTime + 100000;
            jest.runAllTimers();
            expect(mockStore.setNodeStatuses).toHaveBeenCalled();
            setTimeoutSpy.mockRestore();
        });

        test('should clear pending flushTimeoutId when flushBuffers starts', () => {
            const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            getHandler(es, 'NodeStatusUpdated')({data: JSON.stringify({node: 'node1', node_status: {status: 'up'}})});
            clearTimeoutSpy.mockClear();
            eventSourceManager.forceFlush();
            expect(clearTimeoutSpy).toHaveBeenCalled();
            expect(mockStore.setNodeStatuses).toHaveBeenCalled();
            clearTimeoutSpy.mockRestore();
        });

        test('should set needsFlush when event arrives during active flush', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'NodeStatusUpdated');
            let callCount = 0;
            mockStore.setNodeStatuses = jest.fn(() => {
                if (++callCount === 1)
                    handler({data: JSON.stringify({node: 'node99', node_status: {status: 'up'}})});
            });
            handler({data: JSON.stringify({node: 'node1', node_status: {status: 'up'}})});
            jest.clearAllTimers();
            eventSourceManager.forceFlush();
            expect(console.debug).toHaveBeenCalledWith(expect.stringContaining('Event arrived during flush'));
        });

        test('should debounce multiple rapid events into a single flush', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'NodeStatusUpdated');
            handler({data: JSON.stringify({node: 'n1', node_status: {status: 'up'}})});
            handler({data: JSON.stringify({node: 'n2', node_status: {status: 'down'}})});
            handler({data: JSON.stringify({node: 'n3', node_status: {status: 'up'}})});
            jest.runAllTimers();
            expect(mockStore.setNodeStatuses).toHaveBeenCalledTimes(1);
            expect(mockStore.setNodeStatuses).toHaveBeenCalledWith(
                expect.objectContaining({n1: {status: 'up'}, n2: {status: 'down'}, n3: {status: 'up'}})
            );
        });

        test('should skip debounce callback when eventCount already drained', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'NodeStatusUpdated');
            handler({data: JSON.stringify({node: 'node1', node_status: {status: 'up'}})});
            eventSourceManager.forceFlush();
            mockStore.setNodeStatuses.mockClear();
            jest.runAllTimers();
            expect(mockStore.setNodeStatuses).not.toHaveBeenCalled();
        });

        test('should use requestAnimationFrame for non-Safari BATCH_SIZE flush', () => {
            const rafSpy = jest.spyOn(global, 'requestAnimationFrame');
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'NodeStatusUpdated');
            for (let i = 0; i < 50; i++)
                handler({data: JSON.stringify({node: `node${i}`, node_status: {status: 'up'}})});
            expect(rafSpy).toHaveBeenCalled();
            rafSpy.mockRestore();
            jest.runAllTimers();
        });

        test('should flush immediately on reconnect if buffered', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            getHandler(es, 'NodeStatusUpdated')({data: JSON.stringify({node: 'node1', node_status: {status: 'up'}})});
            mockEventSource.onopen();
            jest.runAllTimers();
            expect(mockStore.setNodeStatuses).toHaveBeenCalled();
        });

        test('should handle Safari batch updates', () => {
            const originalUA = navigator.userAgent;
            Object.defineProperty(navigator, 'userAgent', {
                value: 'Mozilla/5.0 AppleWebKit/605.1.15 Version/14.0 Safari/605.1.15',
                writable: true,
                configurable: true
            });
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'NodeStatusUpdated');
            for (let i = 0; i < 150; i++)
                handler({data: JSON.stringify({node: `node${i}`, node_status: {status: 'up'}})});
            jest.runAllTimers();
            expect(mockStore.setNodeStatuses).toHaveBeenCalled();
            Object.defineProperty(navigator, 'userAgent', {
                value: originalUA,
                writable: true,
                configurable: true
            });
        });

        test('should handle isEqual comparison with null values', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            mockStore.nodeStatus = {node1: null};
            getHandler(es, 'NodeStatusUpdated')({data: JSON.stringify({node: 'node1', node_status: {status: 'up'}})});
            jest.runAllTimers();
            expect(mockStore.setNodeStatuses).toHaveBeenCalled();
        });

        test('should remove buffered instanceStatus if pending delete exists', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'InstanceStatusUpdated');
            handler({data: JSON.stringify({path: 'obj1', node: 'node1', instance_status: {status: 'running'}})});
            mockStore.pendingDeletes = {'obj1:node1': true};
            jest.runAllTimers();
            // Buffer is cleaned, but the path key remains as empty object
            expect(mockStore.setInstanceStatuses).toHaveBeenCalled();
            const calledWith = mockStore.setInstanceStatuses.mock.calls[0][0];
            // obj1 should be an empty object (no nodes)
            expect(calledWith.obj1).toEqual({});
        });

        test('should remove buffered instanceConfig if pending delete exists', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'InstanceConfigUpdated');
            handler({data: JSON.stringify({path: 'obj1', node: 'node1', instance_config: {cfg: 1}})});
            mockStore.pendingDeletes = {'obj1:node1': true};
            jest.runAllTimers();
            expect(mockStore.setInstanceConfig).not.toHaveBeenCalled();
        });

        test('should handle configUpdated event with missing name/node', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'InstanceConfigUpdated');
            handler({data: JSON.stringify({instance_config: {cfg: 1}})});
            jest.runAllTimers();
            // No configUpdated should be buffered because name and node are missing
            expect(mockStore.setConfigUpdated).not.toHaveBeenCalled();
            expect(console.warn).toHaveBeenCalledWith('⚠️ InstanceConfigUpdated event missing name or node:', expect.any(Object));
        });
    });

    describe('Error handling and reconnection', () => {
        test('should handle errors and try to reconnect with exponential backoff', () => {
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            mockEventSource.onerror({status: 500});
            expect(console.error).toHaveBeenCalled();
            expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Reconnecting in'));
            const delay = setTimeoutSpy.mock.calls[0][1];
            expect(delay).toBeGreaterThanOrEqual(1000);
            expect(delay).toBeLessThanOrEqual(30000);
            setTimeoutSpy.mockRestore();
        });

        test('should not redirect if page not active on max attempts', () => {
            eventSourceManager.setPageActive(false);
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            let currentMock = mockEventSource;
            for (let i = 0; i < 10; i++) {
                currentMock.onerror({status: 500});
                jest.advanceTimersByTime(1000);
                currentMock = {
                    onopen: jest.fn(),
                    onerror: jest.fn(),
                    addEventListener: jest.fn(),
                    close: jest.fn(),
                    readyState: 1
                };
                EventSourcePolyfill.mockImplementation(() => currentMock);
            }
            currentMock.onerror({status: 500});
            expect(window.dispatchEvent).not.toHaveBeenCalled();
        });

        test('should not reconnect when no current token', () => {
            localStorageMock.getItem.mockReturnValue(null);
            eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            mockEventSource.onerror({status: 500});
            jest.advanceTimersByTime(2000);
            expect(EventSourcePolyfill).toHaveBeenCalledTimes(1);
        });
    });

    describe('Utility functions and helpers', () => {
        test('should handle valid, invalid, and empty filters in createQueryString', () => {
            eventSourceManager.configureEventSource('fake-token');
            expect(EventSourcePolyfill.mock.calls[0][0]).toContain('cache=true');

            jest.clearAllMocks();
            eventSourceManager.configureEventSource('fake-token', null, ['InvalidFilter', 'NodeStatusUpdated']);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid filters detected'));
            expect(EventSourcePolyfill.mock.calls[0][0]).toContain('filter=NodeStatusUpdated');

            jest.clearAllMocks();
            eventSourceManager.configureEventSource('fake-token', null, []);
            expect(console.warn).toHaveBeenCalledWith('No valid API event filters provided, using default filters');
            expect(EventSourcePolyfill).toHaveBeenCalled();
        });

        test('should dispatch auth redirect event', () => {
            eventSourceManager.navigationService.redirectToAuth();
            expect(window.dispatchEvent).toHaveBeenCalledWith(expect.any(CustomEvent));
            const event = window.dispatchEvent.mock.calls[0][0];
            expect(event.type).toBe('om3:auth-redirect');
            expect(event.detail).toBe('/auth-choice');
        });

        test('should export prepareForNavigation as alias for forceFlush', () => {
            expect(typeof eventSourceManager.prepareForNavigation).toBe('function');
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            getHandler(es, 'NodeStatusUpdated')({data: JSON.stringify({node: 'node1', node_status: {status: 'up'}})});
            jest.clearAllTimers();
            eventSourceManager.prepareForNavigation();
            expect(mockStore.setNodeStatuses).toHaveBeenCalled();
        });

        test('should configure EventSource with objectName - adds path to filter URL', () => {
            eventSourceManager.configureEventSource('fake-token', 'my-service/svc1');
            expect(EventSourcePolyfill.mock.calls[0][0]).toContain('path');
        });

        test('should create URL with cache=false when useCache is false', () => {
            eventSourceManager.configureEventSource('fake-token', null, ['NodeStatusUpdated'], false);
            expect(EventSourcePolyfill.mock.calls[0][0]).toContain('cache=false');
        });

        test('clearEventBuffers should reset buffers and state', () => {
            const es = eventSourceManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const handler = getHandler(es, 'NodeStatusUpdated');
            handler({data: JSON.stringify({node: 'node1', node_status: {status: 'up'}})});
            eventSourceManager.clearEventBuffers();
            eventSourceManager.forceFlush();
            expect(mockStore.setNodeStatuses).not.toHaveBeenCalled();
        });
    });

    describe('Logger EventSource', () => {
        beforeEach(() => {
            EventSourcePolyfill.mockImplementation(() => mockLoggerEventSource);
        });

        test('should create logger EventSource and attach listeners for valid filters only', () => {
            const ls = eventSourceManager.createLoggerEventSource(URL_NODE_EVENT, 'fake-token',
                ['ObjectStatusUpdated', 'InstanceStatusUpdated', 'Invalid']);
            expect(ls.addEventListener).toHaveBeenCalledTimes(2);
            expect(ls.addEventListener.mock.calls[0][0]).toBe('ObjectStatusUpdated');
        });

        test('should close existing logger before creating new, and not throw if none', () => {
            eventSourceManager.createLoggerEventSource(URL_NODE_EVENT, 'fake-token', []);
            EventSourcePolyfill.mockImplementationOnce(() => ({...mockLoggerEventSource}));
            eventSourceManager.createLoggerEventSource(URL_NODE_EVENT, 'fake-token', []);
            expect(mockLoggerEventSource.close).toHaveBeenCalled();
            expect(() => eventSourceManager.closeLoggerEventSource()).not.toThrow();
        });

        test('should not create logger if no token', () => {
            expect(eventSourceManager.createLoggerEventSource(URL_NODE_EVENT, '', [])).toBeNull();
            expect(console.error).toHaveBeenCalledWith('❌ Missing token for Logger EventSource!');
        });

        test('should handle open and error events without logging them', () => {
            eventSourceManager.createLoggerEventSource(URL_NODE_EVENT, 'fake-token', []);
            mockLoggerEventSource.onopen();
            expect(console.info).toHaveBeenCalledWith('✅ Logger EventSource connection established');
            expect(mockLogStore.addEventLog).not.toHaveBeenCalledWith('CONNECTION_OPENED', expect.any(Object));

            mockLoggerEventSource.onerror({message: 'test error', status: 500});
            expect(console.error).toHaveBeenCalled();
            expect(mockLogStore.addEventLog).not.toHaveBeenCalledWith('CONNECTION_ERROR', expect.any(Object));
        });

        test('should handle 401 in logger: new token, silent renew success and failure', async () => {
            // New token from storage
            localStorageMock.getItem.mockReturnValue('new-token');
            eventSourceManager.createLoggerEventSource(URL_NODE_EVENT, 'old-token', []);
            mockLoggerEventSource.onerror({status: 401});
            expect(console.info).toHaveBeenCalledWith('🔄 New token available, updating Logger EventSource');

            // Silent renew success
            const mockUser = {access_token: 'new-logger-token', expires_at: Date.now() + 3600000};
            window.oidcUserManager = {signinSilent: jest.fn().mockResolvedValue(mockUser)};
            localStorageMock.getItem.mockReturnValue(null);
            eventSourceManager.createLoggerEventSource(URL_NODE_EVENT, 'old-token', []);
            mockLoggerEventSource.onerror({status: 401});
            await Promise.resolve();
            expect(localStorageMock.setItem).toHaveBeenCalledWith('authToken', 'new-logger-token');

            // Silent renew failure
            window.oidcUserManager = {signinSilent: jest.fn().mockRejectedValue(new Error('logger renew fail'))};
            localStorageMock.getItem.mockReturnValue(null);
            eventSourceManager.createLoggerEventSource(URL_NODE_EVENT, 'old-token', []);
            mockLoggerEventSource.onerror({status: 401});
            await Promise.resolve();
            await Promise.resolve();
            expect(console.error).toHaveBeenCalledWith('❌ Silent renew failed for logger:', expect.any(Error));
        });

        test('should handle max reconnections in logger without connection logging', () => {
            eventSourceManager.createLoggerEventSource(URL_NODE_EVENT, 'fake-token', []);
            for (let i = 0; i < 15; i++) {
                mockLoggerEventSource.onerror({status: 500});
                jest.advanceTimersByTime(1000);
            }
            expect(console.error).toHaveBeenCalledWith('❌ Max reconnection attempts reached for logger');
            expect(mockLogStore.addEventLog).not.toHaveBeenCalledWith('MAX_RECONNECTIONS_REACHED', expect.any(Object));
            expect(window.dispatchEvent).toHaveBeenCalledWith(expect.any(CustomEvent));
        });

        test('should process events and log them, handle invalid JSON', () => {
            eventSourceManager.setPageActive(true);
            eventSourceManager.createLoggerEventSource(URL_NODE_EVENT, 'fake-token', ['ObjectStatusUpdated']);
            const handler = mockLoggerEventSource.addEventListener.mock.calls[0][1];
            handler({data: JSON.stringify({path: 'test'})});
            expect(mockLogStore.addEventLog).toHaveBeenCalledWith('ObjectStatusUpdated', expect.any(Object));

            handler({data: 'not valid json'});
            expect(mockLogStore.addEventLog).toHaveBeenCalledWith('ObjectStatusUpdated_PARSE_ERROR',
                expect.objectContaining({error: expect.any(String), rawData: 'not valid json'})
            );
        });

        test('should ignore events when page not active', () => {
            eventSourceManager.createLoggerEventSource(URL_NODE_EVENT, 'fake-token', ['ObjectStatusUpdated']);
            eventSourceManager.setPageActive(false);
            mockLoggerEventSource.addEventListener.mock.calls[0][1]({data: JSON.stringify({path: 'test'})});
            expect(mockLogStore.addEventLog).not.toHaveBeenCalled();
        });

        test('should call and handle errors in logger _cleanup', () => {
            eventSourceManager.createLoggerEventSource(URL_NODE_EVENT, 'fake-token', []);
            const cleanupSpy = jest.fn();
            mockLoggerEventSource._cleanup = cleanupSpy;
            eventSourceManager.closeLoggerEventSource();
            expect(cleanupSpy).toHaveBeenCalled();

            eventSourceManager.createLoggerEventSource(URL_NODE_EVENT, 'fake-token', []);
            mockLoggerEventSource._cleanup = () => {
                throw new Error('logger cleanup error');
            };
            expect(() => eventSourceManager.closeLoggerEventSource()).not.toThrow();
            expect(console.debug).toHaveBeenCalledWith('Error during logger eventSource cleanup', expect.any(Error));
        });

        test('should not update logger if no new token', () => {
            eventSourceManager.createLoggerEventSource(URL_NODE_EVENT, 'old-token', []);
            eventSourceManager.updateLoggerEventSourceToken('');
            expect(mockLoggerEventSource.close).not.toHaveBeenCalled();
        });

        test('should handle missing token in configureLoggerEventSource and startLoggerReception', () => {
            eventSourceManager.configureLoggerEventSource('');
            expect(console.error).toHaveBeenCalledWith('❌ No token provided for Logger SSE!');
            eventSourceManager.startLoggerReception('');
            expect(console.error).toHaveBeenCalledWith('❌ No token provided for Logger SSE!');
        });

        test('should ignore onerror if not current logger EventSource', () => {
            eventSourceManager.createLoggerEventSource(URL_NODE_EVENT, 'fake-token', []);
            eventSourceManager.closeLoggerEventSource();
            mockLoggerEventSource.onerror({status: 500});
            expect(console.info).not.toHaveBeenCalledWith(expect.stringContaining('Logger reconnecting'));
        });

        test('should restart logger EventSource when updateLoggerEventSourceToken called with open connection', () => {
            eventSourceManager.createLoggerEventSource(URL_NODE_EVENT, 'old-token', ['ObjectStatusUpdated']);
            const nextMock = {...mockLoggerEventSource, close: jest.fn(), addEventListener: jest.fn()};
            EventSourcePolyfill.mockImplementation(() => nextMock);
            localStorageMock.getItem.mockReturnValue('new-token');
            eventSourceManager.updateLoggerEventSourceToken('new-token');
            expect(mockLoggerEventSource.close).toHaveBeenCalled();
            jest.advanceTimersByTime(200);
            expect(EventSourcePolyfill).toHaveBeenCalledTimes(2);
        });

        test('should not restart logger EventSource when connection is already closed', () => {
            eventSourceManager.createLoggerEventSource(URL_NODE_EVENT, 'old-token', []);
            mockLoggerEventSource.readyState = 2;
            eventSourceManager.updateLoggerEventSourceToken('new-token');
            expect(EventSourcePolyfill).toHaveBeenCalledTimes(1);
        });

        test('should configure and start logger with objectName', () => {
            eventSourceManager.configureLoggerEventSource('fake-token', 'my-service/svc1');
            expect(EventSourcePolyfill.mock.calls[0][0]).toContain('path');

            jest.clearAllMocks();
            eventSourceManager.startLoggerReception('fake-token', eventSourceManager.DEFAULT_FILTERS, 'my-service/svc1');
            expect(EventSourcePolyfill.mock.calls[0][0]).toContain('path');
        });
    });

    // Safari-specific branch coverage using isolated module loading
    describe('Safari optimizations (isSafari true)', () => {
        let SafariESManager;
        let safMockStore, safMockLogStore;
        let originalUA;

        beforeEach(() => {
            jest.resetModules();
            originalUA = navigator.userAgent;
            Object.defineProperty(navigator, 'userAgent', {
                value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Safari/605.1.15',
                writable: true,
                configurable: true
            });

            jest.doMock('event-source-polyfill', () => ({
                EventSourcePolyfill: jest.fn(),
            }));
            jest.doMock('../hooks/useEventStore.js', () => ({
                __esModule: true,
                default: {getState: jest.fn()},
            }));
            jest.doMock('../hooks/useEventLogStore.js', () => ({
                __esModule: true,
                default: {getState: jest.fn()},
            }));
            jest.doMock('../utils/logger.js', () => ({
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
            }));

            SafariESManager = require('../eventSourceManager');

            safMockStore = {...mockStore, pendingDeletes: {}};
            safMockLogStore = {addEventLog: jest.fn()};
            const useEventStore = require('../hooks/useEventStore.js').default;
            useEventStore.getState.mockReturnValue(safMockStore);
            const useEventLogStore = require('../hooks/useEventLogStore.js').default;
            useEventLogStore.getState.mockReturnValue(safMockLogStore);

            const polyfill = require('event-source-polyfill');
            polyfill.EventSourcePolyfill.mockImplementation(() => ({
                onopen: jest.fn(),
                onerror: null,
                addEventListener: jest.fn(),
                close: jest.fn(),
                readyState: 1,
                url: URL_NODE_EVENT + '?cache=true&filter=NodeStatusUpdated',
            }));
        });

        afterEach(() => {
            Object.defineProperty(navigator, 'userAgent', {
                value: originalUA,
                writable: true,
                configurable: true
            });
            jest.resetModules();
        });

        test('should use setTimeout instead of requestAnimationFrame for batch flush', () => {
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
            SafariESManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const esMock = require('event-source-polyfill').EventSourcePolyfill.mock.results[0].value;
            const handler = esMock.addEventListener.mock.calls.find(c => c[0] === 'NodeStatusUpdated')[1];
            for (let i = 0; i < 150; i++) {
                handler({data: JSON.stringify({node: `node${i}`, node_status: {status: 'up'}})});
            }
            expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 0);
            setTimeoutSpy.mockRestore();
            jest.runAllTimers();
        });

        test('should set BATCH_SIZE to 150', () => {
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
            SafariESManager.createEventSource(URL_NODE_EVENT, 'fake-token');
            const esMock = require('event-source-polyfill').EventSourcePolyfill.mock.results[0].value;
            const handler = esMock.addEventListener.mock.calls.find(c => c[0] === 'NodeStatusUpdated')[1];
            for (let i = 0; i < 149; i++) {
                handler({data: JSON.stringify({node: `node${i}`, node_status: {status: 'up'}})});
            }
            expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 0);
            handler({data: JSON.stringify({node: 'node149', node_status: {status: 'up'}})});
            expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 0);
            setTimeoutSpy.mockRestore();
            jest.runAllTimers();
        });
    });
});
