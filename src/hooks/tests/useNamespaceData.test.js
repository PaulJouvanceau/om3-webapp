import {describe, test, expect, vi, beforeEach} from 'vitest';
import {renderHook} from '@testing-library/react';
import {useNamespaceData} from '../useNamespaceData';
import useEventStore from '../useEventStore';

vi.mock('../useEventStore');

const mockState = {
    objectStatus: {},
};

function setObjectStatus(status) {
    mockState.objectStatus = status;
    // The hook uses `selectObjectStatus = (state) => state.objectStatus`
    // so the mock must call the selector with the full state.
    useEventStore.mockImplementation((selector) => selector(mockState));
}

beforeEach(() => {
    vi.clearAllMocks();
    setObjectStatus({});
});

describe('useNamespaceData', () => {
    test('returns empty data when objectStatus is empty', () => {
        const {result} = renderHook(() => useNamespaceData());
        expect(result.current).toEqual({
            statusByNamespace: {},
            namespaces: [],
            allObjectNames: [],
        });
    });

    test('filters out non-object values but keeps null', () => {
        setObjectStatus({
            valid: {avail: 'up'},
            notAnObject: 'just a string',
            alsoNull: null,                // typeof null === 'object' → kept
            undefinedValue: undefined,     // typeof undefined !== 'object' → filtered
        });
        const {result} = renderHook(() => useNamespaceData());
        // Order of Object.keys is insertion order: 'valid', 'notAnObject', 'alsoNull', 'undefinedValue'
        // After filter: valid, alsoNull
        expect(result.current.allObjectNames).toEqual(['valid', 'alsoNull']);
        expect(result.current.namespaces).toEqual(['root']);
        // valid: avail='up' → up+1; alsoNull: null?.avail → 'n/a' → n/a+1
        expect(result.current.statusByNamespace).toEqual({
            root: {up: 1, down: 0, warn: 0, 'n/a': 1},
        });
    });

    test('correctly extracts namespaces and counts statuses', () => {
        setObjectStatus({
            'ns1/svc/obj1': {avail: 'up'},
            'ns1/svc/obj2': {avail: 'down'},
            'ns2/vol/obj3': {avail: 'warn'},
            'ns2/vol/obj4': {avail: 'UP'},   // case-sensitive, 'UP' not recognized -> n/a
            'top-level': {avail: 'up'},       // no slash -> root
            'ns3/app': {avail: 'up'},         // 2 parts -> root
            'a/b/c/d': {avail: 'up'},         // 4 parts -> root
            'ns4/pkg/svc': {avail: 'down'},
        });

        const {result} = renderHook(() => useNamespaceData());

        expect(result.current.allObjectNames).toHaveLength(8);

        // root: top-level (up) + ns3/app (up) + a/b/c/d (up) = up:3; down:0; warn:0; n/a:0
        // ns1: obj1 (up) + obj2 (down) = up:1 down:1 warn:0 n/a:0
        // ns2: obj3 (warn) + obj4 (UP -> n/a) = up:0 down:0 warn:1 n/a:1
        // ns4: down:1
        const expectedStatusByNamespace = {
            root: {up: 3, down: 0, warn: 0, 'n/a': 0},
            ns1: {up: 1, down: 1, warn: 0, 'n/a': 0},
            ns2: {up: 0, down: 0, warn: 1, 'n/a': 1},
            ns4: {up: 0, down: 1, warn: 0, 'n/a': 0},
        };

        expect(result.current.statusByNamespace).toEqual(expectedStatusByNamespace);
        // namespaces sorted alphabetically: ns1, ns2, ns4, root
        expect(result.current.namespaces).toEqual(['ns1', 'ns2', 'ns4', 'root']);
    });

    test('handles missing avail gracefully', () => {
        setObjectStatus({
            'ns/vol/disk': {},
            'ns/vol/disk2': {avail: 'up'},
        });
        const {result} = renderHook(() => useNamespaceData());
        expect(result.current.statusByNamespace.ns).toEqual({
            up: 1, down: 0, warn: 0, 'n/a': 1,
        });
    });

    test('unknown avail values are counted as n/a', () => {
        setObjectStatus({
            'a/b/c': {avail: 'degraded'},
            'a/b/d': {avail: 'UNKNOWN'},
            'a/b/e': {avail: 'up'},
        });
        const {result} = renderHook(() => useNamespaceData());
        expect(result.current.statusByNamespace.a).toEqual({
            up: 1, down: 0, warn: 0, 'n/a': 2,
        });
    });
});
