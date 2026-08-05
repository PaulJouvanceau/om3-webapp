import React from 'react';
import {render, screen, waitFor, fireEvent, act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import axios from 'axios';
import {vi, describe, test, expect, beforeEach, afterEach, afterAll} from 'vitest';
import * as matchers from 'vitest-axe';
import ClusterOverview from '../Cluster.jsx';
import {URL_POOL, URL_NETWORK} from '../../config/apiPath.js';
import {startEventReception} from '../../eventSourceManager';
import {
    useNodeStats,
    useObjectStats,
    useHeartbeatStats,
} from '../../hooks/useClusterData';
import {useKindData} from '../../hooks/useKindData';

expect.extend(matchers);

// Hoisted variables for use in mocks
const {
    mockNavigate,
    mockToken,
} = vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    mockToken: 'mock-token',
}));

// ── Mocks ──────────────────────────────────────────────────────────────
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

vi.mock('axios');

vi.mock('../../hooks/useClusterData', () => ({
    useNodeStats: vi.fn(),
    useObjectStats: vi.fn(),
    useHeartbeatStats: vi.fn(),
}));

vi.mock('../../hooks/useKindData', () => ({
    useKindData: vi.fn(),
}));

vi.mock('../../eventSourceManager', () => ({
    startEventReception: vi.fn(),
    closeEventSource: vi.fn(),
    startLoggerReception: vi.fn(),
    closeLoggerEventSource: vi.fn(),
    DEFAULT_FILTERS: [],
}));

vi.mock('../ClusterStatGrids.jsx', () => {
    const GridNodes = ({nodeCount, frozenCount, onClick}) => (
        <button aria-label="Nodes stat card" onClick={onClick}>
            <div data-testid="node-count">{nodeCount}</div>
            <div data-testid="node-status">Frozen: {frozenCount}</div>
        </button>
    );
    const GridObjects = ({objectCount, statusCount, onClick}) => (
        <div>
            <button aria-label="Objects stat card" onClick={() => onClick && onClick()}>
                <div data-testid="object-count">{objectCount}</div>
                <div data-testid="up-count">Up {statusCount?.up ?? 0}</div>
                <div data-testid="warn-count">Warn {statusCount?.warn ?? 0}</div>
                <div data-testid="down-count">Down {statusCount?.down ?? 0}</div>
                <div data-testid="na-count">N/A {statusCount?.['n/a'] ?? 0}</div>
                <div data-testid="unprovisioned-count">
                    Unprovisioned {statusCount?.unprovisioned ?? 0}
                </div>
            </button>
            <button
                aria-label="Objects up status"
                onClick={() => onClick && onClick('up')}
                data-testid="up-status-button"
            >
                View Up
            </button>
            <button
                aria-label="Objects warn status"
                onClick={() => onClick && onClick('warn')}
                data-testid="warn-status-button"
            >
                View Warn
            </button>
        </div>
    );
    const GridNamespaces = ({namespaceCount, namespaceSubtitle, onClick}) => (
        <button aria-label="Namespaces stat card" onClick={() => onClick && onClick()}>
            <div data-testid="namespace-count">{namespaceCount}</div>
            <div>
                {namespaceSubtitle?.map((ns) => (
                    <div
                        key={ns.namespace}
                        role="group"
                        aria-label={`${ns.namespace} chip`}
                        className="ns-chip"
                        data-testid={`namespace-${ns.namespace}`}
                    >
                        <span>{ns.namespace}</span>
                        <span data-testid={`${ns.namespace}-count`} style={{fontSize: '10px'}}>
              {ns.count}
            </span>
                    </div>
                ))}
            </div>
        </button>
    );
    const GridHeartbeats = ({heartbeatCount, runningCount, perHeartbeatStats, onClick}) => (
        <div>
            <button aria-label="Heartbeats stat card" onClick={() => onClick && onClick()}>
                <div data-testid="heartbeat-count">{heartbeatCount}</div>
                <div data-testid="running-count">Running: {runningCount}</div>
                <div data-testid="beating-count">Beating: {perHeartbeatStats?.beating ?? 0}</div>
                <div data-testid="non-beating-count">Non-beating: {perHeartbeatStats?.stale ?? 0}</div>
            </button>
            <button
                aria-label="Heartbeats beating status"
                onClick={() => onClick && onClick('beating')}
                data-testid="beating-status-button"
            >
                View Beating
            </button>
            <button
                aria-label="Heartbeats running state"
                onClick={() => onClick && onClick('beating', 'running')}
                data-testid="running-state-button"
            >
                View Running
            </button>
        </div>
    );
    const GridPools = ({poolCount, onClick}) => (
        <button aria-label="Pools stat card" onClick={() => onClick && onClick()}>
            <div data-testid="pool-count">{poolCount}</div>
        </button>
    );
    const GridNetworks = ({networks, onClick}) => (
        <button aria-label="Networks stat card" onClick={() => onClick && onClick()}>
            <div data-testid="network-count">{networks?.length ?? 0}</div>
        </button>
    );
    const GridKinds = ({kindCount, kindSubtitle, onClick}) => (
        <button aria-label="Kinds stat card" onClick={() => onClick && onClick()}>
            <div data-testid="kind-count">{kindCount}</div>
            <div>
                {kindSubtitle?.map(({kind}) => (
                    <div key={kind} data-testid={`kind-${kind}`}>
                        {kind}
                    </div>
                ))}
            </div>
        </button>
    );
    return {
        GridNodes,
        GridObjects,
        GridNamespaces,
        GridHeartbeats,
        GridPools,
        GridNetworks,
        GridKinds,
    };
});

describe('ClusterOverview', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        // Set mocks
        Storage.prototype.getItem = vi.fn(() => mockToken);

        useNodeStats.mockReturnValue({count: 2, frozen: 1});
        useObjectStats.mockReturnValue({
            objectCount: 4,
            statusCount: {
                up: 1,
                warn: 1,
                down: 1,
                'n/a': 1,
                unprovisioned: 1,
            },
            namespaceCount: 3,
            namespaceSubtitle: [
                {namespace: 'ns1', count: 2},
                {namespace: 'root', count: 1},
                {namespace: 'ns-with-dash', count: 1},
                {namespace: 'ns.with.dots', count: 1},
            ],
        });
        useHeartbeatStats.mockReturnValue({
            count: 5,
            running: 2,
            perHeartbeatStats: {beating: 3, stale: 2},
        });
        useKindData.mockReturnValue({
            statusByKind: {Pod: 'up', Service: 'warn'},
            kinds: ['Pod', 'Service'],
        });

        axios.get.mockResolvedValue({
            data: {items: [{id: 'pool1'}, {id: 'pool2'}], networks: ['net1', 'net2']},
        });

        startEventReception.mockImplementation(vi.fn());
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.clearAllTimers();
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    test('renders cluster overview with all stat cards and edge-case data', async () => {
        render(
            <MemoryRouter>
                <ClusterOverview/>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByTestId('pool-count')).toHaveTextContent('2');
        });

        expect(screen.getByText('Cluster Overview')).toBeInTheDocument();

        // Nodes
        expect(screen.getByTestId('node-count')).toHaveTextContent('2');
        expect(screen.getByTestId('node-status')).toHaveTextContent('Frozen: 1');

        // Objects
        expect(screen.getByTestId('object-count')).toHaveTextContent('4');
        expect(screen.getByTestId('up-count')).toHaveTextContent('Up 1');
        expect(screen.getByTestId('warn-count')).toHaveTextContent('Warn 1');
        expect(screen.getByTestId('down-count')).toHaveTextContent('Down 1');
        expect(screen.getByTestId('na-count')).toHaveTextContent('N/A 1');
        expect(screen.getByTestId('unprovisioned-count')).toHaveTextContent('Unprovisioned 1');

        // Namespaces
        expect(screen.getByTestId('namespace-count')).toHaveTextContent('3');
        expect(screen.getByTestId('namespace-ns1')).toBeInTheDocument();
        expect(screen.getByTestId('namespace-root')).toBeInTheDocument();
        expect(screen.getByTestId('namespace-ns-with-dash')).toBeInTheDocument();
        expect(screen.getByTestId('namespace-ns.with.dots')).toBeInTheDocument();
        expect(screen.getByTestId('ns1-count')).toHaveTextContent('2');

        // Heartbeats
        expect(screen.getByTestId('heartbeat-count')).toHaveTextContent('5');
        expect(screen.getByTestId('beating-count')).toHaveTextContent('Beating: 3');
        expect(screen.getByTestId('non-beating-count')).toHaveTextContent('Non-beating: 2');
        expect(screen.getByTestId('running-count')).toHaveTextContent('Running: 2');

        // Pools & Networks
        expect(screen.getByRole('button', {name: /Pools stat card/i})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /Networks stat card/i})).toBeInTheDocument();
        expect(screen.getByTestId('network-count')).toHaveTextContent('2');

        // Kinds
        expect(screen.getByTestId('kind-count')).toHaveTextContent('2');
        expect(screen.getByTestId('kind-Pod')).toBeInTheDocument();
        expect(screen.getByTestId('kind-Service')).toBeInTheDocument();
    });

    test('fetches data on mount with auth token', async () => {
        render(
            <MemoryRouter>
                <ClusterOverview/>
            </MemoryRouter>
        );

        expect(localStorage.getItem).toHaveBeenCalledWith('authToken');
        expect(startEventReception).toHaveBeenCalledWith(mockToken, expect.any(Array));

        expect(axios.get).toHaveBeenCalledWith(URL_POOL, expect.objectContaining({
            headers: {Authorization: `Bearer ${mockToken}`},
            timeout: 5000,
        }));
        expect(axios.get).toHaveBeenCalledWith(URL_NETWORK, expect.objectContaining({
            headers: {Authorization: `Bearer ${mockToken}`},
            timeout: 5000,
        }));

        await waitFor(() => {
            expect(screen.getByTestId('pool-count')).toHaveTextContent('2');
        });
    });

    test('navigates correctly on all card clicks', async () => {
        render(
            <MemoryRouter>
                <ClusterOverview/>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByTestId('pool-count')).toHaveTextContent('2');
        });

        const clickAndAssert = (role, expectedPath) => {
            fireEvent.click(screen.getByRole('button', {name: new RegExp(role, 'i')}));
            act(() => {
                vi.advanceTimersByTime(50);
            });
            expect(mockNavigate).toHaveBeenCalledWith(expectedPath);
            mockNavigate.mockClear();
        };

        clickAndAssert('Nodes stat card', '/nodes');
        clickAndAssert('Objects stat card', '/objects');
        clickAndAssert('Namespaces stat card', '/namespaces');
        clickAndAssert('Heartbeats stat card', '/heartbeats');
        clickAndAssert('Pools stat card', '/pools');
        clickAndAssert('Kinds stat card', '/kinds');
        clickAndAssert('Networks stat card', '/network');

        fireEvent.click(screen.getByTestId('up-status-button'));
        act(() => {
            vi.advanceTimersByTime(50);
        });
        expect(mockNavigate).toHaveBeenCalledWith('/objects?globalState=up');
        mockNavigate.mockClear();

        fireEvent.click(screen.getByTestId('warn-status-button'));
        act(() => {
            vi.advanceTimersByTime(50);
        });
        expect(mockNavigate).toHaveBeenCalledWith('/objects?globalState=warn');
        mockNavigate.mockClear();

        fireEvent.click(screen.getByTestId('beating-status-button'));
        act(() => {
            vi.advanceTimersByTime(50);
        });
        expect(mockNavigate).toHaveBeenCalledWith('/heartbeats?status=beating');
        mockNavigate.mockClear();

        fireEvent.click(screen.getByTestId('running-state-button'));
        act(() => {
            vi.advanceTimersByTime(50);
        });
        expect(mockNavigate).toHaveBeenCalledWith('/heartbeats?status=beating&state=running');
    });

    test('handles empty data correctly', async () => {
        useNodeStats.mockReturnValue({count: 0, frozen: 0});
        useObjectStats.mockReturnValue({
            objectCount: 0,
            statusCount: {up: 0, warn: 0, down: 0, 'n/a': 0, unprovisioned: 0},
            namespaceCount: 0,
            namespaceSubtitle: [],
        });
        useHeartbeatStats.mockReturnValue({
            count: 0,
            running: 0,
            perHeartbeatStats: {beating: 0, stale: 0},
        });
        useKindData.mockReturnValue({statusByKind: {}, kinds: []});
        axios.get.mockResolvedValue({data: {items: [], networks: []}});

        render(
            <MemoryRouter>
                <ClusterOverview/>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByTestId('node-count')).toHaveTextContent('0');
        });

        expect(screen.getByTestId('object-count')).toHaveTextContent('0');
        expect(screen.getByTestId('namespace-count')).toHaveTextContent('0');
        expect(screen.getByTestId('heartbeat-count')).toHaveTextContent('0');
        expect(screen.getByTestId('pool-count')).toHaveTextContent('0');
        expect(screen.getByTestId('network-count')).toHaveTextContent('0');
        expect(screen.getByTestId('kind-count')).toHaveTextContent('0');
    });

    test('does not fetch data without auth token', async () => {
        Storage.prototype.getItem = vi.fn(() => null);

        render(
            <MemoryRouter>
                <ClusterOverview/>
            </MemoryRouter>
        );

        expect(startEventReception).not.toHaveBeenCalled();
        expect(axios.get).not.toHaveBeenCalled();
    });

    test('handles API errors gracefully', async () => {
        axios.get.mockRejectedValue(new Error('Network error'));

        render(
            <MemoryRouter>
                <ClusterOverview/>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByTestId('pool-count')).toHaveTextContent('0');
            expect(screen.getByTestId('network-count')).toHaveTextContent('0');
        });
    });

    test('cleans up on unmount during fetch', async () => {
        let resolvePromise;
        const slowPromise = new Promise((resolve) => {
            resolvePromise = resolve;
        });
        axios.get.mockReturnValue(slowPromise);

        const {unmount} = render(
            <MemoryRouter>
                <ClusterOverview/>
            </MemoryRouter>
        );

        unmount();
        resolvePromise({data: {items: [{id: 'pool1'}], networks: []}});

        await act(async () => {
            await slowPromise;
        });

        expect(mockNavigate).not.toHaveBeenCalled();
    });
});
