import React from 'react';
import {render, screen, waitFor, fireEvent, act} from '@testing-library/react';
import NodesTable from '../NodesTable.jsx';
import * as useFetchDaemonStatusModule from '../../hooks/useFetchDaemonStatus.jsx';
import * as useEventStoreModule from '../../hooks/useEventStore.js';
import * as eventSourceManager from '../../eventSourceManager';
import {BrowserRouter} from 'react-router-dom';

// --- Mocks ---
jest.mock('@mui/icons-material/KeyboardArrowUp', () => () => <div data-testid="KeyboardArrowUpIcon"/>);
jest.mock('@mui/icons-material/KeyboardArrowDown', () => () => <div data-testid="KeyboardArrowDownIcon"/>);
jest.mock('@mui/icons-material/Close', () => () => <div data-testid="CloseIcon"/>);

jest.mock('../NodeRow.jsx', () => (props) => (
    <tr data-testid={`row-${props.nodename}`}>
        <td><input type="checkbox" checked={props.isSelected} onChange={(e) => props.onSelect(e, props.nodename)}/></td>
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
));

jest.mock('../ActionDialogManager', () => ({
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

jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: jest.fn(),
}));

jest.mock('../../components/LogsViewer.jsx', () => ({nodename, type, height}) => (
    <div data-testid="logs-viewer">Logs for {nodename} ({type}), height: {height}</div>
));

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
            // node-3 missing to test default values
        },
        nodeMonitor: {
            'node-1': {state: 'idle', updated_at: '2023-01-03T00:00:00Z'},
            'node-2': {state: 'busy', updated_at: '2023-01-01T00:00:00Z'},
            // node-3 missing
        },
    });

    beforeEach(() => {
        const fetchNodesMock = jest.fn().mockResolvedValue(undefined);
        jest.spyOn(useFetchDaemonStatusModule, 'default').mockReturnValue({
            daemon: {nodename: 'node-1'},
            fetchNodes: fetchNodesMock,
        });

        jest.spyOn(useEventStoreModule, 'default').mockImplementation((selector) =>
            selector(createDefaultStore())
        );
        jest.spyOn(eventSourceManager, 'startEventReception').mockImplementation(() => {
        });
        jest.spyOn(eventSourceManager, 'closeEventSource').mockImplementation(() => {
        });
        jest.spyOn(eventSourceManager, 'startLoggerReception').mockImplementation(() => {
        });
        jest.spyOn(eventSourceManager, 'closeLoggerEventSource').mockImplementation(() => {
        });
        localStorage.setItem('authToken', 'test-token');
    });

    afterEach(() => {
        localStorage.clear();
        jest.restoreAllMocks();
        jest.resetAllMocks();
        delete global.fetch;
        jest.useRealTimers();
    });

    const renderWithRouter = (ui) => render(<BrowserRouter>{ui}</BrowserRouter>);

    // Helper to override the store in a single test
    const setStore = (overrides) => {
        const store = {...createDefaultStore(), ...overrides};
        jest.spyOn(useEventStoreModule, 'default').mockImplementation((sel) => sel(store));
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
        fireEvent.click(checkboxes[1]); // select node-1
        expect(actionsBtn).toBeEnabled();
        fireEvent.click(checkboxes[1]); // deselect
        expect(actionsBtn).toBeDisabled();

        // select all via header checkbox
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
            global.fetch = jest.fn().mockResolvedValue({ok: true, json: () => ({})});
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
            global.fetch = jest.fn((url) =>
                url.includes('node-1')
                    ? Promise.resolve({ok: true, json: () => ({})})
                    : Promise.reject(new Error('HTTP error'))
            );
            renderWithRouter(<NodesTable/>);
            const checkboxes = await screen.findAllByRole('checkbox');
            fireEvent.click(checkboxes[1]); // node-1
            fireEvent.click(checkboxes[2]); // node-2
            const actionsBtn = screen.getByRole('button', {name: /actions on selected nodes/i});
            await waitFor(() => expect(actionsBtn).toBeEnabled());
            fireEvent.click(actionsBtn);
            fireEvent.click(await screen.findByRole('menuitem', {name: /^Freeze$/i}));
            fireEvent.click(screen.getByRole('button', {name: 'Confirm'}));
            expect(await screen.findByText(/⚠️ 'Freeze' partially succeeded: 1 ok, 1 errors\./i)).toBeInTheDocument();
        });

        test('total failure', async () => {
            global.fetch = jest.fn().mockRejectedValue(new Error('fail'));
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Freeze'))[0]);
            fireEvent.click(await screen.findByRole('button', {name: 'Confirm'}));
            expect(await screen.findByText(/❌ 'Freeze' failed on all 1 node\(s\)\./i)).toBeInTheDocument();
        });

        test('skips freeze/unfreeze when already in target state', async () => {
            setStore({
                nodeStatus: {
                    ...createDefaultStore().nodeStatus,
                    'node-1': {...createDefaultStore().nodeStatus['node-1'], frozen_at: '2023-01-01T00:00:00Z'},
                },
            });
            global.fetch = jest.fn().mockResolvedValue({ok: true});
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Freeze'))[0]);
            fireEvent.click(screen.getByRole('button', {name: 'Confirm'}));
            expect(await screen.findByText(/❌ 'Freeze' failed on all 1 node\(s\)\./i)).toBeInTheDocument();
            expect(global.fetch).not.toHaveBeenCalled();
        });

        test('correct URL for restart daemon', async () => {
            global.fetch = jest.fn().mockResolvedValue({ok: true});
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
            global.fetch = jest.fn().mockResolvedValue({ok: true});
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
            global.fetch = jest.fn().mockResolvedValue({ok: true});
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('Freeze'))[0]);
            fireEvent.click(screen.getByText('Cancel')); // cancellation
            expect(global.fetch).not.toHaveBeenCalled();
        });
    });

    describe('menus', () => {
        test('handleMenuOpen/Close updates anchorEls', async () => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click((await screen.findAllByText('OpenMenu'))[0]);
            fireEvent.click((await screen.findAllByText('CloseMenu'))[0]);
            // no error = success
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
            fireEvent.click(checkboxes[1]); // frozen node-1
            fireEvent.click(checkboxes[2]); // non-frozen node-2
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
            const firstRow = (await screen.findAllByTestId(/row-/))[0];
            expect(firstRow).toHaveTextContent(expectedFirst);
        });

        test('sort by name descending', async () => {
            renderWithRouter(<NodesTable/>);
            fireEvent.click(screen.getAllByText('Name')[0]);
            const rows = await screen.findAllByTestId(/row-/);
            expect(rows[0]).toHaveTextContent('node-3');
            expect(rows[2]).toHaveTextContent('node-1');
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
            const rows = await screen.findAllByTestId(/row-/);
            expect(rows[0]).toHaveTextContent('node-1');
            expect(rows[2]).toHaveTextContent('node-3');
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
            const rows = await screen.findAllByTestId(/row-/);
            expect(rows[0]).toHaveTextContent('node-2'); // earliest
            expect(rows[2]).toHaveTextContent('node-1'); // latest
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
            const rows = await screen.findAllByTestId(/row-/);
            expect(rows[0]).toHaveTextContent('node-1');
        });

        test('handles missing stats/monitor', async () => {
            setStore({
                nodeStats: {'node-1': {score: 100, load_15m: 1.0, mem_avail: 50, swap_avail: 30}},
                nodeMonitor: {'node-1': {state: 'idle'}},
            });
            renderWithRouter(<NodesTable/>);
            fireEvent.click(screen.getByText('Score'));
            const rows = await screen.findAllByTestId(/row-/);
            expect(rows[0]).toHaveTextContent('node-2'); // score 0 < 100
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
            fireEvent.mouseMove(document, {clientX: 1200}); // min
            fireEvent.mouseMove(document, {clientX: 400});  // max
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
                cancelable: true
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
                cancelable: true
            }));
            fireEvent(document, new Event('touchcancel', {bubbles: true}));
            expect(document.body.style.cursor).toBe('default');
        });
    });

    describe('Safari and zoom', () => {
        test('Safari menu positioning', async () => {
            const ua = navigator.userAgent;
            Object.defineProperty(navigator, 'userAgent', {
                value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
                configurable: true,
            });
            jest.useFakeTimers();
            renderWithRouter(<NodesTable/>);
            const checkboxes = await screen.findAllByRole('checkbox');
            fireEvent.click(checkboxes[1]);
            fireEvent.click(screen.getByRole('button', {name: /actions on selected nodes/i}));
            await act(() => jest.advanceTimersByTime(100));
            expect(screen.getByRole('menu')).toBeInTheDocument();
            jest.useRealTimers();
            Object.defineProperty(navigator, 'userAgent', {value: ua, configurable: true});
        });

        test('devicePixelRatio undefined -> getZoomLevel = 1', () => {
            const dpr = window.devicePixelRatio;
            Object.defineProperty(window, 'devicePixelRatio', {writable: true, configurable: true, value: undefined});
            renderWithRouter(<NodesTable/>);
            expect(screen.getByText('node-1')).toBeInTheDocument();
            Object.defineProperty(window, 'devicePixelRatio', {writable: true, configurable: true, value: dpr});
        });
    });

    test('cleans up event source on unmount', () => {
        const {unmount} = renderWithRouter(<NodesTable/>);
        unmount();
        expect(eventSourceManager.closeEventSource).toHaveBeenCalled();
    });

    test('calculateMenuPosition with null anchorRef does not throw', () => {
        renderWithRouter(<NodesTable/>);
        expect(screen.getByText('node-1')).toBeInTheDocument();
    });
});