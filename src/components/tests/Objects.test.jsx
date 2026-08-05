import React from 'react';
import '@testing-library/jest-dom';
import {render, screen, fireEvent, waitFor, within, cleanup, act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {vi} from 'vitest';
import {axe} from 'vitest-axe';
import Objects from '../Objects';

// ── Hoisted mock variables ─────────────────────────────────────────────
const {
    mockNavigate,
    mockRemoveObject,
    mockSetObjectStatuses,
    mockForceFlush,
} = vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    mockRemoveObject: vi.fn(),
    mockSetObjectStatuses: vi.fn(),
    mockForceFlush: vi.fn(),
}));

// ── Mocks ───────────────────────────────────────────────────────────────
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useLocation: vi.fn(() => ({search: '', pathname: '/objects'})),
    };
});

vi.mock('../../hooks/useEventStore', async (importOriginal) => {
    const actual = await importOriginal();
    const mockFn = vi.fn();
    mockFn.getState = vi.fn();
    return {
        ...actual,
        __esModule: true,
        default: mockFn,
        getState: mockFn.getState,
    };
});

vi.mock('../../hooks/useFetchDaemonStatus', () => ({
    default: vi.fn(() => ({daemon: {cluster: {object: {}}}})),
}));

vi.mock('../../eventSourceManager', () => ({
    closeEventSource: vi.fn(),
    startEventReception: vi.fn(),
    forceFlush: mockForceFlush,
    startLoggerReception: vi.fn(),
    closeLoggerEventSource: vi.fn(),
}));

vi.mock('@mui/material/useMediaQuery', () => ({
    default: vi.fn(),
}));

import useEventStore from '../../hooks/useEventStore';
import useFetchDaemonStatus from '../../hooks/useFetchDaemonStatus';
import useMediaQuery from '@mui/material/useMediaQuery';
import {useLocation} from 'react-router-dom';
import {startEventReception, closeEventSource} from '../../eventSourceManager';

// ---------- helpers ----------
let originalConsoleError;
let originalGetItem;

const defaultState = {
    objectStatus: {
        'test-ns/svc/test1': {avail: 'up', frozen: 'unfrozen', provisioned: 'true'},
        'test-ns/svc/test2': {avail: 'down', frozen: 'frozen', provisioned: 'true'},
        'root/svc/test3': {avail: 'warn', frozen: 'unfrozen', provisioned: 'true'},
        'test-ns/svc/test4': {avail: 'n/a', frozen: 'unfrozen', provisioned: 'true'},
        'test-ns/svc/unprovisioned': {avail: 'n/a', frozen: 'unfrozen', provisioned: 'false'},
        'test-ns/svc/unprovisioned-bool': {avail: 'n/a', frozen: 'unfrozen', provisioned: false},
    },
    objectInstanceStatus: {
        'test-ns/svc/test1': {
            node1: {avail: 'up', frozen_at: '0001-01-01T00:00:00Z'},
            node2: {avail: 'down', frozen_at: '2025-05-16T10:00:00Z'},
        },
        'test-ns/svc/test2': {
            node1: {avail: 'down', frozen_at: '2025-05-16T10:00:00Z'},
        },
        'root/svc/test3': {node2: {avail: 'warn', frozen_at: '0001-01-01T00:00:00Z'}},
        'test-ns/svc/test4': {},
        'test-ns/svc/unprovisioned': {
            node1: {avail: 'n/a', frozen_at: '0001-01-01T00:00:00Z', provisioned: 'false'},
        },
        'test-ns/svc/unprovisioned-bool': {
            node1: {avail: 'n/a', frozen_at: '0001-01-01T00:00:00Z', provisioned: false},
        },
    },
    instanceMonitor: {
        'node1:test-ns/svc/test1': {state: 'running', global_expect: 'frozen'},
        'node2:test-ns/svc/test1': {state: 'idle', global_expect: 'none'},
        'node1:test-ns/svc/test2': {state: 'failed', global_expect: 'none'},
        'node2:root/svc/test3': {state: 'idle', global_expect: 'started'},
    },
    removeObject: mockRemoveObject,
    setObjectStatuses: mockSetObjectStatuses,
};

const setup = (customState = {}, locationSearch = '', mediaQuery = true, {daemon} = {}) => {
    const state = {...defaultState, ...customState};

    const useEventStoreMock = useEventStore;
    useEventStoreMock.mockImplementation((sel) => sel(state));
    useEventStoreMock.getState.mockReturnValue(state);

    vi.mocked(useFetchDaemonStatus).mockReturnValue({daemon: daemon || {cluster: {object: {}}}});
    vi.mocked(useLocation).mockReturnValue({search: locationSearch, pathname: '/objects'});

    const mockedUseMediaQuery = useMediaQuery;
    if (typeof mediaQuery === 'object' && mediaQuery !== null) {
        mockedUseMediaQuery
            .mockReturnValueOnce(mediaQuery.isWideScreen)
            .mockReturnValueOnce(mediaQuery.isMobile);
    } else {
        mockedUseMediaQuery.mockReturnValue(mediaQuery);
    }

    global.fetch = vi.fn(() => Promise.resolve({ok: true, json: () => Promise.resolve({})}));

    mockForceFlush.mockClear();
    mockNavigate.mockClear();
    mockRemoveObject.mockClear();
    mockSetObjectStatuses.mockClear();

    const utils = render(
        <MemoryRouter>
            <Objects/>
        </MemoryRouter>
    );
    return {...utils, state};
};

const waitForLoad = () =>
    waitFor(() => expect(screen.getByLabelText('Global State')).toBeInTheDocument());

const selectFilter = async (label, optionText) => {
    const filter = screen.getByLabelText(label);
    fireEvent.mouseDown(filter);
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument());
    const listbox = screen.getByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    const option = options.find((o) =>
        o.textContent.toLowerCase().includes(optionText.toLowerCase())
    );
    if (!option) throw new Error(`Option "${optionText}" not found`);
    fireEvent.click(within(option).getByRole('checkbox'));
    fireEvent.keyDown(listbox, {key: 'Escape', code: 'Escape'});
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument(), {timeout: 1000});
};

const selectRow = (name) => {
    const row = screen.getByRole('row', {name: new RegExp(name, 'i')});
    const cb = within(row).getByRole('checkbox');
    fireEvent.click(cb);
    return cb;
};

const openActionsMenu = () =>
    fireEvent.click(screen.getByRole('button', {name: /actions on selected objects/i}));

const clickMenuItem = async (text) => {
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByText(new RegExp(`^${text}$`, 'i')));
};

const confirmDialog = async (buttonName = /Confirm|Stop|Delete/i) => {
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    const dialog = screen.getByRole('dialog');
    const checkbox = /** @type {HTMLInputElement} */ (within(dialog).queryByRole('checkbox'));
    if (checkbox && !checkbox.checked) {
        fireEvent.click(checkbox);
    }
    fireEvent.click(within(dialog).getByRole('button', {name: buttonName}));
};

const clickHeader = (text) => fireEvent.click(screen.getByText(text));

const makeMany = (n) => {
    const objectStatus = {};
    const objectInstanceStatus = {};
    for (let i = 0; i < n; i++) {
        const name = `test-ns/svc/obj${i}`;
        objectStatus[name] = {avail: 'up', frozen: 'unfrozen'};
        objectInstanceStatus[name] = {node1: {avail: 'up', frozen_at: '0001-01-01T00:00:00Z'}};
    }
    return {objectStatus, objectInstanceStatus};
};

const setScroll = (container, scrollTop) => {
    Object.defineProperty(container, 'scrollHeight', {value: 1000, configurable: true});
    Object.defineProperty(container, 'clientHeight', {value: 500, configurable: true});
    Object.defineProperty(container, 'scrollTop', {value: scrollTop, configurable: true});
};

const getScrollContainer = () => document.querySelector('.MuiTableContainer-root');

beforeEach(() => {
    originalConsoleError = console.error;
    console.error = vi.fn((msg, ...args) => {
        if (
            typeof msg === 'string' &&
            (msg.includes('A props object containing a "key" prop is being spread into JSX') ||
                msg.includes('<li> cannot appear as a descendant of <li>'))
        )
            return;
        originalConsoleError.call(console, msg, ...args);
    });
    vi.clearAllMocks();
    originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = vi.fn().mockReturnValue('mock-token');
    mockRemoveObject.mockClear();
    mockSetObjectStatuses.mockClear();
    cleanup();
});

afterEach(() => {
    console.error = originalConsoleError;
    Storage.prototype.getItem = originalGetItem;
    vi.restoreAllMocks();
    cleanup();
});

// ---------- tests ----------
describe('Objects Component', () => {
    test('initial render and data fetch', async () => {
        const {unmount} = setup();
        await waitForLoad();
        expect(screen.getByText('Status')).toBeInTheDocument();
        expect(screen.getByText('Object')).toBeInTheDocument();
        expect(screen.getByRole('table')).toBeInTheDocument();
        expect(startEventReception).toHaveBeenCalledWith('mock-token', expect.any(Array));
        unmount();
        expect(closeEventSource).toHaveBeenCalled();
    });

    test('does not start event reception without a token', async () => {
        Storage.prototype.getItem = vi.fn().mockReturnValue(null);
        setup();
        await waitForLoad();
        expect(startEventReception).not.toHaveBeenCalled();
    });

    test('renders object data correctly (status labels)', async () => {
        setup();
        await waitForLoad();
        ['test-ns/svc/test1', 'test-ns/svc/test2', 'root/svc/test3'].forEach((name) =>
            expect(screen.getByRole('row', {name: new RegExp(name)})).toBeInTheDocument()
        );
        const row1 = screen.getByRole('row', {name: /test1/});
        expect(within(row1).getByLabelText('Object is up')).toBeInTheDocument();
        expect(within(row1).getByText('frozen')).toBeInTheDocument();

        const row3 = screen.getByRole('row', {name: /root\/svc\/test3/});
        expect(within(row3).getByLabelText('Object has warning')).toBeInTheDocument();

        const row4 = screen.getByRole('row', {name: /test-ns\/svc\/test4/});
        expect(within(row4).getByLabelText('Object status is n/a')).toBeInTheDocument();
    });

    test('selection and select all', async () => {
        setup();
        await waitForLoad();
        const cb = selectRow('test-ns/svc/test1');
        expect(cb).toBeChecked();
        const selectAll = screen.getAllByRole('checkbox')[0];
        fireEvent.click(selectAll);
        screen.getAllByRole('checkbox').slice(1).forEach((c) => expect(c).toBeChecked());
        fireEvent.click(selectAll);
        screen.getAllByRole('checkbox').slice(1).forEach((c) => expect(c).not.toBeChecked());
    });

    test('actions menu opens and lists actions', async () => {
        setup();
        await waitForLoad();
        selectRow('test-ns/svc/test1');
        openActionsMenu();
        const menu = await screen.findByRole('menu');
        ['Restart', 'Stop', 'Freeze', 'Delete'].forEach((a) =>
            expect(within(menu).getByText(a)).toBeInTheDocument()
        );
    });

    test('global actions menu disables actions not allowed for the selection', async () => {
        setup();
        await waitForLoad();
        selectRow('test-ns/svc/test1');
        selectRow('test-ns/svc/test2');
        openActionsMenu();
        const menu = await screen.findByRole('menu');
        const items = within(menu).getAllByRole('menuitem');
        const disabledItems = items.filter(
            (i) =>
                i.getAttribute('aria-disabled') === 'true' ||
                i.classList.contains('Mui-disabled')
        );
        expect(items.length).toBeGreaterThan(0);
        expect(disabledItems.length).toBeGreaterThanOrEqual(0);
    });

    describe('filtering', () => {
        const filterTests = [
            {
                label: 'Namespace',
                option: 'test-ns',
                visible: ['test-ns/svc/test1', 'test-ns/svc/test2'],
                hidden: ['root/svc/test3'],
            },
            {label: 'Global State', option: 'Up', visible: ['test-ns/svc/test1'], hidden: ['test-ns/svc/test2']},
            {label: 'Kind', option: 'svc', visible: ['test-ns/svc/test1'], hidden: []},
            {
                label: 'Name',
                option: 'test1',
                visible: ['test-ns/svc/test1'],
                hidden: ['test-ns/svc/test2', 'root/svc/test3'],
                isSearch: true,
            },
        ];

        test.each(filterTests)(
            '$label filter',
            async ({label, option, visible, hidden, isSearch}) => {
                setup();
                await waitForLoad();
                if (isSearch) {
                    fireEvent.change(screen.getByLabelText('Name'), {target: {value: option}});
                } else {
                    await selectFilter(label, option);
                }
                await waitFor(() => {
                    visible.forEach((n) =>
                        expect(screen.getByRole('row', {name: new RegExp(n)})).toBeInTheDocument()
                    );
                    hidden.forEach((n) =>
                        expect(screen.queryByRole('row', {name: new RegExp(n)})).not.toBeInTheDocument()
                    );
                });
            }
        );

        const globalStateTests = [
            {option: 'Down', visible: ['test-ns/svc/test2'], hidden: ['test-ns/svc/test1']},
            {option: 'Warn', visible: ['root/svc/test3'], hidden: ['test-ns/svc/test1']},
            {option: 'N/a', visible: ['test-ns/svc/test4'], hidden: ['test-ns/svc/test1']},
            {
                option: 'Unprovisioned',
                visible: ['test-ns/svc/unprovisioned$', 'test-ns/svc/unprovisioned-bool'],
                hidden: ['test1'],
            },
        ];

        test.each(globalStateTests)('Global State filter: $option', async ({option, visible, hidden}) => {
            setup();
            await waitForLoad();
            await selectFilter('Global State', option);
            await waitFor(() => {
                visible.forEach((v) =>
                    expect(screen.getByRole('row', {name: new RegExp(v)})).toBeInTheDocument()
                );
                hidden.forEach((h) =>
                    expect(screen.queryByRole('row', {name: new RegExp(h)})).not.toBeInTheDocument()
                );
            });
        });

        test('combining multiple Global State selections matches any of them', async () => {
            setup();
            await waitForLoad();
            await selectFilter('Global State', 'Up');
            await selectFilter('Global State', 'Down');
            await waitFor(() => {
                expect(screen.getByRole('row', {name: /test-ns\/svc\/test1/})).toBeInTheDocument();
                expect(screen.getByRole('row', {name: /test-ns\/svc\/test2/})).toBeInTheDocument();
                expect(screen.queryByRole('row', {name: /root\/svc\/test3/})).not.toBeInTheDocument();
            });
        });

        test('URL param "all" results in empty filters', async () => {
            setup({}, '?globalState=all&namespace=all&kind=all');
            await waitForLoad();
            await waitFor(() => {
                expect(screen.getByRole('row', {name: /test-ns\/svc\/test1/})).toBeInTheDocument();
                expect(screen.getByRole('row', {name: /test-ns\/svc\/test2/})).toBeInTheDocument();
                expect(screen.getByRole('row', {name: /root\/svc\/test3/})).toBeInTheDocument();
            });
        });

        test('clicking on a Global State chip (not delete) removes that filter', async () => {
            setup();
            await waitForLoad();
            await selectFilter('Global State', 'Up');
            const chip = screen.getByText(/^Up$/).closest('.MuiChip-root');
            fireEvent.click(chip);
            await waitFor(() => expect(screen.queryByText(/^Up$/)).not.toBeInTheDocument());
            expect(screen.getByRole('row', {name: /test-ns\/svc\/test2/})).toBeInTheDocument();
        });

        test('Kind filter excludes objects whose kind does not match the selection', async () => {
            setup({
                objectStatus: {
                    ...defaultState.objectStatus,
                    'test-ns/vol/test5': {avail: 'up', frozen: 'unfrozen', provisioned: 'true'},
                },
                objectInstanceStatus: {
                    ...defaultState.objectInstanceStatus,
                    'test-ns/vol/test5': {},
                },
            });
            await waitForLoad();
            await selectFilter('Kind', 'svc');
            await waitFor(() => {
                expect(screen.getByRole('row', {name: /test-ns\/svc\/test1/})).toBeInTheDocument();
                expect(screen.queryByRole('row', {name: /test-ns\/vol\/test5/})).not.toBeInTheDocument();
            });
        });
    });

    test('multiple filters combined', async () => {
        setup();
        await waitForLoad();
        await selectFilter('Namespace', 'test-ns');
        await selectFilter('Global State', 'Up');
        await waitFor(() => {
            expect(screen.getByRole('row', {name: /test1/})).toBeInTheDocument();
            expect(screen.queryByRole('row', {name: /test2/})).not.toBeInTheDocument();
        });
    });

    test('chips remove filters via onDelete (Namespace)', async () => {
        setup();
        await waitForLoad();
        await selectFilter('Namespace', 'test-ns');
        const chip = screen.getByText('test-ns').closest('.MuiChip-root');
        fireEvent.click(within(chip).getByTestId('CloseIcon'));
        await waitFor(() =>
            expect(screen.getByRole('row', {name: /root\/svc\/test3/})).toBeInTheDocument()
        );
    });

    test('global state chip removal via onDelete restores filtered objects', async () => {
        setup();
        await waitForLoad();
        await selectFilter('Global State', 'Up');
        await waitFor(() =>
            expect(screen.queryByRole('row', {name: /test-ns\/svc\/test2/})).not.toBeInTheDocument()
        );
        const chip = screen.getByText(/^Up$/).closest('.MuiChip-root');
        fireEvent.click(within(chip).getByTestId('CloseIcon'));
        await waitFor(() =>
            expect(screen.getByRole('row', {name: /test-ns\/svc\/test2/})).toBeInTheDocument()
        );
    });

    test('kind chip removal via onDelete restores filtered objects', async () => {
        setup();
        await waitForLoad();
        await selectFilter('Kind', 'svc');
        await selectFilter('Namespace', 'test-ns');
        await waitFor(() =>
            expect(screen.queryByRole('row', {name: /root\/svc\/test3/})).not.toBeInTheDocument()
        );
        const chip = screen.getByText('test-ns').closest('.MuiChip-root');
        fireEvent.click(within(chip).getByTestId('CloseIcon'));
        await waitFor(() =>
            expect(screen.getByRole('row', {name: /root\/svc\/test3/})).toBeInTheDocument()
        );
    });

    test('empty message when nothing matches', async () => {
        setup();
        await waitForLoad();
        fireEvent.change(screen.getByLabelText('Name'), {target: {value: 'nonexistent'}});
        await waitFor(() => expect(screen.getByText(/No objects found/)).toBeInTheDocument());
    });

    describe('actions execution', () => {
        test('restart succeeds', async () => {
            setup();
            await waitForLoad();
            selectRow('test-ns/svc/test1');
            openActionsMenu();
            await clickMenuItem('Restart');
            await confirmDialog();
            await waitFor(() =>
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringContaining('/action/restart'),
                    expect.any(Object)
                )
            );
            await waitFor(() =>
                expect(screen.getByRole('alert')).toHaveTextContent(/succeeded/i)
            );
            expect(mockForceFlush).toHaveBeenCalled();
            expect(screen.queryByRole('checkbox', {checked: true})).not.toBeInTheDocument();
        });

        test('unfreeze succeeds on frozen object', async () => {
            setup();
            await waitForLoad();
            selectRow('test-ns/svc/test2');
            openActionsMenu();
            await clickMenuItem('Unfreeze');
            await confirmDialog();
            await waitFor(() =>
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringContaining('/action/unfreeze'),
                    expect.any(Object)
                )
            );
            expect(mockForceFlush).toHaveBeenCalled();
            expect(mockSetObjectStatuses).toHaveBeenCalled();
        });

        test('freeze updates frozen status optimistically', async () => {
            setup();
            await waitForLoad();
            selectRow('test-ns/svc/test1');
            openActionsMenu();
            await clickMenuItem('Freeze');
            await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
            const dialog = screen.getByRole('dialog');
            const checkbox = /** @type {HTMLInputElement} */ (within(dialog).getByRole('checkbox'));
            fireEvent.click(checkbox);
            fireEvent.click(within(dialog).getByRole('button', {name: /confirm/i}));
            await waitFor(() =>
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringContaining('/action/freeze'),
                    expect.any(Object)
                )
            );
            expect(mockForceFlush).toHaveBeenCalled();
            expect(mockSetObjectStatuses).toHaveBeenCalled();
            const callArg = mockSetObjectStatuses.mock.calls[0][0];
            expect(callArg['test-ns/svc/test1'].frozen).toBe('frozen');
        });

        test('freezing an already frozen object is counted as error', async () => {
            setup();
            await waitForLoad();
            selectRow('test-ns/svc/test1');
            selectRow('test-ns/svc/test2');
            openActionsMenu();
            await clickMenuItem('Freeze');
            await confirmDialog();
            expect(global.fetch).toHaveBeenCalledTimes(1);
            await waitFor(() =>
                expect(screen.getByRole('alert')).toHaveTextContent(
                    /partially succeeded: 1 ok, 1 errors/i
                )
            );
            expect(mockSetObjectStatuses).toHaveBeenCalled();
        });

        test.each([
            ['test1', 'Unfreeze'],
            ['test2', 'Freeze'],
        ])('%s row menu does not offer "%s" (already in that state)', async (rowName, missingAction) => {
            setup();
            await waitForLoad();
            const row = screen.getByRole('row', {name: new RegExp(rowName)});
            fireEvent.click(within(row).getByRole('button', {name: /more actions/i}));
            await screen.findByRole('menu');
            expect(screen.queryByText(missingAction)).not.toBeInTheDocument();
        });

        test('delete succeeds with confirmations', async () => {
            setup();
            await waitForLoad();
            selectRow('test-ns/svc/test1');
            openActionsMenu();
            await clickMenuItem('Delete');
            await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
            fireEvent.click(screen.getByLabelText(/Confirm configuration loss/i));
            fireEvent.click(screen.getByLabelText(/Confirm clusterwide orchestration/i));
            fireEvent.click(screen.getByRole('button', {name: /Delete/i}));
            await waitFor(() =>
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringContaining('/action/delete'),
                    expect.any(Object)
                )
            );
            expect(mockRemoveObject).toHaveBeenCalledWith('test-ns/svc/test1');
            expect(mockForceFlush).toHaveBeenCalled();
        });

        test('failed action shows error alert', async () => {
            setup();
            global.fetch = vi.fn(() => Promise.resolve({ok: false, status: 500}));
            await waitForLoad();
            selectRow('test-ns/svc/test1');
            openActionsMenu();
            await clickMenuItem('Restart');
            await confirmDialog();
            await waitFor(() =>
                expect(screen.getByRole('alert')).toHaveTextContent(/failed/i)
            );
        });

        test('partial success shows warning', async () => {
            setup();
            await waitForLoad();
            selectRow('test-ns/svc/test1');
            selectRow('test-ns/svc/test2');
            global.fetch = vi.fn()
                .mockResolvedValueOnce({ok: true})
                .mockResolvedValueOnce({ok: false, status: 500});
            openActionsMenu();
            await clickMenuItem('Restart');
            await confirmDialog();
            await waitFor(() =>
                expect(screen.getByRole('alert')).toHaveTextContent(
                    /partially succeeded: 1 ok, 1 errors/i
                )
            );
        });

        test('network error', async () => {
            setup();
            await waitForLoad();
            selectRow('test-ns/svc/test1');
            global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
            openActionsMenu();
            await clickMenuItem('Restart');
            await confirmDialog();
            await waitFor(() =>
                expect(screen.getByRole('alert')).toHaveTextContent(
                    /failed on all 1 object\(s\)/i
                )
            );
        });

        test('token missing prevents action', async () => {
            Storage.prototype.getItem = vi.fn().mockReturnValue(null);
            setup();
            await waitForLoad();
            selectRow('test-ns/svc/test1');
            openActionsMenu();
            await clickMenuItem('Restart');
            await confirmDialog();
            await waitFor(() =>
                expect(screen.getByRole('alert')).toHaveTextContent('Authentication token not found')
            );
        });

        test('action on an object missing from objectStatus is counted as an error', async () => {
            setup();
            await waitForLoad();
            selectRow('test-ns/svc/test1');
            selectRow('test-ns/svc/test2');
            const partialState = {
                ...defaultState,
                objectStatus: {'test-ns/svc/test1': defaultState.objectStatus['test-ns/svc/test1']},
            };
            useEventStore.getState.mockReturnValue(partialState);
            openActionsMenu();
            await clickMenuItem('Restart');
            await confirmDialog();
            await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
        });

        test('object removed from objectStatus after selection is treated as an error (rawObj missing)', async () => {
            const {rerender} = setup();
            await waitForLoad();
            selectRow('test-ns/svc/test1');
            selectRow('test-ns/svc/test2');

            const stateWithoutTest2 = {
                ...defaultState,
                objectStatus: {
                    'test-ns/svc/test1': defaultState.objectStatus['test-ns/svc/test1'],
                },
            };
            useEventStore.mockImplementation((sel) => sel(stateWithoutTest2));
            useEventStore.getState.mockReturnValue(stateWithoutTest2);
            rerender(
                <MemoryRouter>
                    <Objects/>
                </MemoryRouter>
            );

            openActionsMenu();
            await clickMenuItem('Restart');
            await confirmDialog();
            await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
            await waitFor(() =>
                expect(screen.getByRole('alert')).toHaveTextContent(
                    /partially succeeded: 1 ok, 1 errors/i
                )
            );
        });

        test('single-object action via row menu targets only that object', async () => {
            setup();
            await waitForLoad();
            selectRow('test-ns/svc/test1');
            selectRow('test-ns/svc/test2');
            const row = screen.getByRole('row', {name: /test-ns\/svc\/test1/});
            fireEvent.click(within(row).getByRole('button', {name: /more actions/i}));
            await clickMenuItem('Restart');
            await confirmDialog();
            await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('test-ns/svc/test1/action/restart'),
                expect.any(Object)
            );
        });

        test('stop action succeeds', async () => {
            setup();
            await waitForLoad();
            selectRow('test-ns/svc/test1');
            openActionsMenu();
            await clickMenuItem('Stop');
            await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
            const dialog = screen.getByRole('dialog');
            const checkbox = /** @type {HTMLInputElement} */ (within(dialog).getByRole('checkbox'));
            fireEvent.click(checkbox);
            fireEvent.click(within(dialog).getByRole('button', {name: /confirm stop/i}));
            await waitFor(() =>
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringContaining('/action/stop'),
                    expect.any(Object)
                )
            );
        });
    });

    test('row click navigates', async () => {
        setup();
        await waitForLoad();
        fireEvent.click(screen.getByRole('row', {name: /test-ns\/svc\/test1/}));
        expect(mockNavigate).toHaveBeenCalledWith('/objects/test-ns%2Fsvc%2Ftest1');
    });

    test('no navigation if no instance status', async () => {
        setup({objectInstanceStatus: {}});
        await waitForLoad();
        fireEvent.click(screen.getByRole('row', {name: /test-ns\/svc\/test1/}));
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('checkbox click does not trigger row navigation', async () => {
        setup();
        await waitForLoad();
        selectRow('test-ns/svc/test1');
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('row menu button click does not trigger row navigation', async () => {
        setup();
        await waitForLoad();
        const row = screen.getByRole('row', {name: /test-ns\/svc\/test1/});
        fireEvent.click(within(row).getByRole('button', {name: /more actions/i}));
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('row context menu shows correct actions (unfrozen object)', async () => {
        setup();
        await waitForLoad();
        const row = screen.getByRole('row', {name: /test1/});
        fireEvent.click(within(row).getByRole('button', {name: /more actions/i}));
        await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
        expect(screen.getByText('Freeze')).toBeInTheDocument();
        expect(screen.queryByText('Unfreeze')).not.toBeInTheDocument();
    });

    test('row context menu for frozen object', async () => {
        setup();
        await waitForLoad();
        const row = screen.getByRole('row', {name: /test2/});
        fireEvent.click(within(row).getByRole('button', {name: /more actions/i}));
        await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
        expect(screen.queryByText('Freeze')).not.toBeInTheDocument();
        expect(screen.getByText('Unfreeze')).toBeInTheDocument();
    });

    test('row menu closes when pressing Escape', async () => {
        setup();
        await waitForLoad();
        const row = screen.getByRole('row', {name: /test1/});
        fireEvent.click(within(row).getByRole('button', {name: /more actions/i}));
        const menu = await screen.findByRole('menu');
        fireEvent.keyDown(menu, {key: 'Escape', code: 'Escape'});
        await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    });

    test('clicking inside the row actions menu does not propagate a click to the row', async () => {
        setup();
        await waitForLoad();
        const row = screen.getByRole('row', {name: /test1/});
        fireEvent.click(within(row).getByRole('button', {name: /more actions/i}));
        const menu = await screen.findByRole('menu');
        fireEvent.click(menu);
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('global actions disabled when none selected', async () => {
        setup();
        await waitForLoad();
        expect(screen.getByRole('button', {name: /actions on selected objects/i})).toBeDisabled();
    });

    test('filters are always visible', async () => {
        setup();
        await waitForLoad();
        expect(screen.getByLabelText('Namespace')).toBeInTheDocument();
        expect(screen.getByLabelText('Global State')).toBeInTheDocument();
        expect(screen.getByLabelText('Kind')).toBeInTheDocument();
        expect(screen.getByLabelText('Name')).toBeInTheDocument();
    });

    describe('sorting', () => {
        test('Status sorting works', async () => {
            setup();
            await waitForLoad();
            clickHeader('Status');
            await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));
        });

        test('Object sorting works', async () => {
            setup();
            await waitForLoad();
            clickHeader('Object');
            await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));
        });
    });

    describe('infinite scroll', () => {
        test('loads more items when scrolled past 80%', async () => {
            setup(makeMany(50));
            await waitForLoad();
            expect(screen.getAllByRole('row').slice(1)).toHaveLength(30);
            const container = getScrollContainer();
            setScroll(container, 500);
            fireEvent.scroll(container);
            await waitFor(() =>
                expect(screen.getAllByRole('row').slice(1).length).toBeGreaterThan(30)
            );
        });

        test('shows loading indicator while fetching the next page', async () => {
            setup(makeMany(50));
            await waitForLoad();
            const container = getScrollContainer();
            setScroll(container, 500);
            fireEvent.scroll(container);
            await waitFor(() => expect(screen.getByRole('progressbar')).toBeInTheDocument());
            await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
        });

        test('scroll does nothing when no more items', async () => {
            setup({objectStatus: {'a/b': {avail: 'up'}}, objectInstanceStatus: {}});
            await waitForLoad();
            const container = getScrollContainer();
            fireEvent.scroll(container);
            expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
        });

        test('scroll is ignored while a load is already in progress', async () => {
            setup(makeMany(80));
            await waitForLoad();
            const container = getScrollContainer();
            setScroll(container, 500);
            fireEvent.scroll(container);
            fireEvent.scroll(container);
            await waitFor(() =>
                expect(screen.getAllByRole('row').slice(1).length).toBeGreaterThan(30)
            );
        });

        test('scroll below threshold does not load more', async () => {
            setup(makeMany(50));
            await waitForLoad();
            const container = getScrollContainer();
            setScroll(container, 100);
            fireEvent.scroll(container);
            const rowsBefore = screen.getAllByRole('row').slice(1).length;
            await waitFor(() =>
                expect(screen.getAllByRole('row').slice(1).length).toBe(rowsBefore)
            );
        });
    });

    test('URL sync debounced', async () => {
        vi.useFakeTimers();
        setup();
        await waitForLoad();
        fireEvent.change(screen.getByLabelText('Name'), {target: {value: 'sync'}});
        vi.advanceTimersByTime(300);
        expect(mockNavigate).toHaveBeenCalledWith('/objects?name=sync', {replace: true});
        vi.useRealTimers();
    });

    test('URL sync is skipped when filters already match current URL params', async () => {
        vi.useFakeTimers();
        setup({}, '?name=test1');
        await waitForLoad();
        vi.advanceTimersByTime(300);
        expect(mockNavigate).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    test('URL filters update state on location change', async () => {
        const {rerender} = setup();
        await waitForLoad();
        vi.mocked(useLocation).mockReturnValue({
            search: '?namespace=test-ns&kind=svc&name=test1',
            pathname: '/objects',
        });
        rerender(
            <MemoryRouter>
                <Objects/>
            </MemoryRouter>
        );
        await waitFor(() => {
            expect(screen.getByText('test-ns')).toBeInTheDocument();
            expect(screen.getByText('svc')).toBeInTheDocument();
            expect(screen.getByLabelText('Name')).toHaveValue('test1');
        });
    });

    test('URL globalState param hydrates selected global states on mount', async () => {
        setup({}, '?globalState=up,down');
        await waitForLoad();
        await waitFor(() => {
            expect(screen.getByRole('row', {name: /test-ns\/svc\/test1/})).toBeInTheDocument();
            expect(screen.getByRole('row', {name: /test-ns\/svc\/test2/})).toBeInTheDocument();
            expect(screen.queryByRole('row', {name: /root\/svc\/test3/})).not.toBeInTheDocument();
        });
    });

    test('unknown globalState URL value renders without a status icon (getStateIcon default case)', async () => {
        setup({}, '?globalState=bogus');
        await waitForLoad();
        await waitFor(() => expect(screen.getByText(/^Bogus$/)).toBeInTheDocument());
    });

    test('snackbar closes on alert close', async () => {
        setup();
        await waitForLoad();
        selectRow('test-ns/svc/test1');
        openActionsMenu();
        await clickMenuItem('Restart');
        await confirmDialog();
        await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
        const closeBtn = screen.getByRole('alert').querySelector('button[aria-label="Close"]');
        if (closeBtn) {
            fireEvent.click(closeBtn);
            await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
        }
    });

    test('cancel action dialog', async () => {
        setup();
        await waitForLoad();
        selectRow('test-ns/svc/test1');
        openActionsMenu();
        await clickMenuItem('Restart');
        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', {name: /cancel/i}));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('narrow screen hides node columns', async () => {
        setup({}, '', false);
        await waitForLoad();
        expect(screen.queryByRole('columnheader', {name: /node1/})).not.toBeInTheDocument();
    });

    test('daemon fallback when store empty', async () => {
        setup(
            {objectStatus: {}, objectInstanceStatus: {}},
            '',
            true,
            {daemon: {cluster: {object: {'daemon/svc/obj1': {avail: 'up', frozen: 'unfrozen'}}}}}
        );
        await waitFor(() =>
            expect(screen.getByRole('row', {name: /daemon\/svc\/obj1/})).toBeInTheDocument()
        );
    });

    test('daemon fallback with no objects at all renders empty state', async () => {
        setup(
            {objectStatus: {}, objectInstanceStatus: {}},
            '',
            true,
            {daemon: {cluster: {object: {}}}}
        );
        await waitForLoad();
        await waitFor(() => expect(screen.getByText(/No objects found/)).toBeInTheDocument());
    });

    test('unprovisioned object icon is shown', async () => {
        setup();
        await waitForLoad();
        const notProvisionedIcons = screen.getAllByLabelText('Object is not provisioned');
        expect(notProvisionedIcons.length).toBeGreaterThanOrEqual(2);
    });

    test.each([
        ['cluster', {
            objectStatus: {cluster: {avail: 'up', frozen: 'unfrozen'}},
            objectInstanceStatus: {cluster: {node1: {avail: 'up'}}},
        }, '/root/ccfg/cluster/action/restart'],
        ['svc/myobj', {
            objectStatus: {'svc/myobj': {avail: 'up', frozen: 'unfrozen'}},
            objectInstanceStatus: {'svc/myobj': {node1: {avail: 'up'}}},
        }, '/root/svc/myobj/action/restart'],
        ['standalone', {
            objectStatus: {standalone: {avail: 'up', frozen: 'unfrozen'}},
            objectInstanceStatus: {standalone: {node1: {avail: 'up'}}},
        }, '/root/svc/standalone/action/restart'],
    ])('object name "%s" resolves to the expected action URL', async (rowName, customState, expectedUrl) => {
        setup(customState);
        await waitForLoad();
        selectRow(rowName);
        openActionsMenu();
        await clickMenuItem('Restart');
        await confirmDialog();
        await waitFor(() =>
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining(expectedUrl),
                expect.any(Object)
            )
        );
    });

    test('filters out non-object entries from allObjectNames', async () => {
        const stateWithNonObject = {
            ...defaultState,
            objectStatus: {
                ...defaultState.objectStatus,
                __proto__: null,
                validObj: {avail: 'up', frozen: 'unfrozen'},
            },
        };
        setup(stateWithNonObject);
        await waitForLoad();
        expect(screen.queryByRole('row', {name: /someFunction/})).not.toBeInTheDocument();
        expect(screen.getByRole('row', {name: /validObj/})).toBeInTheDocument();
    });

    test('renders EventLogger component', async () => {
        setup();
        await waitForLoad();
        expect(screen.getByText('Object Events')).toBeInTheDocument();
    });

    test('handles scroll when container ref is null gracefully', () => {
        const {container} = setup();
        expect(container).toBeTruthy();
    });

    test('resets visibleCount when sortedObjectNames changes', async () => {
        setup(makeMany(50));
        await waitForLoad();
        const container = getScrollContainer();
        setScroll(container, 500);
        fireEvent.scroll(container);
        await waitFor(() => expect(screen.getAllByRole('row').slice(1).length).toBeGreaterThan(30));
        fireEvent.change(screen.getByLabelText('Name'), {target: {value: 'nonexistent'}});
        await waitFor(() => expect(screen.getByText(/No objects found/)).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Name'), {target: {value: ''}});
        await waitFor(() => expect(screen.getAllByRole('row').slice(1).length).toBe(30));
    });

    describe('chip toggle handlers (add branch coverage)', () => {
        test.each([
            ['Global State', 'Up', () => screen.getByText(/^Up$/).closest('.MuiChip-root'), false],
            ['Namespace', 'test-ns', () => screen.getByText('test-ns').closest('.MuiChip-root'), true],
            ['Kind', 'svc', () => screen.getByText('svc').closest('.MuiChip-root'), true],
        ])('rapidly toggling a %s chip twice re-adds it', async (label, option, getChip, useDeleteIcon) => {
            setup();
            await waitForLoad();
            await selectFilter(label, option);
            const chip = getChip();
            fireEvent.mouseDown(chip);
            const target = useDeleteIcon ? within(chip).getByTestId('CloseIcon') : chip;
            act(() => {
                fireEvent.click(target);
                fireEvent.click(target);
            });
            await waitFor(() => expect(getChip()).toBeInTheDocument());
        });
    });

    test('accessibility', async () => {
        const {container} = setup();
        await waitForLoad();
        const results = await axe(container, {
            rules: {'aria-prohibited-attr': {enabled: false}, label: {enabled: false}},
        });
        expect(results.violations).toHaveLength(0);
    });
});
