import React from 'react';
import {render, screen, waitFor, fireEvent, act, within} from '@testing-library/react';
import {BrowserRouter} from 'react-router-dom';
import {vi} from 'vitest';
import NodesTable from '../NodesTable.jsx';
import i18n from '../../i18n';

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
                <span data-testid={`props-${props.nodename}`}>
                    {Object.keys(props).sort().join(',')}
                </span>
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
        expect(screen.getByRole('status')).toHaveTextContent('Loading nodes');
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    test('speaks French to a French browser', async () => {
        await i18n.changeLanguage('fr');
        try {
            renderWithRouter(<NodesTable/>);
            expect(await screen.findByRole('button', {name: 'Actions sur les nœuds sélectionnés'})).toBeInTheDocument();
            expect(screen.getByRole('columnheader', {name: 'Charge (15m)'})).toBeInTheDocument();
        } finally {
            await i18n.changeLanguage('en');
        }
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

        expect(checkboxes[0]).toBe(screen.getByRole('checkbox', {name: 'Select all nodes'}));
        fireEvent.click(checkboxes[0]);
        expect(checkboxes[0]).toBeChecked();
        expect(checkboxes[1]).toBeChecked();
        expect(checkboxes[2]).toBeChecked();
        expect(checkboxes[3]).toBeChecked();
        expect(actionsBtn).toBeEnabled();

        fireEvent.click(checkboxes[0]);
        expect(checkboxes[1]).not.toBeChecked();
        expect(actionsBtn).toBeDisabled();
    });

    describe('action execution', () => {
        test('opens confirmation dialog and cancels', async () => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Freeze'))[0]);
            await waitFor(() =>
                expect(screen.getByTestId('dialog-freeze')).toHaveTextContent('Confirm Freeze Action on node node-1')
            );
            fireEvent.click(screen.getByText('Cancel'));
            await waitFor(() => expect(screen.queryByTestId('dialog-freeze')).not.toBeInTheDocument());
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
            expect(await screen.findByRole('alert')).toHaveTextContent(/Authentication token not found/i);
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
            expect(screen.getByTestId('dialog-freeze')).toHaveTextContent('Confirm Freeze Action on 2 nodes');
            fireEvent.click(screen.getByRole('button', {name: 'Confirm'}));
            const alert = await screen.findByRole('alert');
            expect(alert).toHaveTextContent(/⚠️ 'Freeze' partially succeeded: 1 ok, 1 errors\./i);
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
                    expect.stringMatching(/\/daemon\/action\/restart$/),
                    expect.objectContaining({method: 'POST'})
                )
            );
        });

        test('correct URL for daemon stop via menu', async () => {
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
                    expect.stringMatching(/\/daemon\/action\/stop$/),
                    expect.any(Object)
                )
            );
        });

        test('correct URL for node-level freeze via menu', async () => {
            global.fetch = vi.fn().mockResolvedValue({ok: true});
            renderWithRouter(<NodesTable/>);
            const checkboxes = await screen.findAllByRole('checkbox');
            fireEvent.click(checkboxes[1]);
            const actionsBtn = screen.getByRole('button', {name: /actions on selected nodes/i});
            await waitFor(() => expect(actionsBtn).toBeEnabled());
            fireEvent.click(actionsBtn);
            fireEvent.click(await screen.findByRole('menuitem', {name: /^Freeze$/i}));
            fireEvent.click(screen.getByRole('button', {name: 'Confirm'}));
            await waitFor(() =>
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringMatching(/\/action\/freeze$/),
                    expect.any(Object)
                )
            );
        });

        test.each([
            ['Asset', /\/action\/push\/asset$/],
            ['Disk', /\/action\/push\/disk$/],
            ['Pkg', /\/action\/push\/pkg$/],
            ['Capabilities', /\/action\/scan\/capabilities$/],
            ['Sysreport', /\/action\/sysreport$/],
            ['Drain', /\/action\/drain$/],
            ['Abort', /\/action\/abort$/],
            ['Clear', /\/action\/clear$/],
            ['Dequeue', /\/action\/dequeue$/],
            ['Scsi Scan', /\/action\/scsi\/scan$/],
            ['Restart Daemon', /\/daemon\/action\/restart$/],
            ['Shutdown', /\/daemon\/action\/shutdown$/],
        ])('correct URL for %s', async (label, urlPattern) => {
            global.fetch = vi.fn().mockResolvedValue({ok: true});
            renderWithRouter(<NodesTable/>);
            const checkboxes = await screen.findAllByRole('checkbox');
            fireEvent.click(checkboxes[1]);
            const actionsBtn = screen.getByRole('button', {name: /actions on selected nodes/i});
            await waitFor(() => expect(actionsBtn).toBeEnabled());
            fireEvent.click(actionsBtn);
            fireEvent.click(await screen.findByRole('menuitem', {name: new RegExp(`^${label}$`, 'i')}));
            fireEvent.click(screen.getByRole('button', {name: 'Confirm'}));
            await waitFor(() =>
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringMatching(urlPattern),
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
            expect(successMsg.closest('[role="status"]')).not.toBeNull();
            const closeButtons = screen.getAllByRole('button', {name: 'Close'});
            const alertCloseButton = closeButtons.find(btn => btn.closest('[role="status"]'));
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
        test('passes each row its data and callbacks, the row menu being its own', async () => {
            renderWithRouter(<NodesTable/>);
            expect(await screen.findByTestId('props-node-1')).toHaveTextContent(
                'daemonNodename,isSelected,monitor,nodename,onAction,onOpenLogs,onSelect,stats,status'
            );
        });

        test('bulk menu lists every node action but the frozen-state ones that do not apply', async () => {
            renderWithRouter(<NodesTable/>);
            const checkboxes = await screen.findAllByRole('checkbox');
            fireEvent.click(checkboxes[1]);
            fireEvent.click(screen.getByRole('button', {name: /actions on selected nodes/i}));
            const menu = await screen.findByRole('menu', {name: 'Actions on selected nodes'});
            const names = within(menu).getAllByRole('menuitem').map((item) => item.textContent);
            expect(names).toContain('Freeze');
            expect(names).toContain('Restart daemon');
            expect(names).not.toContain('Unfreeze');
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
            fireEvent.keyDown(screen.getByRole('menu'), {key: 'Escape'});
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
            await waitFor(() => expect(screen.getByTestId('dialog-freeze')).toHaveTextContent('node node-1'));
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
            fireEvent.click(screen.getByRole('button', {name: header}));
            await waitFor(() => {
                const firstRow = screen.getAllByTestId(/row-/)[0];
                expect(firstRow).toHaveTextContent(expectedFirst);
            });
        });

        test('sort by name descending', async () => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click(screen.getByRole('button', {name: 'Name'}));
            await waitFor(() => {
                const rows = screen.getAllByTestId(/row-/);
                expect(rows[0]).toHaveTextContent('node-3');
                expect(rows[2]).toHaveTextContent('node-1');
            });
        });

        test('toggles direction on same column, resets on new column', async () => {
            renderWithRouter(<NodesTable/>);
            const header = (name) => screen.getByRole('columnheader', {name});
            expect(header('Name')).toHaveAttribute('aria-sort', 'ascending');
            expect(header('Score')).toHaveAttribute('aria-sort', 'none');
            fireEvent.click(screen.getByRole('button', {name: 'Name'}));
            await waitFor(() => expect(header('Name')).toHaveAttribute('aria-sort', 'descending'));
            fireEvent.click(screen.getByRole('button', {name: 'Name'}));
            await waitFor(() => expect(header('Name')).toHaveAttribute('aria-sort', 'ascending'));
            fireEvent.click(screen.getByRole('button', {name: 'Name'}));
            fireEvent.click(screen.getByRole('button', {name: 'Score'}));
            await waitFor(() => expect(header('Score')).toHaveAttribute('aria-sort', 'ascending'));
            expect(header('Name')).toHaveAttribute('aria-sort', 'none');
        });

        test('sort by booted_at', async () => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click(screen.getByRole('button', {name: 'Booted At'}));
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
            fireEvent.click(screen.getByRole('button', {name: 'Updated At'}));
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
            fireEvent.click(screen.getByRole('button', {name: 'Version'}));
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
            fireEvent.click(screen.getByRole('button', {name: 'Score'}));
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

        const logsPanel = () => screen.getByRole('dialog', {name: 'Node Logs'});

        test('opens and closes', async () => {
            renderWithRouter(<NodesTable/>);
            expect(screen.queryByTestId('logs-viewer')).not.toBeInTheDocument();
            expect(logsPanel()).toHaveAttribute('inert');
            fireEvent.click((await screen.findAllByText('Open Logs'))[0]);
            expect(logsPanel()).not.toHaveAttribute('inert');
            expect(within(logsPanel()).getByTestId('logs-viewer')).toHaveTextContent('Logs for node-1 (node), height: 100%');
            fireEvent.click(within(logsPanel()).getByRole('button', {name: 'Close'}));
            await waitFor(() => expect(screen.queryByTestId('logs-viewer')).not.toBeInTheDocument());
            expect(logsPanel()).toHaveAttribute('inert');
        });

        test('shows the logs of the node last asked for', async () => {
            renderWithRouter(<NodesTable/>);
            const buttons = await screen.findAllByText('Open Logs');
            fireEvent.click(buttons[0]);
            fireEvent.click(buttons[1]);
            expect(screen.getByTestId('logs-viewer')).toHaveTextContent('Logs for node-2');
        });

        test('stays open on a click beside it', async () => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Open Logs'))[0]);
            fireEvent.pointerDown(document.body);
            expect(screen.getByTestId('logs-viewer')).toBeInTheDocument();
        });

        test('is resizable from its left edge, by the keyboard', async () => {
            renderWithRouter(<NodesTable/>);
            expect(screen.queryByRole('separator', {name: 'Resize drawer'})).not.toBeInTheDocument();
            fireEvent.click((await screen.findAllByText('Open Logs'))[0]);
            const handle = screen.getByRole('separator', {name: 'Resize drawer'});
            const before = handle.getAttribute('aria-valuenow');
            fireEvent.keyDown(handle, {key: 'ArrowLeft'});
            await waitFor(() => expect(handle.getAttribute('aria-valuenow')).not.toBe(before));
            fireEvent.keyDown(handle, {key: 'Enter'});
            await waitFor(() => expect(handle.getAttribute('aria-valuenow')).toBe(before));
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

    test('renders the rows once data is there', () => {
        renderWithRouter(<NodesTable/>);
        expect(screen.getByText('node-1')).toBeInTheDocument();
        expect(screen.getByRole('table')).toBeInTheDocument();
    });
    describe('additional branch coverage', () => {
        test('bulk menu closes on a click outside', async () => {
            renderWithRouter(<NodesTable/>);
            const checkboxes = await screen.findAllByRole('checkbox');
            fireEvent.click(checkboxes[1]);
            const actionsBtn = screen.getByRole('button', {name: /actions on selected nodes/i});
            fireEvent.click(actionsBtn);
            expect(actionsBtn).toHaveAttribute('aria-expanded', 'true');
            expect(screen.getByRole('menu')).toBeInTheDocument();
            fireEvent.pointerDown(document.body);
            await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
            expect(actionsBtn).toHaveAttribute('aria-expanded', 'false');
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
            fireEvent.click(screen.getByRole('button', {name: header}));
            fireEvent.click(screen.getByRole('button', {name: header}));
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
            fireEvent.click(screen.getByRole('button', {name: 'Booted At'}));
            await waitFor(() => {
                const rows = screen.getAllByTestId(/row-/);
                expect(rows[0]).toHaveTextContent('node-3');
                expect(rows[1]).toHaveTextContent('node-1');
                expect(rows[2]).toHaveTextContent('node-2');
            });
        });

        test('sort by updated_at with missing updated_at', async () => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click(screen.getByRole('button', {name: 'Updated At'}));
            await waitFor(() => {
                const rows = screen.getAllByTestId(/row-/);
                expect(rows[0]).toHaveTextContent('node-3');
                expect(rows[1]).toHaveTextContent('node-2');
                expect(rows[2]).toHaveTextContent('node-1');
            });
        });
    });
});
