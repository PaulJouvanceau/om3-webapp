import React from 'react';
import {render, screen, fireEvent, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import NavBar from '../NavBar';

jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: jest.fn(),
    useLocation: jest.fn(),
}));
jest.mock('../../context/OidcAuthContext.tsx', () => ({useOidc: jest.fn()}));
jest.mock('../../context/AuthProvider.jsx', () => ({
    useAuth: jest.fn(),
    useAuthDispatch: jest.fn(),
    Logout: 'LOGOUT',
}));
jest.mock('@mui/material', () => ({
    ...jest.requireActual('@mui/material'),
    AppBar: jest.fn(({children}) => <div>{children}</div>),
    Toolbar: jest.fn(({children}) => <div>{children}</div>),
}));
jest.mock('../../hooks/useFetchDaemonStatus', () => ({
    __esModule: true,
    default: jest.fn(),
}));
jest.mock('../../hooks/useEventStore.js', () => ({__esModule: true, default: jest.fn()}));
jest.mock('../../hooks/useOnlineStatus', () => ({__esModule: true, default: jest.fn()}));
jest.mock('../../utils/logger.js', () => ({error: jest.fn()}));

const mockNavigate = jest.fn();
const mockAuthDispatch = jest.fn();
const mockFetchNodes = jest.fn();

function setupMocks(overrides = {}) {
    const {
        pathname = '/cluster',
        authChoice = 'local',
        authToken = 'test-token',
        clusterName = null,
        loading = false,
        daemon = null,
        fetchNodes = mockFetchNodes,
        online = true,
        eventStoreData = {objectStatus: {}, objectInstanceStatus: {}, instanceMonitor: {}},
        skipAuthMock = false,
    } = overrides;

    const {useNavigate, useLocation} = require('react-router-dom');
    useNavigate.mockReturnValue(mockNavigate);
    useLocation.mockReturnValue({pathname});

    if (!skipAuthMock) {
        require('../../context/AuthProvider.jsx').useAuth.mockReturnValue({authChoice, authToken});
    }
    require('../../context/AuthProvider.jsx').useAuthDispatch.mockReturnValue(mockAuthDispatch);
    require('../../context/OidcAuthContext.tsx').useOidc.mockReturnValue({
        userManager: {signoutRedirect: jest.fn(), removeUser: jest.fn()},
    });
    require('../../hooks/useFetchDaemonStatus').default.mockReturnValue({
        clusterName,
        fetchNodes,
        loading,
        daemon,
    });
    require('../../hooks/useOnlineStatus').default.mockReturnValue(online);
    require('../../hooks/useEventStore.js').default.mockImplementation((selector) =>
        selector(eventStoreData)
    );
    localStorage.clear();
}

function renderNavBar() {
    return render(
        <MemoryRouter>
            <NavBar/>
        </MemoryRouter>
    );
}

describe('NavBar', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupMocks();
    });

    // ---------- basic rendering ----------
    test('renders cluster breadcrumb and WhoAmI link on /cluster', () => {
        renderNavBar();
        expect(screen.getByRole('link', {name: /navigate to cluster/i})).toBeInTheDocument();
        expect(screen.getByRole('link', {name: /view user information/i})).toBeInTheDocument();
    });

    test('does not show breadcrumbs on /login', () => {
        setupMocks({pathname: '/login', authToken: null, fetchNodes: undefined});
        renderNavBar();
        expect(screen.queryByRole('link', {name: /navigate to/i})).not.toBeInTheDocument();
    });

    // ---------- breadcrumbs ----------
    describe('breadcrumbs', () => {
        const cases = [
            ['/cluster/node1/pod1', ['Cluster', 'node1', 'pod1']],
            ['/network/eth0', ['Cluster', 'network', 'eth0']],
            ['/network', ['Cluster', 'network']],
            ['/objects/vol1', ['Cluster', 'objects', 'vol1']],
            ['/objects', ['Cluster', 'objects']],
            ['/namespaces/ns1', ['Cluster', 'namespaces', 'ns1']],
            ['/namespaces/cluster/objects', ['Cluster', 'namespaces', 'objects']],
        ];
        test.each(cases)('path %s shows breadcrumbs %s', (pathname, expectedParts) => {
            setupMocks({pathname, authToken: null, fetchNodes: undefined});
            renderNavBar();
            expectedParts.forEach((part) => {
                expect(screen.getByRole('link', {name: new RegExp(`navigate to ${part}`, 'i')})).toBeInTheDocument();
            });
            if (expectedParts.length > 1) {
                expect(screen.getAllByText('>')).toHaveLength(expectedParts.length - 1);
            }
        });

        test('renders node as plain text (not link) for /nodes/.../objects path', () => {
            const pathname = '/nodes/node1/objects/myobj';
            setupMocks({pathname, authToken: null, fetchNodes: undefined});
            renderNavBar();

            expect(screen.getByRole('link', {name: /navigate to cluster/i})).toBeInTheDocument();
            expect(screen.getByRole('link', {name: /navigate to objects/i})).toBeInTheDocument();
            expect(screen.getByRole('link', {name: /navigate to myobj/i})).toBeInTheDocument();

            // node1 should appear as text, not a link
            expect(screen.getByText('node1')).toBeInTheDocument();
            expect(screen.queryByRole('link', {name: /navigate to node1/i})).not.toBeInTheDocument();

            // three separators: Cluster > objects > myobj > node1
            expect(screen.getAllByText('>')).toHaveLength(3);
        });
    });

    // ---------- fetchNodes behavior ----------
    describe('fetchNodes', () => {
        test('calls fetchNodes when token is present and clusterName is null', async () => {
            setupMocks({clusterName: null, fetchNodes: mockFetchNodes});
            renderNavBar();
            await waitFor(() => expect(mockFetchNodes).toHaveBeenCalledWith('test-token'));
        });

        test('does not call fetchNodes when token is absent', async () => {
            setupMocks({authToken: null, fetchNodes: mockFetchNodes});
            renderNavBar();
            expect(screen.getByRole('link', {name: /navigate to cluster/i})).toBeInTheDocument();
            expect(mockFetchNodes).not.toHaveBeenCalled();
        });

        test('retries when token appears later', async () => {
            let calls = 0;
            require('../../context/AuthProvider.jsx').useAuth.mockImplementation(() => ({
                authChoice: 'local',
                get authToken() {
                    calls++;
                    return calls === 1 ? null : 'delayed-token';
                },
            }));
            setupMocks({clusterName: null, fetchNodes: mockFetchNodes, skipAuthMock: true});
            jest.useFakeTimers();
            renderNavBar();
            jest.advanceTimersByTime(1000);
            await waitFor(() => expect(mockFetchNodes).toHaveBeenCalledWith('delayed-token'));
            jest.useRealTimers();
        });

        test('stops retrying after max attempts', async () => {
            setupMocks({authToken: null, fetchNodes: mockFetchNodes});
            jest.useFakeTimers();
            renderNavBar();
            jest.advanceTimersByTime(3000);
            await waitFor(() => expect(mockFetchNodes).not.toHaveBeenCalled());
            jest.useRealTimers();
        });

        test('handles fetchNodes errors', async () => {
            const errorFn = jest.fn().mockRejectedValue(new Error('fail'));
            setupMocks({fetchNodes: errorFn});
            renderNavBar();
            await waitFor(() => expect(errorFn).toHaveBeenCalled());
        });

        test('ignores fetchNodes if it is not a function', async () => {
            setupMocks({fetchNodes: null});
            renderNavBar();
            expect(screen.getByRole('link', {name: /view user information/i})).toBeInTheDocument();
        });

        test('shows cluster name after fetchNodes resolves', async () => {
            const fetchNodesMock = jest.fn().mockResolvedValue();
            setupMocks({fetchNodes: fetchNodesMock, clusterName: 'My Cluster', loading: false});
            renderNavBar();
            // Wait for the state update that sets storedClusterName and re-renders the breadcrumb
            await waitFor(() => {
                expect(screen.getByRole('link', {name: /navigate to my cluster/i})).toBeInTheDocument();
            });
        });
    });

    // ---------- object status counts ----------
    describe('object status counts', () => {
        const baseStore = {
            objectStatus: {},
            objectInstanceStatus: {},
            instanceMonitor: {},
        };

        test('counts from eventStore', () => {
            setupMocks({
                eventStoreData: {
                    ...baseStore,
                    objectStatus: {
                        obj1: {avail: 'down'},
                        obj2: {avail: 'warn'},
                        obj3: {avail: 'up'},
                        obj4: {avail: 'invalid'},
                    },
                },
            });
            renderNavBar();
            expect(screen.getByText('1', {selector: '[href="/objects?globalState=down"]'})).toBeInTheDocument();
            expect(screen.getByText('1', {selector: '[href="/objects?globalState=warn"]'})).toBeInTheDocument();
        });

        test('falls back to daemon when objectStatus is empty', () => {
            setupMocks({
                daemon: {cluster: {object: {o1: {avail: 'down'}, o2: {avail: 'warn'}}}},
            });
            renderNavBar();
            expect(screen.getByText('1', {selector: '[href="/objects?globalState=down"]'})).toBeInTheDocument();
            expect(screen.getByText('1', {selector: '[href="/objects?globalState=warn"]'})).toBeInTheDocument();
        });

        test('handles undefined objects and missing instance monitor', () => {
            setupMocks({
                eventStoreData: {
                    objectStatus: {obj1: undefined},
                    objectInstanceStatus: {obj1: {}},
                    instanceMonitor: {},
                },
            });
            renderNavBar();
            expect(screen.queryByText('1')).not.toBeInTheDocument();
        });

        test('displays only down when warn is zero', () => {
            setupMocks({eventStoreData: {...baseStore, objectStatus: {x: {avail: 'down'}}}});
            renderNavBar();
            expect(screen.getByText('1')).toHaveAttribute('href', '/objects?globalState=down');
            expect(screen.queryByText('1', {selector: '[href="/objects?globalState=warn"]'})).toBeNull();
        });

        test('tooltip on counts', async () => {
            setupMocks({eventStoreData: {...baseStore, objectStatus: {a: {avail: 'down'}, b: {avail: 'warn'}}}});
            renderNavBar();
            fireEvent.mouseOver(screen.getByText('1', {selector: '[href="/objects?globalState=down"]'}));
            await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Number of down objects'));
            fireEvent.mouseLeave(screen.getByText('1', {selector: '[href="/objects?globalState=down"]'}));
            fireEvent.mouseOver(screen.getByText('1', {selector: '[href="/objects?globalState=warn"]'}));
            await waitFor(() => expect(screen.getByRole('tooltip')).toHaveTextContent('Number of warn objects'));
        });

        test('correctly identifies status when instanceMonitor has global_expect', () => {
            setupMocks({
                eventStoreData: {
                    objectStatus: {obj1: {avail: 'down'}},
                    objectInstanceStatus: {
                        obj1: {node1: {avail: 'down'}, node2: {avail: 'up'}},
                    },
                    instanceMonitor: {
                        'node1:obj1': {global_expect: 'something'},
                        'node2:obj1': {global_expect: 'none'},
                    },
                },
            });
            renderNavBar();
            expect(screen.getByText('1', {selector: '[href="/objects?globalState=down"]'})).toBeInTheDocument();
        });
    });

    // ---------- menu ----------
    test('opens, selects and navigates from menu', async () => {
        setupMocks({pathname: '/namespaces'});
        renderNavBar();
        fireEvent.click(screen.getByLabelText(/open navigation menu/i));
        await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
        expect(screen.getByRole('menuitem', {name: /namespaces/i})).toHaveClass('Mui-selected');
        fireEvent.click(screen.getByRole('menuitem', {name: /heartbeats/i}));
        expect(mockNavigate).toHaveBeenCalledWith('/heartbeats');
        await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    });

    test('closes menu on Escape', async () => {
        renderNavBar();
        fireEvent.click(screen.getByLabelText(/open navigation menu/i));
        await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
        fireEvent.keyDown(screen.getByRole('menu'), {key: 'Escape'});
        await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    });

    // ---------- online status ----------
    test('shows offline when not online', () => {
        setupMocks({online: false});
        renderNavBar();
        expect(screen.getByText('Offline')).toBeInTheDocument();
    });

    test('does not show offline when online', () => {
        renderNavBar();
        expect(screen.queryByText('Offline')).not.toBeInTheDocument();
    });

    // ---------- WhoAmI link ----------
    test('WhoAmI button navigates to /whoami', () => {
        renderNavBar();
        expect(screen.getByRole('link', {name: /view user information/i})).toHaveAttribute('href', '/whoami');
    });
});
