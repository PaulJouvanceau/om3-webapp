import React, {useEffect} from 'react';
import {render, screen, fireEvent, waitFor, act} from '@testing-library/react';
import useFetchDaemonStatus from '../useFetchDaemonStatus';
import {fetchDaemonStatus} from '../../services/api';

// Mock dependencies
vi.mock('../../services/api');
vi.mock('../../config/apiPath.js', () => ({
    URL_NODE_EVENT: '/mock-node-event',
}));

// Test component to use the hook
const TestComponent = ({token, autoFetch = false}) => {
    const {nodes, daemon, error, loading, clusterStats, fetchNodes, clusterName} =
        useFetchDaemonStatus();

    // Automatically call fetchNodes if autoFetch is true
    useEffect(() => {
        if (autoFetch && token) {
            fetchNodes(token);
        }
    }, [autoFetch, token, fetchNodes]);

    return (
        <div>
            <div data-testid="nodes">{JSON.stringify(nodes)}</div>
            <div data-testid="daemon">{JSON.stringify(daemon)}</div>
            <div data-testid="error">{error}</div>
            <div data-testid="loading">{loading.toString()}</div>
            <div data-testid="clusterStats">{JSON.stringify(clusterStats)}</div>
            <div data-testid="clusterName">{clusterName}</div>
            <button onClick={() => fetchNodes(token)} data-testid="fetchNodes">
                Fetch Nodes
            </button>
        </div>
    );
};

// Test component without autoFetch to test manual calls
const TestComponentManual = ({token}) => {
    const {nodes, daemon, error, loading, clusterStats, fetchNodes, clusterName} =
        useFetchDaemonStatus();

    return (
        <div>
            <div data-testid="nodes">{JSON.stringify(nodes)}</div>
            <div data-testid="daemon">{JSON.stringify(daemon)}</div>
            <div data-testid="error">{error}</div>
            <div data-testid="loading">{loading.toString()}</div>
            <div data-testid="clusterStats">{JSON.stringify(clusterStats)}</div>
            <div data-testid="clusterName">{clusterName}</div>
            <button onClick={() => fetchNodes(token)} data-testid="fetchNodes">
                Fetch Nodes
            </button>
        </div>
    );
};

describe('useFetchDaemonStatus Hook', () => {
    const mockToken = 'mock-token';
    const mockDaemonStatus = {
        daemon: {status: 'running'},
        cluster: {
            config: {name: 'test-cluster'},
            node: {
                node1: {status: 'active'},
                node2: {status: 'inactive'},
            },
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        fetchDaemonStatus.mockReset();
        console.error = jest.fn();

        // Clear localStorage before each test
        localStorage.clear();
    });

    test('initializes with correct default states', () => {
        render(<TestComponent token={mockToken}/>);

        expect(screen.getByTestId('nodes').textContent).toBe('[]');
        expect(screen.getByTestId('daemon').textContent).toBe('{}');
        expect(screen.getByTestId('error').textContent).toBe('');
        expect(screen.getByTestId('loading').textContent).toBe('false');
        expect(screen.getByTestId('clusterStats').textContent).toBe('{}');
        expect(screen.getByTestId('clusterName').textContent).toBe('');
        expect(screen.getByTestId('fetchNodes')).toBeInTheDocument();
    });

    test('fetchNodes updates states on successful API call', async () => {
        fetchDaemonStatus.mockResolvedValue(mockDaemonStatus);

        render(<TestComponent token={mockToken}/>);

        fireEvent.click(screen.getByTestId('fetchNodes'));

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });

        expect(screen.getByTestId('error').textContent).toBe('');
        expect(screen.getByTestId('daemon').textContent).toBe(
            JSON.stringify({status: 'running'})
        );
        expect(screen.getByTestId('nodes').textContent).toBe(
            JSON.stringify([
                {nodename: 'node1', status: 'active'},
                {nodename: 'node2', status: 'inactive'},
            ])
        );
        expect(screen.getByTestId('clusterStats').textContent).toBe(
            JSON.stringify({nodeCount: 2})
        );
        expect(screen.getByTestId('clusterName').textContent).toBe('test-cluster');

        expect(fetchDaemonStatus).toHaveBeenCalledWith(mockToken);
    });

    test('fetchNodes handles API error correctly', async () => {
        const errorMessage = 'Network error';
        fetchDaemonStatus.mockRejectedValue(new Error(errorMessage));

        render(<TestComponent token={mockToken}/>);

        fireEvent.click(screen.getByTestId('fetchNodes'));

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });

        expect(screen.getByTestId('error').textContent).toBe(
            'Failed to retrieve daemon statuses.'
        );
        expect(screen.getByTestId('nodes').textContent).toBe('[]');
        expect(screen.getByTestId('daemon').textContent).toBe('{}');
        expect(screen.getByTestId('clusterStats').textContent).toBe('{}');
        expect(screen.getByTestId('clusterName').textContent).toBe('');

        expect(fetchDaemonStatus).toHaveBeenCalledWith(mockToken);
        expect(console.error).toHaveBeenCalledWith(
            'Error while fetching daemon statuses:',
            expect.any(Error)
        );
    });

    test('fetchNodes caches nodes correctly with autoFetch', async () => {
        fetchDaemonStatus.mockResolvedValue(mockDaemonStatus);

        render(<TestComponent token={mockToken} autoFetch={true}/>);

        await waitFor(() => {
            expect(screen.getByTestId('nodes').textContent).toBe(
                JSON.stringify([
                    {nodename: 'node1', status: 'active'},
                    {nodename: 'node2', status: 'inactive'},
                ])
            );
        });

        expect(screen.getByTestId('clusterStats').textContent).toBe(
            JSON.stringify({nodeCount: 2})
        );
        expect(screen.getByTestId('clusterName').textContent).toBe('test-cluster');

        expect(fetchDaemonStatus).toHaveBeenCalledWith(mockToken);
    });

    test('handles cluster config without name', async () => {
        const mockDaemonStatusWithoutClusterName = {
            daemon: {status: 'running'},
            cluster: {
                config: {}, // No name property
                node: {
                    node1: {status: 'active'},
                },
            },
        };

        fetchDaemonStatus.mockResolvedValue(mockDaemonStatusWithoutClusterName);

        render(<TestComponent token={mockToken}/>);

        fireEvent.click(screen.getByTestId('fetchNodes'));

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });

        expect(screen.getByTestId('clusterName').textContent).toBe('Cluster');
        expect(screen.getByTestId('nodes').textContent).toBe(
            JSON.stringify([{nodename: 'node1', status: 'active'}])
        );
    });

    test('handles empty cluster nodes', async () => {
        const mockDaemonStatusEmptyNodes = {
            daemon: {status: 'running'},
            cluster: {
                config: {name: 'empty-cluster'},
                node: {}, // Empty nodes object
            },
        };

        fetchDaemonStatus.mockResolvedValue(mockDaemonStatusEmptyNodes);

        render(<TestComponent token={mockToken}/>);

        fireEvent.click(screen.getByTestId('fetchNodes'));

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });

        expect(screen.getByTestId('nodes').textContent).toBe('[]');
        expect(screen.getByTestId('clusterStats').textContent).toBe(
            JSON.stringify({nodeCount: 0})
        );
        expect(screen.getByTestId('clusterName').textContent).toBe('empty-cluster');
    });

    test('handles multiple sequential API calls', async () => {
        fetchDaemonStatus.mockResolvedValue(mockDaemonStatus);

        render(<TestComponentManual token={mockToken}/>);

        // First call
        fireEvent.click(screen.getByTestId('fetchNodes'));
        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });

        // Second call
        fireEvent.click(screen.getByTestId('fetchNodes'));
        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });

        expect(fetchDaemonStatus).toHaveBeenCalledTimes(2);
        expect(screen.getByTestId('nodes').textContent).toBe(
            JSON.stringify([
                {nodename: 'node1', status: 'active'},
                {nodename: 'node2', status: 'inactive'},
            ])
        );
    });

    test('handles error state and then successful call', async () => {
        // First call fails
        fetchDaemonStatus.mockRejectedValueOnce(new Error('First error'));
        // Second call succeeds
        fetchDaemonStatus.mockResolvedValueOnce(mockDaemonStatus);

        render(<TestComponentManual token={mockToken}/>);

        // First call - error
        fireEvent.click(screen.getByTestId('fetchNodes'));
        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });

        expect(screen.getByTestId('error').textContent).toBe(
            'Failed to retrieve daemon statuses.'
        );

        // Second call - success
        fireEvent.click(screen.getByTestId('fetchNodes'));
        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });

        expect(screen.getByTestId('error').textContent).toBe('');
        expect(screen.getByTestId('nodes').textContent).toBe(
            JSON.stringify([
                {nodename: 'node1', status: 'active'},
                {nodename: 'node2', status: 'inactive'},
            ])
        );
    });

    test('handles loading state transitions correctly', async () => {
        let resolvePromise;
        const promise = new Promise((resolve) => {
            resolvePromise = resolve;
        });
        fetchDaemonStatus.mockReturnValue(promise);

        render(<TestComponentManual token={mockToken}/>);

        // Start loading
        fireEvent.click(screen.getByTestId('fetchNodes'));

        // Should be loading immediately
        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('true');
        });

        // Resolve the promise
        await act(async () => {
            resolvePromise(mockDaemonStatus);
        });

        // Should not be loading after resolution
        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });
    });

    test('handles autoFetch without token', async () => {
        fetchDaemonStatus.mockResolvedValue(mockDaemonStatus);

        render(<TestComponent autoFetch={true} token={null}/>);

        // Wait a bit to ensure no API call is made
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(fetchDaemonStatus).not.toHaveBeenCalled();
        expect(screen.getByTestId('nodes').textContent).toBe('[]');
        expect(screen.getByTestId('error').textContent).toBe('');
    });

    test('handles complex node structures', async () => {
        const mockDaemonStatusComplex = {
            daemon: {status: 'running', version: '1.0.0'},
            cluster: {
                config: {name: 'complex-cluster', version: '2.0.0'},
                node: {
                    'node-1': {status: 'active', ip: '192.168.1.1', port: 8080},
                    'node-2': {status: 'inactive', ip: '192.168.1.2', port: 8081},
                    'node-3': {status: 'active', ip: '192.168.1.3', port: 8082, customField: 'value'},
                },
            },
        };

        fetchDaemonStatus.mockResolvedValue(mockDaemonStatusComplex);

        render(<TestComponent token={mockToken}/>);

        fireEvent.click(screen.getByTestId('fetchNodes'));

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });

        const expectedNodes = [
            {nodename: 'node-1', status: 'active', ip: '192.168.1.1', port: 8080},
            {nodename: 'node-2', status: 'inactive', ip: '192.168.1.2', port: 8081},
            {nodename: 'node-3', status: 'active', ip: '192.168.1.3', port: 8082, customField: 'value'},
        ];

        expect(screen.getByTestId('nodes').textContent).toBe(
            JSON.stringify(expectedNodes)
        );
        expect(screen.getByTestId('clusterStats').textContent).toBe(
            JSON.stringify({nodeCount: 3})
        );
        expect(screen.getByTestId('clusterName').textContent).toBe('complex-cluster');
    });

    test('resets error state on successful retry after failure', async () => {
        // First call fails
        fetchDaemonStatus.mockRejectedValueOnce(new Error('Initial failure'));
        // Second call succeeds
        fetchDaemonStatus.mockResolvedValueOnce(mockDaemonStatus);

        render(<TestComponentManual token={mockToken}/>);

        // First call - fails
        fireEvent.click(screen.getByTestId('fetchNodes'));
        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });

        expect(screen.getByTestId('error').textContent).toBe('Failed to retrieve daemon statuses.');

        // Second call - succeeds and should clear error
        fireEvent.click(screen.getByTestId('fetchNodes'));
        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });

        expect(screen.getByTestId('error').textContent).toBe('');
        expect(screen.getByTestId('nodes').textContent).not.toBe('[]');
    });

    test('should load cached data from localStorage on mount', () => {
        const cachedData = {
            nodes: [{nodename: 'cached-node', status: 'cached'}],
            daemon: {status: 'cached-running'},
            clusterStats: {nodeCount: 1},
            clusterName: 'cached-cluster'
        };

        localStorage.setItem('cachedNodes', JSON.stringify(cachedData.nodes));
        localStorage.setItem('cachedDaemon', JSON.stringify(cachedData.daemon));
        localStorage.setItem('cachedClusterStats', JSON.stringify(cachedData.clusterStats));
        localStorage.setItem('cachedClusterName', JSON.stringify(cachedData.clusterName));

        render(<TestComponent token={mockToken}/>);

        expect(screen.getByTestId('nodes').textContent).toBe(JSON.stringify(cachedData.nodes));
        expect(screen.getByTestId('daemon').textContent).toBe(JSON.stringify(cachedData.daemon));
        expect(screen.getByTestId('clusterStats').textContent).toBe(JSON.stringify(cachedData.clusterStats));
        expect(screen.getByTestId('clusterName').textContent).toBe(cachedData.clusterName);
    });

    test('should handle localStorage errors when loading cache', () => {
        const localStorageMock = {
            getItem: jest.fn().mockImplementation(() => {
                throw new Error('Storage error');
            }),
            setItem: jest.fn(),
            removeItem: jest.fn(),
            clear: jest.fn()
        };
        Object.defineProperty(window, 'localStorage', {value: localStorageMock});

        render(<TestComponent token={mockToken}/>);

        expect(console.warn).toHaveBeenCalledWith('Failed to load cached data:', expect.any(Error));

        // Restore original localStorage
        Object.defineProperty(window, 'localStorage', {value: localStorage});
    });

    test('should handle localStorage errors when caching data', async () => {
        fetchDaemonStatus.mockResolvedValue(mockDaemonStatus);

        const localStorageMock = {
            getItem: jest.fn(),
            setItem: jest.fn().mockImplementation(() => {
                throw new Error('Storage write error');
            }),
            removeItem: jest.fn(),
            clear: jest.fn()
        };
        Object.defineProperty(window, 'localStorage', {value: localStorageMock});

        render(<TestComponent token={mockToken}/>);

        fireEvent.click(screen.getByTestId('fetchNodes'));

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });

        expect(console.warn).toHaveBeenCalledWith('Failed to cache data:', expect.any(Error));

        // Restore original localStorage
        Object.defineProperty(window, 'localStorage', {value: localStorage});
    });

    test('should handle localStorage errors when clearing cache on API error', async () => {
        fetchDaemonStatus.mockRejectedValue(new Error('API error'));

        const localStorageMock = {
            getItem: jest.fn(),
            setItem: jest.fn(),
            removeItem: jest.fn().mockImplementation(() => {
                throw new Error('Storage remove error');
            }),
            clear: jest.fn()
        };
        Object.defineProperty(window, 'localStorage', {value: localStorageMock});

        render(<TestComponent token={mockToken}/>);

        fireEvent.click(screen.getByTestId('fetchNodes'));

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });

        expect(console.warn).toHaveBeenCalledWith('Failed to clear cache on error:', expect.any(Error));

        // Restore original localStorage
        Object.defineProperty(window, 'localStorage', {value: localStorage});
    });

    test('should not call API when token is empty', async () => {
        render(<TestComponentManual token=""/>);

        fireEvent.click(screen.getByTestId('fetchNodes'));

        await waitFor(() => {
            expect(screen.getByTestId('error').textContent).toBe('Token is required to fetch daemon status');
        });

        expect(fetchDaemonStatus).not.toHaveBeenCalled();
        expect(screen.getByTestId('loading').textContent).toBe('false');
    });
});
