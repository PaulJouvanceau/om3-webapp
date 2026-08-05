import React from 'react';
import {render, screen, fireEvent, waitFor, act, within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {vi} from 'vitest';
import Kinds from '../Kinds';

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

// Build a statusByKind object from a simplified definition.
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
        expect(screen.getByTestId('table')).toBeInTheDocument();
        ['Kind', 'Up', 'Down', 'Warn', 'Unprovisioned', 'Total'].forEach(text =>
            expect(screen.getByText(text)).toBeInTheDocument()
        );
    });

    test('displays kind counts correctly', () => {
        renderComponent();
        const serviceRow = screen.getByRole('row', {name: /service/i});
        const cells = within(serviceRow).getAllByTestId('table-cell');
        // cells: kind, up, down, warn, unprovisioned, total
        expect(cells[1]).toHaveTextContent('2');
        expect(cells[2]).toHaveTextContent('1');
        expect(cells[3]).toHaveTextContent('1');
        expect(cells[4]).toHaveTextContent('0');
        expect(cells[5]).toHaveTextContent('4'); // 2+1+1+0
    });

    test('shows status icons with correct colors', () => {
        renderComponent();
        const serviceRow = screen.getByRole('row', {name: /service/i});
        const icons = within(serviceRow).getAllByTestId('status-icon');
        // up, down, warn, unprovisioned (unprovisioned also red)
        expect(icons[0]).toHaveStyle({color: '#4caf50'}); // up
        expect(icons[1]).toHaveStyle({color: '#f44336'}); // down
        expect(icons[2]).toHaveStyle({color: '#ff9800'}); // warn
        expect(icons[3]).toHaveStyle({color: '#f44336'}); // unprovisioned (same as down)
    });

    test('navigates to objects on row click', () => {
        renderComponent();
        fireEvent.click(screen.getByRole('row', {name: /service/i}));
        expect(mockNavigate).toHaveBeenCalledWith('/objects?kind=service');
    });

    test('navigates with up status on cell click', () => {
        renderComponent();
        const serviceRow = screen.getByRole('row', {name: /service/i});
        const cells = within(serviceRow).getAllByTestId('table-cell');
        fireEvent.click(cells[1]); // up column
        expect(mockNavigate).toHaveBeenCalledWith('/objects?kind=service&globalState=up');
    });

    test('navigates with down status', () => {
        renderComponent();
        const serviceRow = screen.getByRole('row', {name: /service/i});
        fireEvent.click(within(serviceRow).getAllByTestId('table-cell')[2]);
        expect(mockNavigate).toHaveBeenCalledWith('/objects?kind=service&globalState=down');
    });

    test('navigates with warn status', () => {
        renderComponent();
        const serviceRow = screen.getByRole('row', {name: /service/i});
        fireEvent.click(within(serviceRow).getAllByTestId('table-cell')[3]);
        expect(mockNavigate).toHaveBeenCalledWith('/objects?kind=service&globalState=warn');
    });

    test('navigates with unprovisioned status', () => {
        renderComponent();
        const podRow = screen.getByRole('row', {name: /pod/i});
        fireEvent.click(within(podRow).getAllByTestId('table-cell')[4]); // unprovisioned
        expect(mockNavigate).toHaveBeenCalledWith('/objects?kind=pod&globalState=unprovisioned');
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
    });

    test('filters by kind via autocomplete', () => {
        renderComponent();
        const input = screen.getByTestId('autocomplete-input');
        fireEvent.change(input, {target: {value: 'deployment'}});
        fireEvent.keyDown(input, {key: 'Enter'});
        expect(mockNavigate).toHaveBeenCalledWith('/kinds?kind=deployment');
    });

    test('resets to all when clearing autocomplete', () => {
        renderComponent();
        const input = screen.getByTestId('autocomplete-input');
        fireEvent.change(input, {target: {value: null}});
        expect(mockNavigate).toHaveBeenCalledWith('/kinds');
    });

    test('reads initial kind from URL', () => {
        setup({search: '?kind=deployment'});
        renderComponent();
        expect(screen.getByTestId('autocomplete-input')).toHaveValue('deployment');
    });

    test('handles empty kind parameter in URL', () => {
        setup({search: '?kind='});
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

        const getKindNames = () => {
            const rows = within(screen.getByTestId('table-body')).getAllByTestId('table-row');
            return rows.map(row => within(row).getAllByTestId('table-cell')[0].textContent);
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

    test('handles unprovisioned status color as red', () => {
        const data = {
            statusByKind: buildStatusByKind({testkind: {up: 0, down: 0, warn: 0, unprovisioned: 1}}),
            kinds: ['testkind'],
        };
        setup({data});
        renderComponent();
        const row = screen.getByRole('row', {name: /testkind/i});
        const icons = within(row).getAllByTestId('status-icon');
        expect(icons[3]).toHaveStyle({color: '#f44336'}); // unprovisioned
    });

    test('renderTextField displays correct label', () => {
        renderComponent();
        expect(screen.getByText('Filter by kind')).toBeInTheDocument();
    });
});
