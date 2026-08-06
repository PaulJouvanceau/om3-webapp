import {describe, test, expect, vi, beforeEach} from 'vitest';
import {renderHook} from '@testing-library/react';
import {useKindData} from '../useKindData';
import useEventStore from '../useEventStore';
import {extractKind} from '../../utils/objectUtils';

// Mock dependencies
vi.mock('../useEventStore');
vi.mock('../../utils/objectUtils');

// React mock
vi.mock('react', async () => {
    const actual = await vi.importActual('react');
    return {
        ...actual,
        useDeferredValue: (value) => value,
    };
});

const mockStoreState = {
    objectStatus: {},
};

function setStoreState(overrides = {}) {
    Object.assign(mockStoreState, overrides);
    // Make useEventStore call the selector with the current mock state
    useEventStore.mockImplementation((selector) => selector(mockStoreState));
}

beforeEach(() => {
    // Reset state and mocks
    mockStoreState.objectStatus = {};
    vi.clearAllMocks();
    setStoreState();
});

describe('useKindData', () => {
    test('returns empty object and kinds when objectStatus is empty', () => {
        setStoreState({objectStatus: {}});
        const {result} = renderHook(() => useKindData());
        expect(result.current).toEqual({statusByKind: {}, kinds: []});
    });

    test('aggregates kind stats correctly', () => {
        // Mock extractKind to return a kind for each path
        extractKind.mockImplementation((path) => {
            const mapping = {
                'ns1/app/deployment': 'deployment',
                'ns1/app/service': 'service',
                'ns2/db/statefulset': 'statefulset',
                'ns2/db/another': 'statefulset',
                'ns3/ignored': 'ignored',
            };
            return mapping[path] || null;
        });

        setStoreState({
            objectStatus: {
                'ns1/app/deployment': {avail: 'up', provisioned: 'true'},
                'ns1/app/service': {avail: 'down', provisioned: 'false'},
                'ns2/db/statefulset': {avail: 'warn'},
                'ns2/db/another': {avail: 'UP', provisioned: false},
                'ns3/ignored': {},
            },
        });

        const {result} = renderHook(() => useKindData());

        const expectedStatusByKind = {
            deployment: {up: 1, down: 0, warn: 0, 'n/a': 0, unprovisioned: 0},
            ignored: {up: 0, down: 0, warn: 0, 'n/a': 1, unprovisioned: 0},
            service: {up: 0, down: 1, warn: 0, 'n/a': 0, unprovisioned: 1},
            statefulset: {up: 1, down: 0, warn: 1, 'n/a': 0, unprovisioned: 1},
        };

        expect(result.current.statusByKind).toEqual(expectedStatusByKind);
        expect(result.current.kinds).toEqual(['deployment', 'ignored', 'service', 'statefulset']);
    });

    test('skips objects where extractKind returns falsy', () => {
        extractKind.mockImplementation((path) => {
            return path === 'valid/path' ? 'validKind' : null;
        });

        setStoreState({
            objectStatus: {
                'valid/path': {avail: 'up'},
                'invalid/path': {avail: 'down'},
            },
        });

        const {result} = renderHook(() => useKindData());

        expect(result.current.statusByKind).toEqual({
            validKind: {up: 1, down: 0, warn: 0, 'n/a': 0, unprovisioned: 0},
        });
        expect(result.current.kinds).toEqual(['validKind']);
    });

    test('handles unprovisioned counts for different falsy values', () => {
        extractKind.mockReturnValue('volume');
        setStoreState({
            objectStatus: {
                'a/b/c1': {avail: 'up', provisioned: 'false'},
                'a/b/c2': {avail: 'down', provisioned: false},
                'a/b/c3': {avail: 'warn', provisioned: 0},
                'a/b/c4': {avail: 'up'},
            },
        });

        const {result} = renderHook(() => useKindData());
        expect(result.current.statusByKind.volume).toEqual({
            up: 2, down: 1, warn: 1, 'n/a': 0, unprovisioned: 2,
        });
    });

    test('sorts kinds alphabetically', () => {
        extractKind.mockImplementation((path) => {
            const parts = path.split('/');
            return parts[parts.length - 1];
        });

        setStoreState({
            objectStatus: {
                'x/alpha': {avail: 'up'},
                'y/gamma': {avail: 'up'},
                'z/beta': {avail: 'up'},
            },
        });

        const {result} = renderHook(() => useKindData());
        expect(result.current.kinds).toEqual(['alpha', 'beta', 'gamma']);
    });
});
