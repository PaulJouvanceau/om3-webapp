import React from 'react';
import {render, screen, waitFor, fireEvent, act} from '@testing-library/react';
import {BrowserRouter} from 'react-router-dom';
import {vi} from 'vitest';
import NodesTable from '../NodesTable.jsx';

// ── Hoisted mock variables ────────────────────────────────────────────────
const {
    mockUseFetchDaemonStatus,
    mockUseEventStore,
    mockStartEventReception,
    mockCloseEventSource,
    mockStartLoggerReception,
    mockCloseLoggerEventSource,
    mockNavigate,
    mockLogger,
} = vi.hoisted(() => ({
    mockUseFetchDaemonStatus: vi.fn(),
    mockUseEventStore: vi.fn(),
    mockStartEventReception: vi.fn(),
    mockCloseEventSource: vi.fn(),
    mockStartLoggerReception: vi.fn(),
    mockCloseLoggerEventSource: vi.fn(),
    mockNavigate: vi.fn(),
    mockLogger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock('@mui/icons-material/KeyboardArrowUp', () => ({
    default: () => <div data-testid="KeyboardArrowUpIcon"/>,
}));
vi.mock('@mui/icons-material/KeyboardArrowDown', () => ({
    default: () => <div data-testid="KeyboardArrowDownIcon"/>,
}));
vi.mock('@mui/icons-material/Close', () => ({
    default: () => <div data-testid="CloseIcon"/>,
}));

vi.mock('../NodeRow.jsx', () => ({
    default: (props) => (
        <tr data-testid={`row-${props.nodename}`}>
            <td><input type="checkbox" checked={props.isSelected} onChange={(e) => props.onSelect(e, props.nodename)}/>
            </td>
            <td>{props.nodename}</td>
            <td>{props.monitor?.state || 'idle'}</td>
            <td>{props.stats?.score || 0}</td>
            <td>{props.stats?.load_15m || 0}</td>
            <td>{props.stats?.mem_avail || 0}</td>
            <td>{props.stats?.swap_avail || 0}</td>
            <td>{props.status?.agent || ''}</td>
            <td>
                <button onClick={() => props.onAction(props.nodename, 'freeze')}>Freeze</button>
                <button onClick={() => props.onAction(props.nodename, 'unfreeze')}>Unfreeze</button>
                <button onClick={() => props.onAction(props.nodename, 'restart daemon')}>Restart Daemon</button>
                <button onClick={(e) => props.onMenuOpen(e, props.nodename)}>OpenMenu</button>
                <button onClick={() => props.onMenuClose(props.nodename)}>CloseMenu</button>
            </td>
            <td>
                <button onClick={() => props.onOpenLogs(props.nodename)}>Open Logs</button>
            </td>
        </tr>
    ),
}));

vi.mock('../ActionDialogManager', () => ({
    __esModule: true,
    default: ({pendingAction, handleConfirm, target, onClose}) => {
        if (!pendingAction) return null;
        const action = pendingAction.action;
        const actionTitle = action.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        return (
            <div role="dialog" data-testid={`dialog-${action}`}>
                <h2>Confirm {actionTitle} Action on {target}</h2>
                <button onClick={() => handleConfirm(action)} aria-label="Confirm">Confirm</button>
                <button onClick={onClose}>Cancel</button>
            </div>
        );
    },
}));

vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

vi.mock('../../components/LogsViewer.jsx', () => ({
    default: ({nodename, type, height}) => (
        <div data-testid="logs-viewer">Logs for {nodename} ({type}), height: {height}</div>
    ),
}));

vi.mock('../../hooks/useFetchDaemonStatus.jsx', () => ({
    default: mockUseFetchDaemonStatus,
}));

vi.mock('../../hooks/useEventStore.js', () => ({
    default: mockUseEventStore,
}));

vi.mock('../../eventSourceManager', () => ({
    startEventReception: mockStartEventReception,
    closeEventSource: mockCloseEventSource,
    startLoggerReception: mockStartLoggerReception,
    closeLoggerEventSource: mockCloseLoggerEventSource,
}));

vi.mock('../../utils/logger', () => ({
    default: mockLogger,
}));

describe('NodesTable', () => {
    const createDefaultStore = () => ({
        nodeStatus: {
            'node-1': {state: 'idle', frozen_at: null, agent: 'v1.0', booted_at: '2023-01-01T00:00:00Z'},
            'node-2': {state: 'busy', frozen_at: null, agent: 'v2.0', booted_at: '2023-01-02T00:00:00Z'},
            'node-3': {state: 'idle', frozen_at: null, agent: 'v3.0', booted_at: '2023-01-03T00:00:00Z'},
        },
        nodeStats: {
            'node-1': {score: 42, load_15m: 1.5, mem_avail: 1000, swap_avail: 500},
            'node-2': {score: 18, load_15m: 2.0, mem_avail: 2000, swap_avail: 1000},
        },
        nodeMonitor: {
            'node-1': {state: 'idle', updated_at: '2023-01-03T00:00:00Z'},
            'node-2': {state: 'busy', updated_at: '2023-01-01T00:00:00Z'},
        },
    });

    const originalUserAgent = navigator.userAgent;
    const originalDevicePixelRatio = window.devicePixelRatio;

    beforeEach(() => {
        const fetchNodesMock = vi.fn().mockResolvedValue(undefined);
        mockUseFetchDaemonStatus.mockReturnValue({
            daemon: {nodename: 'node-1'},
            fetchNodes: fetchNodesMock,
        });

        mockUseEventStore.mockImplementation((selector) =>
            selector(createDefaultStore())
        );

        mockStartEventReception.mockImplementation(() => {
        });
        mockCloseEventSource.mockImplementation(() => {
        });
        mockStartLoggerReception.mockImplementation(() => {
        });
        mockCloseLoggerEventSource.mockImplementation(() => {
        });

        localStorage.setItem('authToken', 'test-token');
        vi.clearAllMocks();
    });

    afterEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
        vi.resetAllMocks();
        delete global.fetch;
        vi.useRealTimers();

        Object.defineProperty(navigator, 'userAgent', {
            value: originalUserAgent,
            configurable: true,
        });
        Object.defineProperty(window, 'devicePixelRatio', {
            value: originalDevicePixelRatio,
            configurable: true,
        });
    });

    const renderWithRouter = (ui) => render(<BrowserRouter>{ui}</BrowserRouter>);

    const setStore = (overrides) => {
        const store = {...createDefaultStore(), ...overrides};
        mockUseEventStore.mockImplementation((sel) => sel(store));
        return store;
    };

    test('shows loader when no data, then renders rows', async () => {
        setStore({nodeStatus: {}, nodeStats: {}, nodeMonitor: {}});
        renderWithRouter(<NodesTable/>);
        expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    test('renders all node names', async () => {
        renderWithRouter(<NodesTable/>);
        expect(await screen.findByText('node-1')).toBeInTheDocument();
        expect(screen.getByText('node-2')).toBeInTheDocument();
        expect(screen.getByText('node-3')).toBeInTheDocument();
    });

    test('enables/disables button based on selection', async () => {
        renderWithRouter(<NodesTable/>);
        const checkboxes = await screen.findAllByRole('checkbox');
        const actionsBtn = screen.getByRole('button', {name: /actions on selected nodes/i});

        expect(actionsBtn).toBeDisabled();
        fireEvent.click(checkboxes[1]);
        expect(actionsBtn).toBeEnabled();
        fireEvent.click(checkboxes[1]);
        expect(actionsBtn).toBeDisabled();

        fireEvent.click(checkboxes[0]);
        expect(checkboxes[1]).toBeChecked();
        expect(checkboxes[2]).toBeChecked();
        expect(checkboxes[3]).toBeChecked();
        expect(actionsBtn).toBeEnabled();
    });

    describe('action execution', () => {
        test('opens confirmation dialog and cancels', async () => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Freeze'))[0]);
            await waitFor(() =>
                expect(screen.getByRole('dialog')).toHaveTextContent('Confirm Freeze Action on node node-1')
            );
            fireEvent.click(screen.getByText('Cancel'));
            await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        });

        test('successful single-node action', async () => {
            global.fetch = vi.fn().mockResolvedValue({ok: true, json: () => ({})});
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Freeze'))[0]);
            fireEvent.click(await screen.findByRole('button', {name: 'Confirm'}));
            expect(await screen.findByText(/✅ 'Freeze' succeeded on 1 node\(s\)\./i)).toBeInTheDocument();
        });

        test('shows error if token missing', async () => {
            localStorage.removeItem('authToken');
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Freeze'))[0]);
            fireEvent.click(await screen.findByRole('button', {name: 'Confirm'}));
            expect(await screen.findByText(/Authentication token not found/i)).toBeInTheDocument();
        });

        test('partial success', async () => {
            global.fetch = vi.fn((url) =>
                url.includes('node-1')
                    ? Promise.resolve({ok: true, json: () => ({})})
                    : Promise.reject(new Error('HTTP error'))
            );
            renderWithRouter(<NodesTable/>);
            const checkboxes = await screen.findAllByRole('checkbox');
            fireEvent.click(checkboxes[1]);
            fireEvent.click(checkboxes[2]);
            const actionsBtn = screen.getByRole('button', {name: /actions on selected nodes/i});
            await waitFor(() => expect(actionsBtn).toBeEnabled());
            fireEvent.click(actionsBtn);
            fireEvent.click(await screen.findByRole('menuitem', {name: /^Freeze$/i}));
            fireEvent.click(screen.getByRole('button', {name: 'Confirm'}));
            expect(await screen.findByText(/⚠️ 'Freeze' partially succeeded: 1 ok, 1 errors\./i)).toBeInTheDocument();
        });

        test('total failure', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('fail'));
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Freeze'))[0]);
            fireEvent.click(await screen.findByRole('button', {name: 'Confirm'}));
            expect(await screen.findByText(/❌ 'Freeze' failed on all 1 node\(s\)\./i)).toBeInTheDocument();
        });

        test('skips freeze when node already frozen', async () => {
            setStore({
                nodeStatus: {
                    ...createDefaultStore().nodeStatus,
                    'node-1': {...createDefaultStore().nodeStatus['node-1'], frozen_at: '2023-01-01T00:00:00Z'},
                },
            });
            global.fetch = vi.fn().mockResolvedValue({ok: true});
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Freeze'))[0]);
            fireEvent.click(screen.getByRole('button', {name: 'Confirm'}));
            expect(await screen.findByText(/❌ 'Freeze' failed on all 1 node\(s\)\./i)).toBeInTheDocument();
            expect(global.fetch).not.toHaveBeenCalled();
        });

        test('skips unfreeze when node not frozen', async () => {
            setStore({
                nodeStatus: {
                    ...createDefaultStore().nodeStatus,
                    'node-1': {...createDefaultStore().nodeStatus['node-1'], frozen_at: null},
                },
            });
            global.fetch = vi.fn().mockResolvedValue({ok: true});
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Unfreeze'))[0]);
            fireEvent.click(screen.getByRole('button', {name: 'Confirm'}));
            expect(await screen.findByText(/❌ 'Unfreeze' failed on all 1 node\(s\)\./i)).toBeInTheDocument();
            expect(global.fetch).not.toHaveBeenCalled();
        });

        test('handles HTTP error response', async () => {
            global.fetch = vi.fn().mockResolvedValue({ok: false, status: 500});
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Freeze'))[0]);
            fireEvent.click(await screen.findByRole('button', {name: 'Confirm'}));
            await waitFor(() => {
                expect(mockLogger.error).toHaveBeenCalledWith(
                    expect.stringContaining('Failed to execute freeze on node-1: HTTP error! status: 500')
                );
            });
            expect(await screen.findByText(/❌ 'Freeze' failed on all 1 node\(s\)\./i)).toBeInTheDocument();
        });

        test('correct URL for restart daemon', async () => {
            global.fetch = vi.fn().mockResolvedValue({ok: true});
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Restart Daemon'))[0]);
            fireEvent.click(await screen.findByRole('button', {name: 'Confirm'}));
            await waitFor(() =>
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringContaining('/daemon/action/restart'),
                    expect.objectContaining({method: 'POST'})
                )
            );
        });

        test('correct URL for standard action via menu', async () => {
            global.fetch = vi.fn().mockResolvedValue({ok: true});
            renderWithRouter(<NodesTable/>);
            const checkboxes = await screen.findAllByRole('checkbox');
            fireEvent.click(checkboxes[1]);
            const actionsBtn = screen.getByRole('button', {name: /actions on selected nodes/i});
            await waitFor(() => expect(actionsBtn).toBeEnabled());
            fireEvent.click(actionsBtn);
            fireEvent.click(await screen.findByRole('menuitem', {name: /^Stop$/i}));
            fireEvent.click(screen.getByRole('button', {name: 'Confirm'}));
            await waitFor(() =>
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringContaining('/action/stop'),
                    expect.any(Object)
                )
            );
        });

        test('handleDialogConfirm with null pendingAction does nothing', async () => {
            global.fetch = vi.fn().mockResolvedValue({ok: true});
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Freeze'))[0]);
            fireEvent.click(screen.getByText('Cancel'));
            expect(global.fetch).not.toHaveBeenCalled();
        });

        test('snackbar onClose triggered by user click', async () => {
            global.fetch = vi.fn().mockResolvedValue({ok: true});
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Freeze'))[0]);
            fireEvent.click(await screen.findByRole('button', {name: 'Confirm'}));
            const successMsg = await screen.findByText(/✅ 'Freeze' succeeded on 1 node\(s\)\./i);
            expect(successMsg).toBeInTheDocument();
            const closeButtons = screen.getAllByRole('button', {name: 'Close'});
            const alertCloseButton = closeButtons.find(btn => btn.closest('[role="alert"]'));
            expect(alertCloseButton).toBeDefined();
            fireEvent.click(alertCloseButton);
            await waitFor(() => {
                expect(screen.queryByText(/✅ 'Freeze' succeeded on 1 node\(s\)\./i)).not.toBeInTheDocument();
            });
        });

        test('snackbar autoHide triggers onClose', async () => {
            vi.useFakeTimers();
            global.fetch = vi.fn().mockResolvedValue({ok: true});
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Freeze'))[0]);
            fireEvent.click(await screen.findByRole('button', {name: 'Confirm'}));
            await screen.findByText(/✅ 'Freeze' succeeded on 1 node\(s\)\./i);
            act(() => {
                vi.advanceTimersByTime(5000);
            });
            await waitFor(() => {
                expect(screen.queryByText(/✅ 'Freeze' succeeded on 1 node\(s\)\./i)).not.toBeInTheDocument();
            });
            vi.useRealTimers();
        });
    });

    describe('menus', () => {
        test('handleMenuOpen/Close updates anchorEls', async () => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('OpenMenu'))[0]);
            fireEvent.click((await screen.findAllByText('CloseMenu'))[0]);
        });

        test('filters based on frozen/unfrozen state and closes via Escape', async () => {
            setStore({
                nodeStatus: {
                    ...createDefaultStore().nodeStatus,
                    'node-1': {...createDefaultStore().nodeStatus['node-1'], frozen_at: '2023-01-01T00:00:00Z'},
                },
            });
            renderWithRouter(<NodesTable/>);
            const checkboxes = await screen.findAllByRole('checkbox');
            fireEvent.click(checkboxes[1]);
            fireEvent.click(checkboxes[2]);
            fireEvent.click(screen.getByRole('button', {name: /actions on selected nodes/i}));
            await waitFor(() => {
                expect(screen.getByRole('menuitem', {name: /^Unfreeze$/i})).toBeInTheDocument();
                expect(screen.getByRole('menuitem', {name: /^Freeze$/i})).toBeInTheDocument();
            });
            fireEvent.keyDown(screen.getByRole('presentation'), {key: 'Escape'});
            await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
        });

        test('empty menu when no nodes selected', async () => {
            renderWithRouter(<NodesTable/>);
            const actionsBtn = screen.getByRole('button', {name: /actions on selected nodes/i});
            expect(actionsBtn).toBeDisabled();
            fireEvent.click(actionsBtn);
            await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
        });

        test('handleAction without nodename closes actions menu', async () => {
            renderWithRouter(<NodesTable/>);
            const checkboxes = await screen.findAllByRole('checkbox');
            fireEvent.click(checkboxes[1]);
            fireEvent.click(screen.getByRole('button', {name: /actions on selected nodes/i}));
            await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
            fireEvent.click(screen.getByRole('menuitem', {name: /^Freeze$/i}));
            await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
        });

        test('handleAction with nodename closes node menu', async () => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Freeze'))[0]);
            await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
        });
    });

    describe('sorting', () => {
        test.each([
            ['State', /node-2/],
            ['Score', /node-3/],
            ['Load (15m)', /node-3/],
            ['Mem Avail', /node-3/],
            ['Swap Avail', /node-3/],
            ['Version', /node-1/],
        ])('ascending sort by %s', async (header, expectedFirst) => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click(screen.getByText(header));
            await waitFor(() => {
                const firstRow = screen.getAllByTestId(/row-/)[0];
                expect(firstRow).toHaveTextContent(expectedFirst);
            });
        });

        test('sort by name descending', async () => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click(screen.getAllByText('Name')[0]);
            await waitFor(() => {
                const rows = screen.getAllByTestId(/row-/);
                expect(rows[0]).toHaveTextContent('node-3');
                expect(rows[2]).toHaveTextContent('node-1');
            });
        });

        test('toggles direction on same column, resets on new column', async () => {
            renderWithRouter(<NodesTable/>);
            expect(screen.getByTestId('KeyboardArrowUpIcon')).toBeInTheDocument();
            fireEvent.click(screen.getAllByText('Name')[0]);
            await waitFor(() => expect(screen.getByTestId('KeyboardArrowDownIcon')).toBeInTheDocument());
            fireEvent.click(screen.getAllByText('Name')[0]);
            await waitFor(() => expect(screen.getByTestId('KeyboardArrowUpIcon')).toBeInTheDocument());
            fireEvent.click(screen.getByText('Score'));
            await waitFor(() => expect(screen.getByTestId('KeyboardArrowUpIcon')).toBeInTheDocument());
        });

        test('sort by booted_at', async () => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click(screen.getByText('Booted At'));
            await waitFor(() => {
                const rows = screen.getAllByTestId(/row-/);
                expect(rows[0]).toHaveTextContent('node-1');
                expect(rows[2]).toHaveTextContent('node-3');
            });
        });

        test('sort by updated_at', async () => {
            setStore({
                nodeMonitor: {
                    'node-1': {state: 'idle', updated_at: '2023-01-03T00:00:00Z'},
                    'node-2': {state: 'busy', updated_at: '2023-01-01T00:00:00Z'},
                    'node-3': {state: 'idle', updated_at: '2023-01-02T00:00:00Z'},
                },
            });
            renderWithRouter(<NodesTable/>);
            fireEvent.click(screen.getByText('Updated At'));
            await waitFor(() => {
                const rows = screen.getAllByTestId(/row-/);
                expect(rows[0]).toHaveTextContent('node-2');
                expect(rows[2]).toHaveTextContent('node-1');
            });
        });

        test('sort by version with empty strings', async () => {
            setStore({
                nodeStatus: {
                    ...createDefaultStore().nodeStatus,
                    'node-1': {...createDefaultStore().nodeStatus['node-1'], agent: ''},
                },
            });
            renderWithRouter(<NodesTable/>);
            fireEvent.click(screen.getByText('Version'));
            await waitFor(() => {
                const rows = screen.getAllByTestId(/row-/);
                expect(rows[0]).toHaveTextContent('node-1');
            });
        });

        test('handles missing stats/monitor', async () => {
            setStore({
                nodeStats: {'node-1': {score: 100, load_15m: 1.0, mem_avail: 50, swap_avail: 30}},
                nodeMonitor: {'node-1': {state: 'idle'}},
            });
            renderWithRouter(<NodesTable/>);
            fireEvent.click(screen.getByText('Score'));
            await waitFor(() => {
                const rows = screen.getAllByTestId(/row-/);
                expect(rows[0]).toHaveTextContent('node-2');
            });
        });
    });

    describe('logs drawer', () => {
        beforeEach(() => {
            Object.defineProperty(window, 'innerWidth', {writable: true, configurable: true, value: 1000});
        });

        test('opens and closes', async () => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Open Logs'))[0]);
            expect(screen.getByTestId('logs-viewer')).toBeInTheDocument();
            fireEvent.click(screen.getAllByTestId('CloseIcon')[0]);
            await waitFor(() => expect(screen.queryByTestId('logs-viewer')).not.toBeInTheDocument());
        });

        test('resizes with mouse', async () => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Open Logs'))[0]);
            const handle = screen.getByLabelText('Resize drawer');
            fireEvent.mouseDown(handle, {clientX: 800});
            fireEvent.mouseMove(document, {clientX: 750});
            fireEvent.mouseMove(document, {clientX: 1200});
            fireEvent.mouseMove(document, {clientX: 400});
            fireEvent.mouseUp(document);
            expect(document.body.style.cursor).toBe('default');
        });

        test('resizes with touch events', async () => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Open Logs'))[0]);
            const handle = screen.getByLabelText('Resize drawer');
            fireEvent(handle, new TouchEvent('touchstart', {
                touches: [{clientX: 800}],
                bubbles: true,
                cancelable: true,
            }));
            fireEvent(document, new TouchEvent('touchmove', {touches: [{clientX: 700}], bubbles: true}));
            fireEvent(document, new Event('touchend', {bubbles: true}));
            expect(document.body.style.cursor).toBe('default');
        });

        test('touch cancel stops resizing', async () => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Open Logs'))[0]);
            const handle = screen.getByLabelText('Resize drawer');
            fireEvent(handle, new TouchEvent('touchstart', {
                touches: [{clientX: 800}],
                bubbles: true,
                cancelable: true,
            }));
            fireEvent(document, new Event('touchcancel', {bubbles: true}));
            expect(document.body.style.cursor).toBe('default');
        });
    });

    describe('fetch nodes failure', () => {
        test('logs error when fetchNodes rejects', async () => {
            const error = new Error('Network error');
            const fetchNodesMock = vi.fn().mockRejectedValue(error);
            mockUseFetchDaemonStatus.mockReturnValue({
                daemon: {nodename: 'node-1'},
                fetchNodes: fetchNodesMock,
            });
            renderWithRouter(<NodesTable/>);
            await waitFor(() => {
                expect(mockLogger.error).toHaveBeenCalledWith('Failed to fetch nodes:', error);
            });
        });
    });

    test('cleans up event source on unmount', () => {
        const {unmount} = renderWithRouter(<NodesTable/>);
        unmount();
        expect(mockCloseEventSource).toHaveBeenCalled();
    });

    test('calculateMenuPosition with null anchorRef does not throw', () => {
        renderWithRouter(<NodesTable/>);
        expect(screen.getByText('node-1')).toBeInTheDocument();
    });

    describe('additional branch coverage', () => {
        test('calculateMenuPosition with valid anchorRef (Safari)', async () => {
            const origGetRect = Element.prototype.getBoundingClientRect;
            const origScrollY = window.scrollY;
            const origScrollX = window.scrollX;
            const origDevicePixelRatio = window.devicePixelRatio;
            const origUserAgent = navigator.userAgent;

            Object.defineProperty(navigator, 'userAgent', {
                value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.4 Safari/605.1.15',
                configurable: true,
            });
            Object.defineProperty(window, 'devicePixelRatio', {
                value: 2,
                configurable: true,
            });
            Element.prototype.getBoundingClientRect = vi.fn(() => ({
                bottom: 100,
                right: 200,
                top: 50,
                left: 150,
                width: 50,
                height: 30,
            }));
            Object.defineProperty(window, 'scrollY', {value: 20, writable: true, configurable: true});
            Object.defineProperty(window, 'scrollX', {value: 10, writable: true, configurable: true});

            vi.resetModules();
            const {default: NodesTableSafari} = await import('../NodesTable.jsx');

            renderWithRouter(<NodesTableSafari/>);

            const checkboxes = await screen.findAllByRole('checkbox');
            fireEvent.click(checkboxes[1]);
            const actionsBtn = screen.getByRole('button', {name: /actions on selected nodes/i});
            await waitFor(() => expect(actionsBtn).toBeEnabled());
            fireEvent.click(actionsBtn);

            await act(async () => {
                await new Promise(resolve => setTimeout(resolve, 20));
            });

            expect(screen.getByRole('menu')).toBeInTheDocument();

            Element.prototype.getBoundingClientRect = origGetRect;
            Object.defineProperty(window, 'scrollY', {value: origScrollY, writable: true, configurable: true});
            Object.defineProperty(window, 'scrollX', {value: origScrollX, writable: true, configurable: true});
            Object.defineProperty(navigator, 'userAgent', {value: origUserAgent, configurable: true});
            Object.defineProperty(window, 'devicePixelRatio', {value: origDevicePixelRatio, configurable: true});
        });

        test.each([
            ['State', 'node-1', 'node-2'],
            ['Score', 'node-1', 'node-3'],
            ['Load (15m)', 'node-2', 'node-3'],
            ['Mem Avail', 'node-2', 'node-3'],
            ['Swap Avail', 'node-2', 'node-3'],
            ['Version', 'node-3', 'node-1'],
            ['Booted At', 'node-3', 'node-1'],
            ['Updated At', 'node-1', 'node-3'],
        ])('descending sort by %s', async (header, expectedFirst, expectedLast) => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click(screen.getByText(header));
            fireEvent.click(screen.getByText(header));
            await waitFor(() => {
                const rows = screen.getAllByTestId(/row-/);
                expect(rows[0]).toHaveTextContent(expectedFirst);
                expect(rows[2]).toHaveTextContent(expectedLast);
            });
        });

        test('sort by booted_at with missing booted_at', async () => {
            setStore({
                nodeStatus: {
                    'node-1': {state: 'idle', frozen_at: null, agent: 'v1.0', booted_at: '2023-01-01T00:00:00Z'},
                    'node-2': {state: 'busy', frozen_at: null, agent: 'v2.0', booted_at: '2023-01-02T00:00:00Z'},
                    'node-3': {state: 'idle', frozen_at: null, agent: 'v3.0'},
                },
                nodeStats: {},
                nodeMonitor: {},
            });
            renderWithRouter(<NodesTable/>);
            fireEvent.click(screen.getByText('Booted At'));
            await waitFor(() => {
                const rows = screen.getAllByTestId(/row-/);
                expect(rows[0]).toHaveTextContent('node-3');
                expect(rows[1]).toHaveTextContent('node-1');
                expect(rows[2]).toHaveTextContent('node-2');
            });
        });

        test('sort by updated_at with missing updated_at', async () => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click(screen.getByText('Updated At'));
            await waitFor(() => {
                const rows = screen.getAllByTestId(/row-/);
                expect(rows[0]).toHaveTextContent('node-3');
                expect(rows[1]).toHaveTextContent('node-2');
                expect(rows[2]).toHaveTextContent('node-1');
            });
        });
    });
});
