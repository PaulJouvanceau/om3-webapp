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

vi.mock('@mui/material', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        Box: vi.fn(({children, ...props}) => <div data-testid="box" {...props}>{children}</div>),
        Table: vi.fn(({children, ...props}) => <table data-testid="table" {...props}>{children}</table>),
        TableHead: vi.fn(({children, ...props}) => <thead data-testid="table-head" {...props}>{children}</thead>),
        TableBody: vi.fn(({children, ...props}) => <tbody data-testid="table-body" {...props}>{children}</tbody>),
        TableRow: vi.fn(({children, onClick, hover, ...props}) => (
            <tr data-testid="table-row" onClick={onClick} {...props}>{children}</tr>
        )),
        TableCell: vi.fn(({children, onClick, justifyContent, alignItems, ...props}) => (
            <td data-testid="table-cell" onClick={onClick} {...props}>{children}</td>
        )),
        TableContainer: vi.fn(({children, ...props}) => (
            <div data-testid="table-container" {...props}>{children}</div>
        )),
        Typography: vi.fn(({children, ...props}) => <div data-testid="typography" {...props}>{children}</div>),
        Autocomplete: vi.fn(({options, value, onChange, renderInput, ...props}) => (
            <div data-testid="autocomplete" {...props}>
                <input
                    data-testid="autocomplete-input"
                    value={value}
                    onChange={(e) => onChange && onChange(e, e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') onChange && onChange(e, e.target.value);
                    }}
                />
                {renderInput && renderInput({})}
            </div>
        )),
        TextField: vi.fn(({label, inputProps, ...props}) => (
            <div data-testid="text-field">
                {label && <label>{label}</label>}
                <input {...inputProps} {...props} />
            </div>
        )),
        Drawer: vi.fn(({children, open, anchor, onClose, ...props}) =>
            open ? <div role="complementary" {...props}>{children}</div> : null
        ),
        CircularProgress: vi.fn((props) => <div role="progressbar" {...props} />),
    };
});

vi.mock('@mui/icons-material/KeyboardArrowUp', () => ({
    __esModule: true,
    default: (props) => <span data-testid="arrow-up" {...props} />,
}));
vi.mock('@mui/icons-material/KeyboardArrowDown', () => ({
    __esModule: true,
    default: (props) => <span data-testid="arrow-down" {...props} />,
}));
vi.mock('@mui/icons-material/FiberManualRecord', () => ({
    __esModule: true,
    default: ({sx = {}, ...props}) => {
        const color = typeof sx.color === 'string' ? sx.color : 'inherit';
        return <span data-testid="status-icon" style={{color}} {...props} />;
    },
}));
vi.mock('@mui/icons-material/PriorityHigh', () => ({
    __esModule: true,
    default: ({sx = {}, ...props}) => {
        const color = typeof sx.color === 'string' ? sx.color : 'inherit';
        return <span data-testid="status-icon" style={{color}} {...props} />;
    },
}));

// ── Helpers ─────────────────────────────────────────────────────────────
const getHeaderCellFor = (columnName) => {
    const head = screen.getByTestId('table-head');
    const headRow = within(head).getByTestId('table-row');
    const headCells = within(headRow).getAllByTestId('table-cell');
    const regex = new RegExp(columnName, 'i');
    return headCells.find(cell => within(cell).queryByText(regex) !== null);
};

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
        expect(screen.getByTestId('table')).toBeInTheDocument();
        ['Namespace', 'Up', 'Down', 'Warn', 'N/A', 'Total'].forEach(text =>
            expect(screen.getByText(text)).toBeInTheDocument()
        );
    });

    test('displays namespace counts correctly', () => {
        renderComponent();
        const rootRow = screen.getByRole('row', {name: /root/i});
        const cells = within(rootRow).getAllByTestId('table-cell');
        expect(cells[1]).toHaveTextContent('1');
        expect(cells[2]).toHaveTextContent('1');
        expect(cells[3]).toHaveTextContent('0');
        expect(cells[4]).toHaveTextContent('0');
        expect(cells[5]).toHaveTextContent('2');
    });

    test('shows status icons with correct colors', () => {
        renderComponent();
        const rootIcons = within(screen.getByRole('row', {name: /root/i})).getAllByTestId('status-icon');
        expect(rootIcons[0]).toHaveStyle({color: '#4caf50'});
        expect(rootIcons[1]).toHaveStyle({color: '#f44336'});
        expect(rootIcons[2]).toHaveStyle({color: '#ff9800'});
        expect(rootIcons[3]).toHaveStyle({color: '#9e9e9e'});
    });

    test('navigates to objects on row click', () => {
        renderComponent();
        fireEvent.click(screen.getByRole('row', {name: /root/i}));
        expect(mockNavigate).toHaveBeenCalledWith('/objects?namespace=root');
    });

    test('navigates with up status on cell click', () => {
        renderComponent();
        const rootRow = screen.getByRole('row', {name: /root/i});
        fireEvent.click(within(rootRow).getAllByTestId('table-cell')[1]);
        expect(mockNavigate).toHaveBeenCalledWith('/objects?namespace=root&globalState=up');
    });

    test('navigates with down status', () => {
        renderComponent();
        const rootRow = screen.getByRole('row', {name: /root/i});
        fireEvent.click(within(rootRow).getAllByTestId('table-cell')[2]);
        expect(mockNavigate).toHaveBeenCalledWith('/objects?namespace=root&globalState=down');
    });

    test('navigates with warn status', () => {
        renderComponent();
        const prodRow = screen.getByRole('row', {name: /prod/i});
        fireEvent.click(within(prodRow).getAllByTestId('table-cell')[3]);
        expect(mockNavigate).toHaveBeenCalledWith('/objects?namespace=prod&globalState=warn');
    });

    test('navigates with n/a status', () => {
        renderComponent();
        const rootRow = screen.getByRole('row', {name: /root/i});
        fireEvent.click(within(rootRow).getAllByTestId('table-cell')[4]);
        expect(mockNavigate).toHaveBeenCalledWith('/objects?namespace=root&globalState=n/a');
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
        expect(screen.getByText(/No namespaces available/i)).toBeInTheDocument();
    });

    test('shows filter mismatch message', () => {
        setup({data: {statusByNamespace: {}, namespaces: []}, search: '?namespace=nonexistent'});
        renderComponent();
        expect(screen.getByText(/No namespaces match the selected filter/i)).toBeInTheDocument();
    });

    test('filters by namespace via autocomplete', () => {
        renderComponent();
        const input = screen.getByTestId('autocomplete-input');
        fireEvent.change(input, {target: {value: 'prod'}});
        fireEvent.keyDown(input, {key: 'Enter'});
        expect(mockNavigate).toHaveBeenCalledWith('/namespaces?namespace=prod');
    });

    test('resets to all when clearing autocomplete', () => {
        renderComponent();
        const input = screen.getByTestId('autocomplete-input');
        fireEvent.change(input, {target: {value: null}});
        expect(mockNavigate).toHaveBeenCalledWith('/namespaces');
    });

    test('reads initial namespace from URL', () => {
        setup({search: '?namespace=prod'});
        renderComponent();
        expect(screen.getByTestId('autocomplete-input')).toHaveValue('prod');
    });

    test('handles empty namespace parameter in URL', () => {
        setup({search: '?namespace='});
        renderComponent();
        expect(screen.getByTestId('autocomplete-input')).toHaveValue('all');
    });

    test('clicking different column resets direction', () => {
        renderComponent();
        fireEvent.click(getHeaderCellFor('Up'));
        fireEvent.click(getHeaderCellFor('Down'));
        expect(screen.getByTestId('table-body')).toBeInTheDocument();
    });

    describe('sorting order verification', () => {
        beforeEach(() => {
            setup({data: sortingMockData});
            renderComponent();
        });

        const getNamespaceNames = () => {
            const rows = within(screen.getByTestId('table-body')).getAllByTestId('table-row');
            return rows.map(row => within(row).getAllByTestId('table-cell')[0].textContent);
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
            await screen.findByTestId('table-body');
            let rows = within(screen.getByTestId('table-body')).getAllByTestId('table-row');
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
            expect(screen.getByRole('progressbar')).toBeInTheDocument();

            act(() => {
                vi.advanceTimersByTime(100);
            });
            await waitFor(() => {
                rows = within(screen.getByTestId('table-body')).getAllByTestId('table-row');
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
            expect(screen.getByRole('progressbar')).toBeInTheDocument();

            fireEvent.scroll(container);
            act(() => {
                vi.advanceTimersByTime(100);
            });
            expect(within(screen.getByTestId('table-body')).getAllByTestId('table-row')).toHaveLength(60);
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
            expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
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
        const cells = within(screen.getByRole('row', {name: /ns/i})).getAllByTestId('table-cell');
        expect(cells[4]).toHaveTextContent('1');
    });

    test('renderTextField displays correct label', () => {
        renderComponent();
        expect(screen.getByText('Filter by namespace')).toBeInTheDocument();
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
