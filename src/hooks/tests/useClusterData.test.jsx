import {describe, test, expect, vi, beforeEach} from 'vitest';
import {renderHook} from '@testing-library/react';
import {useNodeStats, useObjectStats, useHeartbeatStats} from '../useClusterData';

// Mock the store to control the input state
vi.mock('../useEventStore', () => ({
    default: vi.fn(),
}));

// Mock useDeferredValue to return the value immediately (not testing React's deferring)
vi.mock('react', async () => {
    const actual = await vi.importActual('react');
    return {
        ...actual,
        useDeferredValue: vi.fn().mockImplementation((value) => value),
    };
});

import useEventStore from '../useEventStore';

const mockStoreState = {
    nodeStatus: {},
    objectStatus: {},
    heartbeatStatus: {},
};

// Helper to set the mock store implementation
function setStoreState(overrides = {}) {
    Object.assign(mockStoreState, overrides);
    useEventStore.mockImplementation((selector) => selector(mockStoreState));
}

beforeEach(() => {
    // Reset state before each test
    mockStoreState.nodeStatus = {};
    mockStoreState.objectStatus = {};
    mockStoreState.heartbeatStatus = {};
    useEventStore.mockClear();
    setStoreState(); // apply defaults
});

describe('useNodeStats', () => {
    test('returns zero counts when no nodes are present', () => {
        setStoreState({nodeStatus: {}});
        const {result} = renderHook(() => useNodeStats());
        expect(result.current).toEqual({count: 0, frozen: 0, unfrozen: 0});
    });

    test('counts frozen and unfrozen nodes correctly', () => {
        setStoreState({
            nodeStatus: {
                node1: {frozen_at: '2025-01-01T00:00:00Z'},
                node2: {frozen_at: '0001-01-01T00:00:00Z'}, // considered unfrozen
                node3: {}, // no frozen_at -> unfrozen
                node4: {frozen_at: '2025-06-01T00:00:00Z'},
            },
        });
        const {result} = renderHook(() => useNodeStats());
        expect(result.current).toEqual({count: 4, frozen: 2, unfrozen: 2});
    });

    test('handles nodes with null/undefined frozen_at', () => {
        setStoreState({
            nodeStatus: {
                a: {frozen_at: null},
                b: {frozen_at: undefined},
            },
        });
        const {result} = renderHook(() => useNodeStats());
        expect(result.current).toEqual({count: 2, frozen: 0, unfrozen: 2});
    });
});

describe('useObjectStats', () => {
    test('returns empty stats when objectStatus is empty', () => {
        setStoreState({objectStatus: {}});
        const {result} = renderHook(() => useObjectStats());
        expect(result.current).toEqual({
            objectCount: 0,
            namespaceCount: 0,
            statusCount: {up: 0, down: 0, warn: 0, 'n/a': 0, unprovisioned: 0},
            namespaceSubtitle: [],
        });
    });

    test('aggregates objects, namespaces, and statuses correctly', () => {
        setStoreState({
            objectStatus: {
                'ns1/svc/obj1': {avail: 'up', provisioned: 'true'},
                'ns1/svc/obj2': {avail: 'down', provisioned: 'false'},
                'ns2/vol/obj3': {avail: 'warn'},
                'ns2/vol/obj4': {},
                'ns3/app': {avail: 'UP', provisioned: true}, // only one slash → placed in "root"
            },
        });

        const {result} = renderHook(() => useObjectStats());

        expect(result.current.objectCount).toBe(5);
        // namespaces: ns1, ns2, root
        expect(result.current.namespaceCount).toBe(3);

        // Status totals:
        // up: obj1 (ns1) + ns3/app (root) = 2
        // down: obj2 (ns1) = 1
        // warn: obj3 (ns2) = 1
        // n/a: obj4 (ns2, no avail) = 1
        // unprovisioned: obj2 (provisioned false) = 1
        expect(result.current.statusCount).toEqual({
            up: 2,
            down: 1,
            warn: 1,
            'n/a': 1,
            unprovisioned: 1,
        });

        expect(result.current.namespaceSubtitle).toHaveLength(3);

        // Sorted alphabetically: ns1, ns2, root
        const ns1 = result.current.namespaceSubtitle[0];
        expect(ns1.namespace).toBe('ns1');
        expect(ns1.count).toBe(2);
        expect(ns1.status).toEqual({
            up: 1, down: 1, warn: 0, 'n/a': 0, unprovisioned: 1,
        });

        const ns2 = result.current.namespaceSubtitle[1];
        expect(ns2.namespace).toBe('ns2');
        expect(ns2.count).toBe(2);
        expect(ns2.status).toEqual({
            up: 0, down: 0, warn: 1, 'n/a': 1, unprovisioned: 0,
        });

        const root = result.current.namespaceSubtitle[2];
        expect(root.namespace).toBe('root');
        expect(root.count).toBe(1);
        expect(root.status).toEqual({
            up: 1, down: 0, warn: 0, 'n/a': 0, unprovisioned: 0,
        });
    });

    test('object paths with no slash are placed in "root" namespace', () => {
        setStoreState({
            objectStatus: {
                'top-level': {avail: 'up'},
                'another': {avail: 'down'},
            },
        });
        const {result} = renderHook(() => useObjectStats());
        expect(result.current.namespaceCount).toBe(1);
        const rootNs = result.current.namespaceSubtitle.find(ns => ns.namespace === 'root');
        expect(rootNs).toBeDefined();
        expect(rootNs.count).toBe(2);
        expect(rootNs.status.up).toBe(1);
        expect(rootNs.status.down).toBe(1);
    });
});

describe('useHeartbeatStats', () => {
    test('returns empty stats when heartbeatStatus is empty', () => {
        setStoreState({heartbeatStatus: {}});
        const {result} = renderHook(() => useHeartbeatStats());
        expect(result.current).toEqual({
            count: 0,
            running: 0,
            beating: 0,
            stale: 0,
            stateCount: {running: 0, stopped: 0, failed: 0, warning: 0, unknown: 0},
            perHeartbeatStats: {},
        });
    });

    test('computes stats for a single node with running and beating streams', () => {
        setStoreState({
            heartbeatStatus: {
                nodeA: {
                    streams: [
                        {
                            id: 'hb#svc1.rx',
                            state: 'running',
                            peers: {
                                peer1: {is_beating: true},
                                peer2: {is_beating: false},
                            },
                        },
                        {
                            id: 'hb#svc1.tx',
                            state: 'running',
                            peers: {peerA: {is_beating: true}},
                        },
                    ],
                },
            },
        });

        const {result} = renderHook(() => useHeartbeatStats());

        // Base count: svc1 (rx/tx cleaned -> same base)
        expect(result.current.count).toBe(1);
        // Running: each stream is running, peer count >0 => increment by peer count
        // svc1.rx: peers = 2 -> running +2; svc1.tx: peers = 1 -> running +1 => total 3
        expect(result.current.running).toBe(3);
        // Beating: for each running stream, if nodeCount>1? nodeCount=1 so beating incremented for each stream regardless of beating peers?
        // In code: if (nodeCount <= 1 || streamHasBeating) beating++;
        // Both streams have streamHasBeating=true (peers with is_beating)
        // So beating = 2
        expect(result.current.beating).toBe(2);
        // Stale: 0
        expect(result.current.stale).toBe(0);
        // stateCount: two running
        expect(result.current.stateCount).toEqual({
            running: 2, stopped: 0, failed: 0, warning: 0, unknown: 0,
        });
        // perHeartbeatStats: svc1.rx running=2 beating=1 (peers beating count?) code: perHeartbeatStats[cleanedId].beating++ for each peer with is_beating? Actually: inside loop for peers, if peer.is_beating, then perHeartbeatStats[cleanedId].beating++.
        // For svc1.rx: peers: peer1 is_beating true -> beating+1, peer2 false -> 0 => beating=1
        // svc1.tx: peerA true -> beating=1
        expect(result.current.perHeartbeatStats).toEqual({
            'svc1.rx': {running: 2, beating: 1},
            'svc1.tx': {running: 1, beating: 1},
        });
    });

    test('handles unknown state and no peers', () => {
        setStoreState({
            heartbeatStatus: {
                nodeX: {
                    streams: [
                        {id: 'hb#task', state: 'weird', peers: {}}, // unknown state
                    ],
                },
            },
        });
        const {result} = renderHook(() => useHeartbeatStats());

        expect(result.current.count).toBe(1); // base 'task'
        expect(result.current.running).toBe(0);
        expect(result.current.beating).toBe(0);
        expect(result.current.stale).toBe(0);
        expect(result.current.stateCount.unknown).toBe(1);
        expect(result.current.stateCount.running).toBe(0);
    });

    test('stale count when nodeCount >1 and no beating peers', () => {
        setStoreState({
            heartbeatStatus: {
                node1: {
                    streams: [
                        {
                            id: 'hb#x',
                            state: 'running',
                            peers: {}, // no beating
                        },
                    ],
                },
                node2: {
                    streams: [], // just to make nodeCount=2
                },
            },
        });
        const {result} = renderHook(() => useHeartbeatStats());

        // nodeCount = 2 (>1), stream is running, streamHasBeating = false => stale++
        expect(result.current.stale).toBe(1);
        expect(result.current.beating).toBe(0);
    });
});