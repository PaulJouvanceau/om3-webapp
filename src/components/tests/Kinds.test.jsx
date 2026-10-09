import React from 'react';
import {render, screen, fireEvent, waitFor, act, within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {vi} from 'vitest';
import Kinds from '../Kinds';
import i18n from '../../i18n';

// ── Hoisted mock variables ──────────────────────────────────────────────
const {
    mockNavigate,
    mockUseNavigate,
    mockUseLocation,
    mockStartEventReception,
    mockCloseEventSource,
    mockUseEventStore,
    mockUseKindData,
} = vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    mockUseNavigate: vi.fn(() => mockNavigate),
    mockUseLocation: vi.fn(() => ({pathname: '/kinds', search: ''})),
    mockStartEventReception: vi.fn(),
    mockCloseEventSource: vi.fn(),
    mockUseEventStore: vi.fn(),
    mockUseKindData: vi.fn(),
}));

// ── Mocks ───────────────────────────────────────────────────────────────
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useNavigate: mockUseNavigate,
        useLocation: mockUseLocation,
    };
});

vi.mock('../../hooks/useEventStore.js', () => ({
    __esModule: true,
    default: mockUseEventStore,
}));

vi.mock('../../eventSourceManager.jsx', () => ({
    startEventReception: mockStartEventReception,
    closeEventSource: mockCloseEventSource,
}));

vi.mock('../../hooks/useKindData', () => ({
    useKindData: mockUseKindData,
}));

// ── Helpers ─────────────────────────────────────────────────────────────
// The sort button of a column header (its arrow is hidden from the accessible name).
const getHeaderCellFor = (columnName) => screen.getByRole('button', {name: columnName});

const getColumnHeader = (columnName) =>
    screen.getAllByRole('columnheader').find(th => within(th).queryByRole('button', {name: columnName}));

const getBody = () => screen.getAllByRole('rowgroup')[1];

const getBodyRows = () => within(getBody()).getAllByRole('row');

const getCells = (row) => within(row).getAllByRole('cell');

const getFilter = () => screen.getByRole('combobox', {name: /Filter by/i});

const buildStatusByKind = (definitions) => {
    const statusByKind = {};
    Object.entries(definitions).forEach(([kind, counts]) => {
        statusByKind[kind] = {
            up: counts.up || 0,
            down: counts.down || 0,
            warn: counts.warn || 0,
            unprovisioned: counts.unprovisioned || 0,
        };
    });
    return statusByKind;
};

const defaultMockData = {
    statusByKind: buildStatusByKind({
        service: {up: 2, down: 1, warn: 1, unprovisioned: 0},
        deployment: {up: 3, down: 0, warn: 2, unprovisioned: 1},
        pod: {up: 0, down: 0, warn: 0, unprovisioned: 2},
    }),
    kinds: ['service', 'deployment', 'pod'],
};

const sortingMockData = {
    statusByKind: buildStatusByKind({
        alpha: {up: 1, down: 2, warn: 3, unprovisioned: 0},
        beta: {up: 4, down: 0, warn: 1, unprovisioned: 1},
        gamma: {up: 2, down: 0, warn: 0, unprovisioned: 5},
        delta: {up: 3, down: 3, warn: 0, unprovisioned: 0},
    }),
    kinds: ['alpha', 'beta', 'gamma', 'delta'],
};

function setup(overrides = {}) {
    const {
        pathname = '/kinds',
        search = '',
        data = defaultMockData,
        token = 'valid-token',
    } = overrides;

    vi.clearAllMocks();
    Storage.prototype.getItem = vi.fn(() => token);
    mockUseNavigate.mockReturnValue(mockNavigate);
    mockUseLocation.mockReturnValue({pathname, search});
    mockUseEventStore.mockImplementation((selector) => selector({objectStatus: {}}));
    mockUseKindData.mockReturnValue(data);
}

function renderComponent() {
    return render(
        <MemoryRouter>
            <Kinds/>
        </MemoryRouter>
    );
}

// ── Tests ───────────────────────────────────────────────────────────────
describe('Kinds', () => {
    beforeEach(() => setup());

    test('renders table with headers', () => {
        renderComponent();
        expect(screen.getByRole('table')).toBeInTheDocument();
        ['Kind', 'Up', 'Down', 'Warn', 'Unprovisioned', 'Total'].forEach(text =>
            expect(screen.getByRole('columnheader', {name: text})).toBeInTheDocument()
        );
    });

    test('speaks French to a French browser', async () => {
        await i18n.changeLanguage('fr');
        try {
            renderComponent();
            expect(screen.getByRole('columnheader', {name: 'Non provisionné'})).toBeInTheDocument();
            expect(screen.getByLabelText("Filtrer par kind")).toBeInTheDocument();
        } finally {
            await i18n.changeLanguage('en');
        }
    });

    test('displays kind counts correctly', () => {
        renderComponent();
        const serviceRow = screen.getByRole('row', {name: /service/i});
        const cells = getCells(serviceRow);
        // cells: kind, up, down, warn, unprovisioned, total
        expect(cells[0]).toHaveTextContent('service');
        expect(cells[1]).toHaveTextContent('2');
        expect(cells[2]).toHaveTextContent('1');
        expect(cells[3]).toHaveTextContent('1');
        expect(cells[4]).toHaveTextContent('0');
        expect(cells[5]).toHaveTextContent('4'); // 2+1+1+0
    });

    test('shows status marks by state', () => {
        renderComponent();
        const serviceRow = screen.getByRole('row', {name: /service/i});
        const marks = serviceRow.querySelectorAll('[data-state]');
        // up, down, warn, unprovisioned (unprovisioned in the down state)
        expect([...marks].map(mark => mark.getAttribute('data-state'))).toEqual(['up', 'down', 'warn', 'down']);
        expect(marks[0]).toHaveTextContent('up');
        expect(marks[1]).toHaveTextContent('down');
        expect(marks[2]).toHaveTextContent('warn');
        expect(marks[3]).toHaveTextContent('unprovisioned');
        expect(marks[0]).toHaveClass('text-state-up');
        expect(marks[1]).toHaveClass('text-state-down');
        expect(marks[2]).toHaveClass('text-state-warn');
        expect(marks[3]).toHaveClass('text-state-down');
    });

    test('navigates to objects on row click', () => {
        renderComponent();
        fireEvent.click(screen.getByRole('row', {name: /service/i}));
        expect(mockNavigate).toHaveBeenCalledWith('/objects?kind=service');
    });

    test('navigates to objects on row Enter key', () => {
        renderComponent();
        fireEvent.keyDown(screen.getByRole('row', {name: /service/i}), {key: 'Enter'});
        expect(mockNavigate).toHaveBeenCalledWith('/objects?kind=service');
    });

    test('navigates with up status on count click', () => {
        renderComponent();
        fireEvent.click(screen.getByRole('button', {name: 'Show the 2 up objects of service'}));
        expect(mockNavigate).toHaveBeenCalledWith('/objects?kind=service&globalState=up');
        // the click does not reach the row
        expect(mockNavigate).toHaveBeenCalledTimes(1);
    });

    test('navigates with down status', () => {
        renderComponent();
        fireEvent.click(screen.getByRole('button', {name: 'Show the 1 down object of service'}));
        expect(mockNavigate).toHaveBeenCalledWith('/objects?kind=service&globalState=down');
        expect(mockNavigate).toHaveBeenCalledTimes(1);
    });

    test('navigates with warn status', () => {
        renderComponent();
        fireEvent.click(screen.getByRole('button', {name: 'Show the 1 warn object of service'}));
        expect(mockNavigate).toHaveBeenCalledWith('/objects?kind=service&globalState=warn');
        expect(mockNavigate).toHaveBeenCalledTimes(1);
    });

    test('navigates with unprovisioned status', () => {
        renderComponent();
        fireEvent.click(screen.getByRole('button', {name: 'Show the 2 unprovisioned objects of pod'}));
        expect(mockNavigate).toHaveBeenCalledWith('/objects?kind=pod&globalState=unprovisioned');
        expect(mockNavigate).toHaveBeenCalledTimes(1);
    });

    test('starts event reception on mount with token', async () => {
        renderComponent();
        await waitFor(() => {
            expect(mockStartEventReception).toHaveBeenCalledWith(
                'valid-token',
                ['ObjectStatusUpdated', 'InstanceStatusUpdated', 'ObjectDeleted', 'InstanceConfigUpdated']
            );
        });
    });

    test('closes event source on unmount', async () => {
        const {unmount} = renderComponent();
        await act(() => unmount());
        expect(mockCloseEventSource).toHaveBeenCalled();
    });

    test('does not start event reception without token', () => {
        setup({token: null});
        renderComponent();
        expect(mockStartEventReception).not.toHaveBeenCalled();
    });

    test('shows no kinds message when empty', () => {
        setup({data: {statusByKind: {}, kinds: []}});
        renderComponent();
        expect(screen.getByTestId('no-kinds-message')).toHaveTextContent('No kinds available');
    });

    test('shows filter mismatch message', () => {
        setup({data: {statusByKind: {}, kinds: []}, search: '?kind=nonexistent'});
        renderComponent();
        expect(screen.getByTestId('no-kinds-message')).toHaveTextContent('No kinds match the selected filter');
        expect(getFilter()).toHaveValue('nonexistent');
    });

    test('lists all and every kind in the filter', () => {
        renderComponent();
        const options = within(getFilter()).getAllByRole('option').map(option => option.value);
        expect(options).toEqual(['all', 'service', 'deployment', 'pod']);
    });

    test('filters by kind via the select', () => {
        renderComponent();
        fireEvent.change(getFilter(), {target: {value: 'deployment'}});
        expect(mockNavigate).toHaveBeenCalledWith('/kinds?kind=deployment');
        expect(getBodyRows()).toHaveLength(1);
        expect(screen.getByRole('row', {name: /deployment/i})).toBeInTheDocument();
    });

    test('resets to all when selecting all', () => {
        setup({search: '?kind=deployment'});
        renderComponent();
        fireEvent.change(getFilter(), {target: {value: 'all'}});
        expect(mockNavigate).toHaveBeenCalledWith('/kinds');
    });

    test('reads initial kind from URL', () => {
        setup({search: '?kind=deployment'});
        renderComponent();
        expect(getFilter()).toHaveValue('deployment');
        expect(getBodyRows()).toHaveLength(1);
    });

    test('handles empty kind parameter in URL', () => {
        setup({search: '?kind='});
        renderComponent();
        expect(getFilter()).toHaveValue('all');
    });

    test('clicking different column resets direction', () => {
        renderComponent();
        fireEvent.click(getHeaderCellFor('Up'));
        fireEvent.click(getHeaderCellFor('Up'));
        expect(getColumnHeader('Up')).toHaveAttribute('aria-sort', 'descending');
        fireEvent.click(getHeaderCellFor('Down'));
        expect(getColumnHeader('Down')).toHaveAttribute('aria-sort', 'ascending');
        expect(getColumnHeader('Up')).toHaveAttribute('aria-sort', 'none');
    });

    test('marks the kind column sorted ascending by default', () => {
        renderComponent();
        expect(getColumnHeader('Kind')).toHaveAttribute('aria-sort', 'ascending');
    });

    describe('sorting order verification', () => {
        beforeEach(() => {
            setup({data: sortingMockData});
            renderComponent();
        });

        const getKindNames = () => {
            const rows = getBodyRows();
            return rows.map(row => within(row).getAllByRole('cell')[0].textContent);
        };

        test('default sort by kind ascending', async () => {
            await waitFor(() => expect(getKindNames()).toEqual(['alpha', 'beta', 'delta', 'gamma']));
        });

        test('sort by Up ascending', async () => {
            fireEvent.click(getHeaderCellFor('Up'));
            await waitFor(() => expect(getKindNames()).toEqual(['alpha', 'gamma', 'delta', 'beta']));
        });

        test('sort by Down ascending', async () => {
            fireEvent.click(getHeaderCellFor('Down'));
            await waitFor(() => {
                const names = getKindNames();
                // beta and gamma both have 0 down, order can vary
                expect(names.slice(0, 2).sort()).toEqual(['beta', 'gamma']);
                expect(names[2]).toBe('alpha');
                expect(names[3]).toBe('delta');
            });
        });

        test('sort by Warn ascending', async () => {
            fireEvent.click(getHeaderCellFor('Warn'));
            await waitFor(() => {
                const names = getKindNames();
                // gamma and delta both have 0 warn, order can vary
                expect(names.slice(0, 2).sort()).toEqual(['delta', 'gamma']);
                expect(names[2]).toBe('beta');
                expect(names[3]).toBe('alpha');
            });
        });

        test('sort by Unprovisioned ascending', async () => {
            fireEvent.click(getHeaderCellFor('Unprovisioned'));
            await waitFor(() => {
                const names = getKindNames();
                // alpha and delta both have 0 unprovisioned
                expect(names.slice(0, 2).sort()).toEqual(['alpha', 'delta']);
                expect(names[2]).toBe('beta');
                expect(names[3]).toBe('gamma');
            });
        });

        test('sort by Total ascending', async () => {
            fireEvent.click(getHeaderCellFor('Total'));
            await waitFor(() => {
                const names = getKindNames();
                // alpha, beta, delta all total 6; gamma total 7
                expect(names.slice(0, 3).sort()).toEqual(['alpha', 'beta', 'delta']);
                expect(names[3]).toBe('gamma');
            });
        });

        test('sort by Kind descending', async () => {
            fireEvent.click(getHeaderCellFor('Kind'));
            await waitFor(() => expect(getKindNames()).toEqual(['gamma', 'delta', 'beta', 'alpha']));
        });
    });

    describe('infinite scroll', () => {
        function generateLargeData(count) {
            const defs = {};
            for (let i = 0; i < count; i++) {
                defs[`kind${i}`] = {up: 1, down: 0, warn: 0, unprovisioned: 0};
            }
            const statusByKind = buildStatusByKind(defs);
            return {statusByKind, kinds: Object.keys(statusByKind)};
        }

        test('loads more kinds on scroll near bottom', async () => {
            vi.useFakeTimers();
            setup({data: generateLargeData(60)});
            renderComponent();
            await screen.findAllByRole('rowgroup');
            let rows = getBodyRows();
            expect(rows).toHaveLength(50);

            const container = screen.getByTestId('table-container');
            Object.defineProperties(container, {
                scrollTop: {value: 800, writable: true},
                scrollHeight: {value: 1000},
                clientHeight: {value: 200},
            });
            fireEvent.scroll(container);
            act(() => {
                vi.advanceTimersByTime(0);
            });
            expect(screen.getByText(/Loading more/i)).toBeInTheDocument();

            act(() => {
                vi.advanceTimersByTime(100);
            });
            await waitFor(() => {
                rows = getBodyRows();
                expect(rows).toHaveLength(60);
            });
            vi.useRealTimers();
        });

        test('does not load more while already loading', () => {
            vi.useFakeTimers();
            setup({data: generateLargeData(60)});
            renderComponent();
            const container = screen.getByTestId('table-container');
            Object.defineProperties(container, {
                scrollTop: {value: 800, writable: true},
                scrollHeight: {value: 1000},
                clientHeight: {value: 200},
            });
            fireEvent.scroll(container);
            act(() => {
                vi.advanceTimersByTime(0);
            });
            expect(screen.getByText(/Loading more/i)).toBeInTheDocument();

            fireEvent.scroll(container);
            act(() => {
                vi.advanceTimersByTime(100);
            });
            expect(getBodyRows()).toHaveLength(60);
            vi.useRealTimers();
        });

        test('does not load more if all visible', () => {
            vi.useFakeTimers();
            setup({data: generateLargeData(40)});
            renderComponent();
            const container = screen.getByTestId('table-container');
            Object.defineProperties(container, {
                scrollTop: {value: 800, writable: true},
                scrollHeight: {value: 1000},
                clientHeight: {value: 200},
            });
            fireEvent.scroll(container);
            act(() => {
                vi.advanceTimersByTime(0);
            });
            expect(screen.queryByText(/Loading more/i)).not.toBeInTheDocument();
            vi.useRealTimers();
        });

        test('removes scroll listener on unmount', () => {
            setup({data: generateLargeData(60)});
            const {unmount} = renderComponent();
            const container = screen.getByTestId('table-container');
            const removeSpy = vi.spyOn(container, 'removeEventListener');
            unmount();
            expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
            removeSpy.mockRestore();
        });
    });

    test('shows unprovisioned objects in the down state', () => {
        const data = {
            statusByKind: buildStatusByKind({testkind: {up: 0, down: 0, warn: 0, unprovisioned: 1}}),
            kinds: ['testkind'],
        };
        setup({data});
        renderComponent();
        const row = screen.getByRole('row', {name: /testkind/i});
        const marks = row.querySelectorAll('[data-state]');
        expect(marks[3]).toHaveAttribute('data-state', 'down');
        expect(marks[3]).toHaveAttribute('title', 'unprovisioned');
        expect(getCells(row)[4]).toHaveTextContent('1');
        expect(getCells(row)[5]).toHaveTextContent('1');
    });

    test('counts a missing status as 0', () => {
        setup({data: {statusByKind: {odd: {up: 1, down: 0, warn: 0}}, kinds: ['odd']}});
        renderComponent();
        expect(screen.getByRole('button', {name: 'Show the 0 unprovisioned objects of odd'})).toHaveTextContent('0');
    });

    test('labels the kind filter', () => {
        renderComponent();
        expect(screen.getByText('Filter by kind')).toBeInTheDocument();
        expect(getFilter()).toBeInTheDocument();
    });
});
