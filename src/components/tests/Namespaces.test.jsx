import React from 'react';
import {render, screen, fireEvent, waitFor, act, within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {vi} from 'vitest';
import Namespaces, {areStatusDotPropsEqual} from '../Namespaces';

// ── Hoisted mock variables ──────────────────────────────────────────────
const {
    mockNavigate,
    mockUseNavigate,
    mockUseLocation,
    mockStartEventReception,
    mockCloseEventSource,
    mockUseEventStore,
    mockUseNamespaceData,
} = vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    mockUseNavigate: vi.fn(() => mockNavigate),
    mockUseLocation: vi.fn(() => ({pathname: '/namespaces', search: ''})),
    mockStartEventReception: vi.fn(),
    mockCloseEventSource: vi.fn(),
    mockUseEventStore: vi.fn(),
    mockUseNamespaceData: vi.fn(),
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

vi.mock('../../hooks/useNamespaceData', () => ({
    useNamespaceData: mockUseNamespaceData,
}));

vi.mock('../NamespaceMetrics', () => ({
    default: ({namespace}) => <div data-testid="namespace-metrics">{namespace}</div>,
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

const buildStatusByNamespace = (objectStatus) => {
    const statusByNamespace = {};
    Object.entries(objectStatus).forEach(([path, data]) => {
        if (!path || !path.includes('/')) return;
        const namespace = path.split('/')[0];
        if (!namespace) return;
        statusByNamespace[namespace] = statusByNamespace[namespace] || {up: 0, down: 0, warn: 0, 'n/a': 0};
        const status = data?.avail;
        const key = ['up', 'down', 'warn'].includes(status) ? status : 'n/a';
        statusByNamespace[namespace][key]++;
    });
    return statusByNamespace;
};

const defaultMockData = {
    statusByNamespace: buildStatusByNamespace({
        'root/svc/service1': {avail: 'up'},
        'root/svc/service2': {avail: 'down'},
        'prod/svc/service3': {avail: 'warn'},
        'prod/svc/service4': {avail: 'up'},
        'dev/svc/service5': {avail: 'up'},
    }),
    namespaces: ['root', 'prod', 'dev'],
};

const sortingMockData = {
    statusByNamespace: buildStatusByNamespace({
        'alpha/svc/a': {avail: 'up'},
        'alpha/svc/b': {avail: 'down'},
        'alpha/svc/c': {avail: 'warn'},
        'alpha/svc/d': {avail: 'n/a'},
        'beta/svc/a': {avail: 'up'},
        'beta/svc/b': {avail: 'up'},
        'beta/svc/c': {avail: 'warn'},
        'gamma/svc/a': {avail: 'down'},
        'gamma/svc/b': {avail: 'down'},
        'gamma/svc/c': {avail: 'warn'},
        'gamma/svc/d': {avail: 'n/a'},
        'delta/svc/a': {avail: 'up'},
        'delta/svc/b': {avail: 'up'},
        'delta/svc/c': {avail: 'up'},
    }),
    namespaces: ['alpha', 'beta', 'gamma', 'delta'],
};

function setup(overrides = {}) {
    const {
        pathname = '/namespaces',
        search = '',
        data = defaultMockData,
        token = 'valid-token',
    } = overrides;

    vi.clearAllMocks();
    Storage.prototype.getItem = vi.fn(() => token);
    mockUseNavigate.mockReturnValue(mockNavigate);
    mockUseLocation.mockReturnValue({pathname, search});
    mockUseEventStore.mockImplementation((selector) => selector({objectStatus: {}}));
    mockUseNamespaceData.mockReturnValue(data);
}

function renderComponent() {
    return render(
        <MemoryRouter>
            <Namespaces/>
        </MemoryRouter>
    );
}

// ── Tests ───────────────────────────────────────────────────────────────
describe('Namespaces', () => {
    beforeEach(() => setup());

    test('renders table with headers', () => {
        renderComponent();
        expect(screen.getByRole('table')).toBeInTheDocument();
        ['Namespace', 'Up', 'Down', 'Warn', 'N/A', 'Total'].forEach(text =>
            expect(screen.getByRole('columnheader', {name: text})).toBeInTheDocument()
        );
    });

    test('displays namespace counts correctly', () => {
        renderComponent();
        const rootRow = screen.getByRole('row', {name: /root/i});
        const cells = getCells(rootRow);
        expect(cells[0]).toHaveTextContent('root');
        expect(cells[1]).toHaveTextContent('1');
        expect(cells[2]).toHaveTextContent('1');
        expect(cells[3]).toHaveTextContent('0');
        expect(cells[4]).toHaveTextContent('0');
        expect(cells[5]).toHaveTextContent('2');
    });

    test('shows status marks by state', () => {
        renderComponent();
        const rootRow = screen.getByRole('row', {name: /root/i});
        const marks = rootRow.querySelectorAll('[data-state]');
        expect([...marks].map(mark => mark.getAttribute('data-state'))).toEqual(['up', 'down', 'warn', 'unknown']);
        expect(marks[0]).toHaveTextContent('up');
        expect(marks[1]).toHaveTextContent('down');
        expect(marks[2]).toHaveTextContent('warn');
        expect(marks[3]).toHaveTextContent('n/a');
        expect(marks[0]).toHaveClass('text-state-up');
        expect(marks[1]).toHaveClass('text-state-down');
        expect(marks[2]).toHaveClass('text-state-warn');
        expect(marks[3]).toHaveClass('text-state-unknown');
    });

    test('navigates to objects on row click', () => {
        renderComponent();
        fireEvent.click(screen.getByRole('row', {name: /root/i}));
        expect(mockNavigate).toHaveBeenCalledWith('/objects?namespace=root');
    });

    test('navigates to objects on row Enter key', () => {
        renderComponent();
        fireEvent.keyDown(screen.getByRole('row', {name: /root/i}), {key: 'Enter'});
        expect(mockNavigate).toHaveBeenCalledWith('/objects?namespace=root');
    });

    test('navigates with up status on count click', () => {
        renderComponent();
        fireEvent.click(screen.getByRole('button', {name: 'Show the 1 up object of root'}));
        expect(mockNavigate).toHaveBeenCalledWith('/objects?namespace=root&globalState=up');
        // the click does not reach the row
        expect(mockNavigate).toHaveBeenCalledTimes(1);
    });

    test('navigates with down status', () => {
        renderComponent();
        fireEvent.click(screen.getByRole('button', {name: 'Show the 1 down object of root'}));
        expect(mockNavigate).toHaveBeenCalledWith('/objects?namespace=root&globalState=down');
        expect(mockNavigate).toHaveBeenCalledTimes(1);
    });

    test('navigates with warn status', () => {
        renderComponent();
        fireEvent.click(screen.getByRole('button', {name: 'Show the 1 warn object of prod'}));
        expect(mockNavigate).toHaveBeenCalledWith('/objects?namespace=prod&globalState=warn');
        expect(mockNavigate).toHaveBeenCalledTimes(1);
    });

    test('navigates with n/a status', () => {
        renderComponent();
        fireEvent.click(screen.getByRole('button', {name: 'Show the 0 n/a objects of root'}));
        expect(mockNavigate).toHaveBeenCalledWith('/objects?namespace=root&globalState=n/a');
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

    test('shows no namespaces message when empty', () => {
        setup({data: {statusByNamespace: {}, namespaces: []}});
        renderComponent();
        expect(screen.getByTestId('no-namespaces-message')).toHaveTextContent('No namespaces available');
    });

    test('shows filter mismatch message', () => {
        setup({data: {statusByNamespace: {}, namespaces: []}, search: '?namespace=nonexistent'});
        renderComponent();
        expect(screen.getByTestId('no-namespaces-message')).toHaveTextContent('No namespaces match the selected filter');
        expect(getFilter()).toHaveValue('nonexistent');
    });

    test('lists all and every namespace in the filter', () => {
        renderComponent();
        const options = within(getFilter()).getAllByRole('option').map(option => option.value);
        expect(options).toEqual(['all', 'root', 'prod', 'dev']);
    });

    test('filters by namespace via the select', () => {
        renderComponent();
        fireEvent.change(getFilter(), {target: {value: 'prod'}});
        expect(mockNavigate).toHaveBeenCalledWith('/namespaces?namespace=prod');
        expect(getBodyRows()).toHaveLength(1);
        expect(screen.getByRole('row', {name: /prod/i})).toBeInTheDocument();
    });

    test('resets to all when selecting all', () => {
        setup({search: '?namespace=prod'});
        renderComponent();
        fireEvent.change(getFilter(), {target: {value: 'all'}});
        expect(mockNavigate).toHaveBeenCalledWith('/namespaces');
    });

    test('reads initial namespace from URL', () => {
        setup({search: '?namespace=prod'});
        renderComponent();
        expect(getFilter()).toHaveValue('prod');
        expect(getBodyRows()).toHaveLength(1);
    });

    test('handles empty namespace parameter in URL', () => {
        setup({search: '?namespace='});
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

    test('marks the namespace column sorted ascending by default', () => {
        renderComponent();
        expect(getColumnHeader('Namespace')).toHaveAttribute('aria-sort', 'ascending');
    });

    describe('sorting order verification', () => {
        beforeEach(() => {
            setup({data: sortingMockData});
            renderComponent();
        });

        const getNamespaceNames = () => {
            const rows = getBodyRows();
            return rows.map(row => within(row).getAllByRole('cell')[0].textContent);
        };

        test('default sort by namespace ascending', async () => {
            await waitFor(() => expect(getNamespaceNames()).toEqual(['alpha', 'beta', 'delta', 'gamma']));
        });

        test('sort by Up ascending', async () => {
            fireEvent.click(getHeaderCellFor('Up'));
            await waitFor(() => expect(getNamespaceNames()).toEqual(['gamma', 'alpha', 'beta', 'delta']));
        });

        test('sort by Down ascending', async () => {
            fireEvent.click(getHeaderCellFor('Down'));
            await waitFor(() => expect(getNamespaceNames()).toEqual(['beta', 'delta', 'alpha', 'gamma']));
        });

        test('sort by Warn ascending', async () => {
            fireEvent.click(getHeaderCellFor('Warn'));
            await waitFor(() => {
                const names = getNamespaceNames();
                expect(names[0]).toBe('delta');
            });
        });

        test('sort by N/A ascending', async () => {
            fireEvent.click(getHeaderCellFor('N/A'));
            await waitFor(() => {
                const names = getNamespaceNames();
                expect(names[0]).toBe('beta');
                expect(names[1]).toBe('delta');
            });
        });

        test('sort by Total ascending', async () => {
            fireEvent.click(getHeaderCellFor('Total'));
            await waitFor(() => expect(getNamespaceNames()).toEqual(['beta', 'delta', 'alpha', 'gamma']));
        });

        test('sort by Namespace descending', async () => {
            fireEvent.click(getHeaderCellFor('Namespace'));
            await waitFor(() => expect(getNamespaceNames()).toEqual(['gamma', 'delta', 'beta', 'alpha']));
        });
    });

    describe('infinite scroll', () => {
        function generateLargeData(count) {
            const obj = {};
            for (let i = 0; i < count; i++) obj[`ns${i}/svc/svc`] = {avail: 'up'};
            const status = buildStatusByNamespace(obj);
            return {statusByNamespace: status, namespaces: Object.keys(status)};
        }

        test('loads more namespaces on scroll near bottom', async () => {
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

    test('handles unknown status by showing N/A count', () => {
        const data = buildStatusByNamespace({'ns/svc': {avail: 'unknown'}});
        setup({data: {statusByNamespace: data, namespaces: Object.keys(data)}});
        renderComponent();
        const cells = getCells(getBodyRows()[0]);
        expect(cells[4]).toHaveTextContent('1');
    });

    test('opens the metrics of a namespace without opening its objects', () => {
        renderComponent();
        expect(screen.getByRole('columnheader', {name: 'Metrics'})).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'View metrics for namespace prod'}));
        expect(screen.getByTestId('namespace-metrics')).toHaveTextContent('prod');
        expect(screen.getByRole('dialog', {name: 'Metrics of prod'})).toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    test('labels the namespace filter', () => {
        renderComponent();
        expect(screen.getByText('Filter by namespace')).toBeInTheDocument();
        expect(getFilter()).toBeInTheDocument();
    });
});

describe('areStatusDotPropsEqual', () => {
    test('returns true when status and count are equal', () => {
        expect(areStatusDotPropsEqual({status: 'up', count: 3}, {status: 'up', count: 3})).toBe(true);
    });
    test('returns false when status differs', () => {
        expect(areStatusDotPropsEqual({status: 'up', count: 3}, {status: 'down', count: 3})).toBe(false);
    });
    test('returns false when count differs', () => {
        expect(areStatusDotPropsEqual({status: 'up', count: 3}, {status: 'up', count: 5})).toBe(false);
    });
});
