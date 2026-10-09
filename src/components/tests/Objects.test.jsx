import React from 'react';
import '@testing-library/jest-dom';
import {render, screen, fireEvent, waitFor, within, cleanup, act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {vi} from 'vitest';
import {axe} from 'vitest-axe';
import Objects, {PROPERTY_COLUMNS} from '../Objects';
import i18n from '../../i18n';

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

vi.mock('../../ui/lib/media', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useMediaQuery: vi.fn(),
    };
});

import useEventStore from '../../hooks/useEventStore';
import useFetchDaemonStatus from '../../hooks/useFetchDaemonStatus';
import {useMediaQuery} from '../../ui/lib/media';
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

    const mockedUseMediaQuery = vi.mocked(useMediaQuery);
    mockedUseMediaQuery.mockReset();

    if (typeof mediaQuery === 'object' && mediaQuery !== null) {
        mockedUseMediaQuery.mockImplementation((query) => {
            if (typeof query === 'string') {
                if (query.includes('min-width')) {
                    return mediaQuery.isWideScreen;
                }
                if (query.includes('max-width')) {
                    return mediaQuery.isMobile;
                }
            }
            return false;
        });
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

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** The checkbox popover of a multi-valued filter. */
const filterGroup = (label) => screen.getByRole('group', {name: label});
const queryFilterGroup = (label) => screen.queryByRole('group', {name: label});
/** The summary that opens a filter popover, holding the filter name and its choice. */
const filterSummary = (label) => filterGroup(label).closest('details').querySelector('summary');
const filterOption = (label, optionText) =>
    within(filterGroup(label)).getByRole('checkbox', {name: new RegExp(`^${escapeRegExp(optionText)}$`, 'i')});

/** The visible text of a filter option, without its mark. */
const optionText = (checkbox) => checkbox.closest('label').lastChild.lastChild.textContent;

const waitForLoad = () =>
    waitFor(() => expect(filterGroup('Global State')).toBeInTheDocument());

const selectFilter = async (label, optionText) => {
    const summary = filterSummary(label);
    fireEvent.click(summary);
    fireEvent.click(filterOption(label, optionText));
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument(), {timeout: 1000});
};

const objectRow = (name) => screen.getByRole('row', {name: new RegExp(name, 'i')});
const rowCells = (row) => within(row).getAllByRole('cell');
/**
 * Cells: 0 selection, 1 status, 2 object, 3 and 4 the properties (orchestrate, topology),
 * then one per node (node1, node2) on a wide screen.
 */
const statusCell = (row) => rowCells(row)[1];
const propertyCell = (row, label) => rowCells(row)[3 + PROPERTY_COLUMNS.findIndex((c) => i18n.t(c.labelKey) === label)];
const nodeCell = (row, index) => rowCells(row)[3 + PROPERTY_COLUMNS.length + index];

const selectRow = (name) => {
    const row = objectRow(name);
    const cb = within(row).getByRole('checkbox');
    fireEvent.click(cb);
    return cb;
};

const rowCheckboxes = () => screen.getAllByRole('checkbox', {name: /^Select object /});

const openActionsMenu = () =>
    fireEvent.click(screen.getByRole('button', {name: /actions on selected objects/i}));

const clickMenuItem = async (text) => {
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitem', {name: new RegExp(`^${text}$`, 'i')}));
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

/** The feedback strip (the former snackbar): an alert for errors and warnings, a status otherwise. */
const getFeedback = () =>
    screen.getByRole('button', {name: 'Close'}).closest('[role="alert"], [role="status"]');

const sortButton = (label) =>
    within(screen.getByRole('columnheader', {name: new RegExp(`^${label}`)})).getByRole('button');
const clickHeader = (label) => fireEvent.click(sortButton(label));
const objectNamesInOrder = () =>
    screen.getAllByRole('row').slice(1).map((row) => rowCells(row)[2].textContent);

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

/** The scrolling wrapper of the sticky table. */
const getScrollContainer = () => screen.getByRole('table', {name: 'Objects'}).parentElement;
const loadingMore = () => screen.queryByRole('status', {name: 'Loading more objects'});

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
    vi.mocked(useMediaQuery).mockReset();
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
        const row1 = objectRow('test-ns/svc/test1');
        const status1 = statusCell(row1);
        expect(status1.querySelector('[data-state]')).toHaveAttribute('data-state', 'up');
        expect(within(status1).getByTitle('up')).toBeInTheDocument();
        // The global expect of an instance, as small muted text.
        expect(within(status1).getByText('frozen')).toHaveClass('text-ink-muted', 'whitespace-nowrap');
        expect(within(status1).queryByTitle('frozen')).toHaveTextContent('frozen');
        expect(within(status1).queryByRole('img', {name: 'Not provisioned'})).not.toBeInTheDocument();

        const row2 = objectRow('test-ns/svc/test2');
        expect(statusCell(row2).querySelector('[data-state]')).toHaveAttribute('data-state', 'down');
        // Frozen object: the snowflake mark, named for screen readers.
        expect(within(statusCell(row2)).getByText('frozen')).toHaveClass('sr-only');

        const row3 = objectRow('root/svc/test3');
        expect(statusCell(row3).querySelector('[data-state]')).toHaveAttribute('data-state', 'warn');
        expect(within(statusCell(row3)).getByText('started')).toBeInTheDocument();

        const row4 = objectRow('test-ns/svc/test4');
        expect(statusCell(row4).querySelector('[data-state]')).toHaveAttribute('data-state', 'unknown');
        expect(within(statusCell(row4)).getByTitle('n/a')).toBeInTheDocument();

        // The object name in its own column, medium weight.
        expect(rowCells(row1)[2]).toHaveTextContent('test-ns/svc/test1');
        expect(rowCells(row1)[2]).toHaveClass('font-medium');
    });

    test('has no per-row actions column', async () => {
        setup({}, '', {isWideScreen: true, isMobile: false});
        await waitForLoad();
        expect(screen.queryByRole('columnheader', {name: 'Actions'})).not.toBeInTheDocument();
        expect(within(objectRow('test-ns/svc/test1')).queryByRole('button')).not.toBeInTheDocument();
    });

    describe('object property columns', () => {
        const propertyState = {
            objectStatus: {
                'test-ns/svc/fo': {
                    avail: 'up', frozen: 'unfrozen', provisioned: 'true',
                    orchestrate: 'ha', topology: 'failover', placement_policy: 'nodes order',
                    placement_state: 'optimal', up_instances_count: 1, scope: ['node1', 'node2'], priority: 10,
                },
                'test-ns/svc/fx': {
                    avail: 'warn', frozen: 'unfrozen', provisioned: 'true',
                    orchestrate: 'start', topology: 'flex', flex: {min: 1, max: 3, target: 2},
                    placement_policy: 'spread', placement_state: 'non-optimal', up_instances_count: 2,
                    scope: ['node1', 'node2', 'node3'], priority: 50,
                },
                'test-ns/cfg/c': {avail: 'n/a', frozen: 'unfrozen', provisioned: 'true', scope: ['node1'], priority: 50},
            },
            objectInstanceStatus: {},
        };

        test('show orchestrate and topology', async () => {
            setup(propertyState);
            await waitForLoad();
            ['Placement', 'Up', 'Priority'].forEach((label) =>
                expect(screen.queryByRole('columnheader', {name: new RegExp(`^${label}`)})).not.toBeInTheDocument()
            );
            PROPERTY_COLUMNS.forEach(({labelKey}) =>
                expect(screen.getByRole('columnheader', {name: new RegExp(`^${i18n.t(labelKey)}`)})).toBeInTheDocument()
            );

            const failover = objectRow('test-ns/svc/fo');
            expect(propertyCell(failover, 'Orchestrate')).toHaveTextContent(/^ha$/);
            expect(propertyCell(failover, 'Topology')).toHaveTextContent(/^failover$/);

            const flex = objectRow('test-ns/svc/fx');
            expect(propertyCell(flex, 'Topology')).toHaveTextContent('flex 1-3');
        });

        test('are empty for an object with no instances to place', async () => {
            setup(propertyState);
            await waitForLoad();
            const cfg = objectRow('test-ns/cfg/c');
            ['Orchestrate', 'Topology'].forEach((label) =>
                expect(propertyCell(cfg, label)).toHaveTextContent(/^$/)
            );
        });

        test('sort, objects without the property last', async () => {
            setup(propertyState);
            await waitForLoad();
            clickHeader('Orchestrate');
            await waitFor(() =>
                expect(objectNamesInOrder()).toEqual(['test-ns/svc/fo', 'test-ns/svc/fx', 'test-ns/cfg/c'])
            );
            clickHeader('Orchestrate');
            await waitFor(() =>
                expect(objectNamesInOrder()).toEqual(['test-ns/svc/fx', 'test-ns/svc/fo', 'test-ns/cfg/c'])
            );
            clickHeader('Topology');
            await waitFor(() =>
                expect(objectNamesInOrder()).toEqual(['test-ns/svc/fo', 'test-ns/svc/fx', 'test-ns/cfg/c'])
            );
        });
    });

    test('per-node cells show avail, frozen, not provisioned and monitor state', async () => {
        setup({}, '', {isWideScreen: true, isMobile: false});
        await waitForLoad();
        expect(screen.getByRole('columnheader', {name: /node1/})).toBeInTheDocument();
        expect(screen.getByRole('columnheader', {name: /node2/})).toBeInTheDocument();

        const row1 = objectRow('test-ns/svc/test1');
        const node1 = nodeCell(row1, 0);
        expect(node1.querySelector('[data-state]')).toHaveAttribute('data-state', 'up');
        expect(within(node1).getByText('running')).toHaveClass('text-ink-muted', 'whitespace-nowrap');
        expect(within(node1).queryByTitle('frozen')).not.toBeInTheDocument();
        const node2 = nodeCell(row1, 1);
        expect(node2.querySelector('[data-state]')).toHaveAttribute('data-state', 'down');
        expect(within(node2).getByTitle('frozen')).toBeInTheDocument();
        // An idle instance shows no monitor state.
        expect(within(node2).queryByText('idle')).not.toBeInTheDocument();

        const row2 = objectRow('test-ns/svc/test2');
        expect(within(nodeCell(row2, 0)).getByText('failed')).toBeInTheDocument();
        // No instance on that node: an empty cell.
        expect(nodeCell(row2, 1)).toBeEmptyDOMElement();

        const unprovisioned = objectRow('test-ns/svc/unprovisioned(?!-bool)');
        const unprovisionedNode = nodeCell(unprovisioned, 0);
        expect(unprovisionedNode.querySelector('[data-state]')).toHaveAttribute('data-state', 'unknown');
        expect(within(unprovisionedNode).getByRole('img', {name: 'Not provisioned'})).toHaveClass('text-state-down');
    });

    test('selection and select all', async () => {
        setup();
        await waitForLoad();
        const cb = selectRow('test-ns/svc/test1');
        expect(cb).toBeChecked();
        expect(screen.getByText('1 selected')).toBeInTheDocument();
        const selectAll = screen.getByRole('checkbox', {name: 'Select all objects'});
        expect(selectAll).not.toBeChecked();
        fireEvent.click(selectAll);
        expect(selectAll).toBeChecked();
        rowCheckboxes().forEach((c) => expect(c).toBeChecked());
        expect(screen.getByText(`${rowCheckboxes().length} selected`)).toBeInTheDocument();
        fireEvent.click(selectAll);
        rowCheckboxes().forEach((c) => expect(c).not.toBeChecked());
        expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
    });

    test('select all selects the filtered objects only', async () => {
        setup();
        await waitForLoad();
        fireEvent.change(screen.getByLabelText('Name'), {target: {value: 'test1'}});
        await waitFor(() => expect(rowCheckboxes()).toHaveLength(1));
        fireEvent.click(screen.getByRole('checkbox', {name: 'Select all objects'}));
        expect(screen.getByText('1 selected')).toBeInTheDocument();
    });

    test('actions menu opens and lists actions', async () => {
        setup();
        await waitForLoad();
        selectRow('test-ns/svc/test1');
        openActionsMenu();
        const menu = await screen.findByRole('menu');
        ['Restart', 'Stop', 'Freeze', 'Delete'].forEach((a) =>
            expect(within(menu).getByRole('menuitem', {name: a})).toBeEnabled()
        );
        // The destructive actions carry the down colour on their icon.
        expect(within(menu).getByRole('menuitem', {name: 'Delete'}).querySelector('.text-state-down')).not.toBeNull();
        expect(within(menu).getByRole('menuitem', {name: 'Restart'}).querySelector('.text-state-down')).toBeNull();
    });

    test('global actions menu disables actions not allowed for the selection', async () => {
        setup({
            objectStatus: {
                ...defaultState.objectStatus,
                'test-ns/cfg/conf1': {avail: 'n/a', frozen: 'unfrozen', provisioned: 'true'},
            },
        });
        await waitForLoad();
        selectRow('test-ns/cfg/conf1');
        openActionsMenu();
        const menu = await screen.findByRole('menu');
        const items = within(menu).getAllByRole('menuitem');
        expect(items).toHaveLength(12);
        expect(within(menu).getByRole('menuitem', {name: 'Start'})).toBeDisabled();
        expect(within(menu).getByRole('menuitem', {name: 'Freeze'})).toBeDisabled();
        expect(within(menu).getByRole('menuitem', {name: 'Delete'})).toBeEnabled();
        expect(within(menu).getByRole('menuitem', {name: 'Abort'})).toBeEnabled();
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
                visible: ['test-ns/svc/unprovisioned(?!-bool)', 'test-ns/svc/unprovisioned-bool'],
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

        test('unchecking a Global State option removes that filter', async () => {
            setup();
            await waitForLoad();
            await selectFilter('Global State', 'Up');
            await waitFor(() => expect(screen.queryByRole('row', {name: /test-ns\/svc\/test2/})).not.toBeInTheDocument());
            expect(filterSummary('Global State')).toHaveTextContent('Global StateUp');
            fireEvent.click(filterOption('Global State', 'Up'));
            await waitFor(() => expect(filterOption('Global State', 'Up')).not.toBeChecked());
            expect(filterSummary('Global State')).toHaveTextContent('Global StateAll');
            await waitFor(() => expect(screen.getByRole('row', {name: /test-ns\/svc\/test2/})).toBeInTheDocument());
        });

        test('filter popovers list the global states, namespaces and kinds on offer', async () => {
            setup();
            await waitForLoad();
            expect(within(filterGroup('Global State')).getAllByRole('checkbox').map(optionText))
                .toEqual(['Up', 'Down', 'Warn', 'N/a', 'Unprovisioned']);
            expect(within(filterGroup('Namespace')).getAllByRole('checkbox').map(optionText))
                .toEqual(['root', 'test-ns']);
            expect(within(filterGroup('Kind')).getAllByRole('checkbox').map(optionText))
                .toEqual(['svc']);
            // Each global state carries its mark.
            expect(filterOption('Global State', 'Up').closest('label').querySelector('[data-state="up"]')).not.toBeNull();
            expect(filterOption('Global State', 'N/a').closest('label').querySelector('[data-state="unknown"]')).not.toBeNull();
            expect(filterOption('Global State', 'Unprovisioned').closest('label').querySelector('svg.text-state-down')).not.toBeNull();
        });

        test('filter popover opens from its summary and closes on Escape or a click outside', async () => {
            setup();
            await waitForLoad();
            const details = filterGroup('Namespace').closest('details');
            expect(details.open).toBe(false);
            fireEvent.click(filterSummary('Namespace'));
            expect(details.open).toBe(true);
            fireEvent.keyDown(filterOption('Namespace', 'root'), {key: 'Escape'});
            expect(details.open).toBe(false);
            expect(filterSummary('Namespace')).toHaveFocus();
            fireEvent.click(filterSummary('Namespace'));
            expect(details.open).toBe(true);
            fireEvent.pointerDown(filterOption('Namespace', 'root'));
            expect(details.open).toBe(true);
            fireEvent.pointerDown(document.body);
            expect(details.open).toBe(false);
        });

        test('summary lists the chosen values', async () => {
            setup();
            await waitForLoad();
            expect(filterSummary('Namespace')).toHaveTextContent('NamespaceAll');
            await selectFilter('Namespace', 'test-ns');
            await selectFilter('Namespace', 'root');
            expect(filterSummary('Namespace')).toHaveTextContent('Namespacetest-ns, root');
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

    test('unchecking a Namespace option restores the filtered objects', async () => {
        setup();
        await waitForLoad();
        await selectFilter('Namespace', 'test-ns');
        await waitFor(() =>
            expect(screen.queryByRole('row', {name: /root\/svc\/test3/})).not.toBeInTheDocument()
        );
        fireEvent.click(filterOption('Namespace', 'test-ns'));
        await waitFor(() =>
            expect(screen.getByRole('row', {name: /root\/svc\/test3/})).toBeInTheDocument()
        );
    });

    test('unchecking a Global State option restores filtered objects', async () => {
        setup();
        await waitForLoad();
        await selectFilter('Global State', 'Up');
        await waitFor(() =>
            expect(screen.queryByRole('row', {name: /test-ns\/svc\/test2/})).not.toBeInTheDocument()
        );
        fireEvent.click(filterOption('Global State', 'Up'));
        await waitFor(() =>
            expect(screen.getByRole('row', {name: /test-ns\/svc\/test2/})).toBeInTheDocument()
        );
    });

    test('unchecking a Kind option keeps the other filters', async () => {
        setup();
        await waitForLoad();
        await selectFilter('Kind', 'svc');
        await selectFilter('Namespace', 'test-ns');
        await waitFor(() =>
            expect(screen.queryByRole('row', {name: /root\/svc\/test3/})).not.toBeInTheDocument()
        );
        fireEvent.click(filterOption('Kind', 'svc'));
        await waitFor(() => expect(filterOption('Kind', 'svc')).not.toBeChecked());
        expect(screen.queryByRole('row', {name: /root\/svc\/test3/})).not.toBeInTheDocument();
        fireEvent.click(filterOption('Namespace', 'test-ns'));
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
                expect(screen.getByRole('status')).toHaveTextContent(/'restart' succeeded on 1 object\(s\)\./i)
            );
            expect(getFeedback()).toHaveClass('text-state-up');
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
            await waitFor(() => expect(getFeedback()).toHaveTextContent(/'restart'/));
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

    // ─── svc-only enable / disable ───────────────────────────────────────
    describe('svc enable/disable actions', () => {
        test('Enable and Disable appear in the bulk menu when svc objects are selected', async () => {
            setup();
            await waitForLoad();
            selectRow('test-ns/svc/test1');
            openActionsMenu();
            const menu = await screen.findByRole('menu');
            expect(within(menu).getByRole('menuitem', {name: /^Enable$/})).toBeEnabled();
            expect(within(menu).getByRole('menuitem', {name: /^Disable$/})).toBeEnabled();
        });


        test('Enable URL uses the object-path endpoint (no /action prefix)', async () => {
            setup();
            await waitForLoad();
            selectRow('test-ns/svc/test1');
            openActionsMenu();
            await clickMenuItem('Enable');
            await confirmDialog(/Confirm/i);
            await waitFor(() =>
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringMatching(/test-ns\/svc\/test1\/enable$/),
                    expect.any(Object)
                )
            );
        });

        test('Disable URL uses the object-path endpoint (no /action prefix)', async () => {
            setup();
            await waitForLoad();
            selectRow('test-ns/svc/test1');
            openActionsMenu();
            await clickMenuItem('Disable');
            await confirmDialog(/Confirm/i);
            await waitFor(() =>
                expect(global.fetch).toHaveBeenCalledWith(
                    expect.stringMatching(/test-ns\/svc\/test1\/disable$/),
                    expect.any(Object)
                )
            );
        });


        test('Enable/Disable not offered when a mixed-kind selection is made', async () => {
            setup({
                objectStatus: {
                    ...defaultState.objectStatus,
                    'test-ns/cfg/cfg1': {avail: 'up', frozen: 'unfrozen', provisioned: 'true'},
                },
                objectInstanceStatus: {
                    ...defaultState.objectInstanceStatus,
                    'test-ns/cfg/cfg1': {node1: {avail: 'up'}},
                },
            });
            await waitForLoad();
            selectRow('test-ns/svc/test1');
            selectRow('test-ns/cfg/cfg1');
            openActionsMenu();
            const menu = await screen.findByRole('menu');
            expect(within(menu).queryByRole('menuitem', {name: /^Enable$/})).not.toBeInTheDocument();
            expect(within(menu).queryByRole('menuitem', {name: /^Disable$/})).not.toBeInTheDocument();
        });
    });

    describe('per-node stopped and RPO-breached indicators', () => {
        const wideScreen = {isWideScreen: true, isMobile: false};

        /** One object with one instance on node1; returns the node1 cell. */
        const setupNode = async (nodeStatus) => {
            setup(
                {
                    objectStatus: {
                        'test-ns/svc/test1': {avail: 'up', frozen: 'unfrozen', provisioned: 'true'},
                    },
                    objectInstanceStatus: {
                        'test-ns/svc/test1': {node1: nodeStatus},
                    },
                },
                '',
                wideScreen,
            );
            await waitForLoad();
            return nodeCell(objectRow('test-ns/svc/test1'), 0);
        };

        const stoppedMark = (cell) => within(cell).queryByRole('img', {name: 'Stopped'});
        const rpoMark = (cell) => within(cell).queryByRole('img', {name: 'RPO breached'});
        const frozenMark = (cell) => within(cell).queryByTitle('frozen');
        const availState = (cell) => cell.querySelector('[data-state]')?.getAttribute('data-state');

        test('shows the stopped indicator when stopped_at is set', async () => {
            const cell = await setupNode({
                avail: 'down',
                frozen_at: '0001-01-01T00:00:00Z',
                stopped_at: '2025-05-16T10:00:00Z',
            });
            const mark = stoppedMark(cell);
            expect(mark).toBeInTheDocument();
            expect(mark).toHaveAttribute('title', `stopped at ${new Date('2025-05-16T10:00:00Z').toLocaleString(i18n.language)}`);
            expect(mark.querySelector('svg')).not.toBeNull();
        });

        test('does not show the stopped indicator when stopped_at is the zero sentinel', async () => {
            const cell = await setupNode({
                avail: 'up',
                frozen_at: '0001-01-01T00:00:00Z',
                stopped_at: '0001-01-01T00:00:00Z',
            });
            expect(stoppedMark(cell)).not.toBeInTheDocument();
        });

        test('does not show the stopped indicator when stopped_at is missing', async () => {
            const cell = await setupNode({
                avail: 'up',
                frozen_at: '0001-01-01T00:00:00Z',
            });
            expect(stoppedMark(cell)).not.toBeInTheDocument();
        });

        test('keeps the availability mark visible alongside the stopped indicator', async () => {
            const cell = await setupNode({
                avail: 'down',
                frozen_at: '0001-01-01T00:00:00Z',
                stopped_at: '2025-05-16T10:00:00Z',
            });
            // The availability mark (down) must still be rendered
            expect(availState(cell)).toBe('down');
            expect(within(cell).getByTitle('down')).toBeInTheDocument();
            // And the stopped indicator beside it
            expect(stoppedMark(cell)).toBeInTheDocument();
        });

        test('shows the RPO-breached indicator when rpo_breached_at is set', async () => {
            const cell = await setupNode({
                avail: 'up',
                frozen_at: '0001-01-01T00:00:00Z',
                rpo_breached_at: '2025-05-16T10:00:00Z',
            });
            const mark = rpoMark(cell);
            expect(mark).toBeInTheDocument();
            expect(mark).toHaveAttribute('title', 'RPO breached');
            expect(mark).toHaveClass('text-state-warn');
        });

        test('does not show the RPO-breached indicator when rpo_breached_at is the zero sentinel', async () => {
            const cell = await setupNode({
                avail: 'up',
                frozen_at: '0001-01-01T00:00:00Z',
                rpo_breached_at: '0001-01-01T00:00:00Z',
            });
            expect(rpoMark(cell)).not.toBeInTheDocument();
        });

        test('does not show the RPO-breached indicator when rpo_breached_at is missing', async () => {
            const cell = await setupNode({
                avail: 'up',
                frozen_at: '0001-01-01T00:00:00Z',
            });
            expect(rpoMark(cell)).not.toBeInTheDocument();
        });

        test('RPO-breached takes precedence over frozen when both are set', async () => {
            const cell = await setupNode({
                avail: 'up',
                frozen_at: '2025-05-16T10:00:00Z',
                rpo_breached_at: '2025-05-16T10:00:00Z',
            });
            expect(rpoMark(cell)).toBeInTheDocument();
            expect(frozenMark(cell)).not.toBeInTheDocument();
        });

        test('frozen is shown when only frozen_at is set', async () => {
            const cell = await setupNode({
                avail: 'up',
                frozen_at: '2025-05-16T10:00:00Z',
                rpo_breached_at: '0001-01-01T00:00:00Z',
            });
            expect(frozenMark(cell)).toBeInTheDocument();
            expect(rpoMark(cell)).not.toBeInTheDocument();
        });

        test('availability, stopped and RPO-breached indicators are visible simultaneously', async () => {
            const cell = await setupNode({
                avail: 'down',
                frozen_at: '0001-01-01T00:00:00Z',
                stopped_at: '2025-05-16T10:00:00Z',
                rpo_breached_at: '2025-05-16T10:00:00Z',
            });
            expect(availState(cell)).toBe('down');
            expect(stoppedMark(cell)).toBeInTheDocument();
            expect(rpoMark(cell)).toBeInTheDocument();
        });

        test('stopped and RPO-breached indicators are shown together', async () => {
            const cell = await setupNode({
                avail: 'down',
                frozen_at: '0001-01-01T00:00:00Z',
                stopped_at: '2025-05-16T10:00:00Z',
                rpo_breached_at: '2025-05-16T10:00:00Z',
            });
            expect(stoppedMark(cell)).toBeInTheDocument();
            expect(rpoMark(cell)).toBeInTheDocument();
        });

        test('no indicators are shown for a healthy node', async () => {
            const cell = await setupNode({
                avail: 'up',
                frozen_at: '0001-01-01T00:00:00Z',
                stopped_at: '0001-01-01T00:00:00Z',
                rpo_breached_at: '0001-01-01T00:00:00Z',
            });
            expect(availState(cell)).toBe('up');
            expect(within(cell).getByTitle('up')).toBeInTheDocument();
            expect(stoppedMark(cell)).not.toBeInTheDocument();
            expect(rpoMark(cell)).not.toBeInTheDocument();
            expect(frozenMark(cell)).not.toBeInTheDocument();
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






    test('global actions disabled when none selected', async () => {
        setup();
        await waitForLoad();
        expect(screen.getByRole('button', {name: /actions on selected objects/i})).toBeDisabled();
    });

    test('filters are always visible', async () => {
        setup();
        await waitForLoad();
        expect(filterGroup('Namespace')).toBeInTheDocument();
        expect(filterGroup('Global State')).toBeInTheDocument();
        expect(filterGroup('Kind')).toBeInTheDocument();
        expect(screen.getByLabelText('Name')).toBeInTheDocument();
    });

    test('not mobile: no filter toggle, filters shown', async () => {
        setup({}, '', {isWideScreen: false, isMobile: false});
        await waitForLoad();
        expect(screen.queryByRole('button', {name: /show filters|hide filters/i})).not.toBeInTheDocument();
        expect(filterGroup('Namespace')).toBeInTheDocument();
    });

    test('mobile: filters hidden initially and toggle button works', async () => {
        setup({}, '', {isWideScreen: false, isMobile: true});
        await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
        expect(queryFilterGroup('Namespace')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
        const toggleButton = screen.getByRole('button', {name: /show filters/i});
        expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(toggleButton);
        await waitFor(() => expect(filterGroup('Namespace')).toBeInTheDocument());
        const hideButton = screen.getByRole('button', {name: /hide filters/i});
        expect(hideButton).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(hideButton);
        await waitFor(() => expect(queryFilterGroup('Namespace')).not.toBeInTheDocument());
    });

    test('mobile on a wide screen: filters shown at first', async () => {
        setup({}, '', {isWideScreen: true, isMobile: true});
        await waitForLoad();
        expect(screen.getByRole('button', {name: /hide filters/i})).toBeInTheDocument();
    });

    describe('sorting', () => {
        test('Status sorting cycles the state put first', async () => {
            setup();
            await waitForLoad();
            expect(screen.getByRole('columnheader', {name: /^Status/})).toHaveAttribute('aria-sort', 'none');
            clickHeader('Status');
            await waitFor(() =>
                expect(screen.getByRole('columnheader', {name: /^Status/})).toHaveAttribute('aria-sort', 'ascending')
            );
            // First cycle: n/a first, then up, warn, down.
            await waitFor(() => expect(objectNamesInOrder()[0]).toMatch(/test4|unprovisioned/));
            expect(objectNamesInOrder().at(-1)).toBe('test-ns/svc/test2');
            clickHeader('Status');
            // Next cycle: up first.
            await waitFor(() => expect(objectNamesInOrder()[0]).toBe('test-ns/svc/test1'));
            expect(screen.getByRole('columnheader', {name: /^Status/})).toHaveAttribute('aria-sort', 'ascending');
        });

        test('Object sorting toggles the direction', async () => {
            setup();
            await waitForLoad();
            expect(screen.getByRole('columnheader', {name: /^Object/})).toHaveAttribute('aria-sort', 'ascending');
            expect(objectNamesInOrder()[0]).toBe('root/svc/test3');
            clickHeader('Object');
            await waitFor(() =>
                expect(screen.getByRole('columnheader', {name: /^Object/})).toHaveAttribute('aria-sort', 'descending')
            );
            await waitFor(() => expect(objectNamesInOrder()[0]).toBe('test-ns/svc/unprovisioned-bool'));
        });

        test('node column sorting orders by the avail on that node', async () => {
            setup({}, '', {isWideScreen: true, isMobile: false});
            await waitForLoad();
            clickHeader('node1');
            await waitFor(() =>
                expect(screen.getByRole('columnheader', {name: /^node1/})).toHaveAttribute('aria-sort', 'ascending')
            );
            await waitFor(() => expect(objectNamesInOrder().at(-1)).toBe('test-ns/svc/test2'));
            clickHeader('node1');
            await waitFor(() => expect(objectNamesInOrder()[0]).toBe('test-ns/svc/test1'));
        });
    });

    describe('infinite scroll', () => {
        test('loads more items when scrolled past 80%', async () => {
            setup(makeMany(50), '', {isWideScreen: true, isMobile: false});
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
            setup(makeMany(50), '', {isWideScreen: true, isMobile: false});
            await waitForLoad();
            const container = getScrollContainer();
            setScroll(container, 500);
            fireEvent.scroll(container);
            await waitFor(() => expect(loadingMore()).toBeInTheDocument());
            await waitFor(() => expect(loadingMore()).not.toBeInTheDocument());
        });

        test('scroll does nothing when no more items', async () => {
            setup({objectStatus: {'a/b': {avail: 'up'}}, objectInstanceStatus: {}}, '', {
                isWideScreen: true,
                isMobile: false
            });
            await waitForLoad();
            const container = getScrollContainer();
            fireEvent.scroll(container);
            expect(loadingMore()).not.toBeInTheDocument();
        });

        test('scroll is ignored while a load is already in progress', async () => {
            setup(makeMany(80), '', {isWideScreen: true, isMobile: false});
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
            setup(makeMany(50), '', {isWideScreen: true, isMobile: false});
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
            expect(filterOption('Namespace', 'test-ns')).toBeChecked();
            expect(filterOption('Kind', 'svc')).toBeChecked();
            expect(screen.getByLabelText('Name')).toHaveValue('test1');
        });
        expect(filterOption('Namespace', 'root')).not.toBeChecked();
        expect(filterSummary('Namespace')).toHaveTextContent('Namespacetest-ns');
        expect(filterSummary('Kind')).toHaveTextContent('Kindsvc');
    });

    test('URL globalState param hydrates selected global states on mount', async () => {
        setup({}, '?globalState=up,down');
        await waitForLoad();
        await waitFor(() => {
            expect(screen.getByRole('row', {name: /test-ns\/svc\/test1/})).toBeInTheDocument();
            expect(screen.getByRole('row', {name: /test-ns\/svc\/test2/})).toBeInTheDocument();
            expect(screen.queryByRole('row', {name: /root\/svc\/test3/})).not.toBeInTheDocument();
        });
        expect(filterOption('Global State', 'Up')).toBeChecked();
        expect(filterOption('Global State', 'Down')).toBeChecked();
        expect(filterOption('Global State', 'Warn')).not.toBeChecked();
    });

    test('unknown globalState URL value is offered as an option without a status mark, and can be removed', async () => {
        setup({}, '?globalState=bogus');
        await waitForLoad();
        const bogus = filterOption('Global State', 'Bogus');
        expect(bogus).toBeChecked();
        expect(bogus.closest('label').querySelector('[data-state], svg')).toBeNull();
        expect(filterSummary('Global State')).toHaveTextContent('Global StateBogus');
        await waitFor(() => expect(screen.getByText(/No objects found/)).toBeInTheDocument());
        fireEvent.click(bogus);
        await waitFor(() => expect(screen.getByRole('row', {name: /test-ns\/svc\/test1/})).toBeInTheDocument());
    });

    test('URL namespace absent from the data stays offered and checked', async () => {
        setup({}, '?namespace=ghost');
        await waitForLoad();
        expect(filterOption('Namespace', 'ghost')).toBeChecked();
        await waitFor(() => expect(screen.getByText(/No objects found/)).toBeInTheDocument());
    });

    test('URL sync writes every filter, comma-joined', async () => {
        vi.useFakeTimers();
        try {
            setup();
            fireEvent.click(filterOption('Global State', 'Up'));
            fireEvent.click(filterOption('Global State', 'Unprovisioned'));
            fireEvent.click(filterOption('Namespace', 'test-ns'));
            fireEvent.click(filterOption('Kind', 'svc'));
            fireEvent.change(screen.getByLabelText('Name'), {target: {value: ' te '}});
            act(() => {
                vi.advanceTimersByTime(300);
            });
            expect(mockNavigate).toHaveBeenCalledWith(
                '/objects?globalState=up%2Cunprovisioned&namespace=test-ns&kind=svc&name=te',
                {replace: true}
            );
        } finally {
            vi.useRealTimers();
        }
    });

    test('feedback closes with its Close button', async () => {
        setup();
        await waitForLoad();
        selectRow('test-ns/svc/test1');
        openActionsMenu();
        await clickMenuItem('Restart');
        await confirmDialog();
        await waitFor(() => expect(getFeedback()).toHaveTextContent(/succeeded/i));
        fireEvent.click(screen.getByRole('button', {name: 'Close'}));
        await waitFor(() => expect(screen.queryByText(/succeeded/i)).not.toBeInTheDocument());
    });

    test('feedback hides itself after 4 seconds', async () => {
        setup();
        await waitForLoad();
        vi.useFakeTimers();
        try {
            selectRow('test-ns/svc/test1');
            openActionsMenu();
            await clickMenuItem('Restart');
            fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', {name: /Confirm/i}));
            await act(async () => {
                await vi.advanceTimersByTimeAsync(0);
            });
            expect(getFeedback()).toHaveTextContent(/succeeded/i);
            await act(async () => {
                await vi.advanceTimersByTimeAsync(3900);
            });
            expect(screen.getByText(/succeeded/i)).toBeInTheDocument();
            await act(async () => {
                await vi.advanceTimersByTimeAsync(200);
            });
            expect(screen.queryByText(/succeeded/i)).not.toBeInTheDocument();
        } finally {
            vi.useRealTimers();
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
        setup({}, '', {isWideScreen: false, isMobile: false});
        await waitForLoad();
        expect(screen.queryByRole('columnheader', {name: /node1/})).not.toBeInTheDocument();
    });

    test('daemon fallback when store empty', async () => {
        setup(
            {objectStatus: {}, objectInstanceStatus: {}},
            '',
            {isWideScreen: true, isMobile: false},
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
            {isWideScreen: true, isMobile: false},
            {daemon: {cluster: {object: {}}}}
        );
        await waitForLoad();
        await waitFor(() => expect(screen.getByText(/No objects found/)).toBeInTheDocument());
    });

    test('unprovisioned object icon is shown', async () => {
        setup({}, '', {isWideScreen: true, isMobile: false});
        await waitForLoad();
        ['test-ns/svc/unprovisioned(?!-bool)', 'test-ns/svc/unprovisioned-bool'].forEach((name) => {
            const mark = within(statusCell(objectRow(name))).getByRole('img', {name: 'Not provisioned'});
            expect(mark).toHaveAttribute('title', 'Not provisioned');
            expect(mark).toHaveClass('text-state-down');
        });
        expect(within(statusCell(objectRow('test-ns/svc/test1'))).queryByRole('img', {name: 'Not provisioned'}))
            .not.toBeInTheDocument();
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
        setup(customState, '', {isWideScreen: true, isMobile: false});
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
        setup(stateWithNonObject, '', {isWideScreen: true, isMobile: false});
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
        setup(makeMany(50), '', {isWideScreen: true, isMobile: false});
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

    describe('filter option toggle handlers (add branch coverage)', () => {
        test.each([
            ['Global State', 'Up'],
            ['Namespace', 'test-ns'],
            ['Kind', 'svc'],
        ])('rapidly toggling a %s option twice re-adds it', async (label, option) => {
            setup({}, '', {isWideScreen: true, isMobile: false});
            await waitForLoad();
            await selectFilter(label, option);
            const checkbox = filterOption(label, option);
            expect(checkbox).toBeChecked();
            act(() => {
                fireEvent.click(checkbox);
                fireEvent.click(checkbox);
            });
            await waitFor(() => expect(filterOption(label, option)).toBeChecked());
            expect(filterSummary(label)).toHaveTextContent(new RegExp(`${option}$`));
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
