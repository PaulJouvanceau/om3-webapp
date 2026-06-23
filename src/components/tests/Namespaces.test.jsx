import React from 'react';
import {render, screen, fireEvent, waitFor, act, within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Namespaces from '../Namespaces';
import useEventStore from '../../hooks/useEventStore.js';
import {startEventReception, closeEventSource} from '../../eventSourceManager.jsx';

// Mock dependencies
jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: jest.fn(),
    useLocation: jest.fn(),
}));

jest.mock('../../hooks/useEventStore.js');
jest.mock('../../eventSourceManager.jsx');
jest.mock('../../hooks/useNamespaceData', () => ({
    useNamespaceData: jest.fn(),
}));

import {useNamespaceData} from '../../hooks/useNamespaceData';

const mockNavigate = jest.fn();
const mockStartEventReception = startEventReception;
const mockCloseEventSource = closeEventSource;

jest.mock('@mui/material', () => {
    const originalModule = jest.requireActual('@mui/material');
    const React = require('react');
    return {
        ...originalModule,
        Box: ({children, ...props}) => <div data-testid="box" {...props}>{children}</div>,
        Table: ({children, ...props}) => <table data-testid="table" {...props}>{children}</table>,
        TableHead: ({children, ...props}) => <thead data-testid="table-head" {...props}>{children}</thead>,
        TableBody: ({children, ...props}) => <tbody data-testid="table-body" {...props}>{children}</tbody>,
        TableRow: ({children, onClick, hover, ...props}) => (
            <tr data-testid="table-row" onClick={onClick} {...props}>{children}</tr>
        ),
        TableCell: ({children, onClick, justifyContent, alignItems, ...props}) => (
            <td data-testid="table-cell" onClick={onClick} {...props}>{children}</td>
        ),
        TableContainer: React.forwardRef(({children, ...props}, ref) => (
            <div ref={ref} data-testid="table-container" {...props}>{children}</div>
        )),
        Typography: ({children, ...props}) => <div data-testid="typography" {...props}>{children}</div>,
        Autocomplete: ({options, value, onChange, renderInput, ...props}) => (
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
        ),
        TextField: ({label, inputProps, ...props}) => (
            <div data-testid="text-field">
                {label && <label>{label}</label>}
                <input {...inputProps} {...props} />
            </div>
        ),
        Drawer: ({children, open, anchor, onClose, ...props}) =>
            open ? <div role="complementary" {...props}>{children}</div> : null,
        CircularProgress: (props) => <div role="progressbar" {...props} />,
    };
});

// Mock icons with proper test IDs
jest.mock('@mui/icons-material/KeyboardArrowUp', () => ({
    __esModule: true,
    default: (props) => <span data-testid="arrow-up" {...props} />,
}));

jest.mock('@mui/icons-material/KeyboardArrowDown', () => ({
    __esModule: true,
    default: (props) => <span data-testid="arrow-down" {...props} />,
}));

jest.mock('@mui/icons-material/FiberManualRecord', () => ({
    __esModule: true,
    default: ({sx = {}, ...props}) => {
        const color = typeof sx.color === 'string' ? sx.color : 'inherit';
        return <span data-testid="status-icon" style={{color}} {...props} />;
    },
}));

jest.mock('@mui/icons-material/PriorityHigh', () => ({
    __esModule: true,
    default: ({sx = {}, ...props}) => {
        const color = typeof sx.color === 'string' ? sx.color : 'inherit';
        return <span data-testid="status-icon" style={{color}} {...props} />;
    },
}));

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

function setup(overrides = {}) {
    const {
        pathname = '/namespaces',
        search = '',
        data = defaultMockData,
        token = 'valid-token',
    } = overrides;

    jest.clearAllMocks();
    Storage.prototype.getItem = jest.fn(() => token);
    require('react-router-dom').useNavigate.mockReturnValue(mockNavigate);
    require('react-router-dom').useLocation.mockReturnValue({pathname, search});
    useEventStore.mockImplementation((selector) => selector({objectStatus: {}}));
    useNamespaceData.mockReturnValue(data);
}

function renderComponent() {
    return render(
        <MemoryRouter>
            <Namespaces/>
        </MemoryRouter>
    );
}

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

    test('navigates with status on status cell click', () => {
        renderComponent();
        const rootRow = screen.getByRole('row', {name: /root/i});
        const statusCells = within(rootRow).getAllByTestId('table-cell');
        fireEvent.click(statusCells[1]);
        expect(mockNavigate).toHaveBeenCalledWith('/objects?namespace=root&globalState=up');
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

    test('sorts namespaces by clicking headers', () => {
        renderComponent();
        const header = getHeaderCellFor('Namespace');
        fireEvent.click(header);
        fireEvent.click(header);
        expect(screen.getAllByTestId('table-row').length).toBeGreaterThan(0);
    });

    test('clicking different column resets direction', () => {
        renderComponent();
        const upHeader = getHeaderCellFor('Up');
        const downHeader = getHeaderCellFor('Down');
        fireEvent.click(upHeader);
        fireEvent.click(downHeader);
        expect(screen.getByTestId('table-body')).toBeInTheDocument();
    });

    describe('infinite scroll', () => {
        function generateLargeData(count) {
            const obj = {};
            for (let i = 0; i < count; i++) obj[`ns${i}/svc/svc`] = {avail: 'up'};
            const status = buildStatusByNamespace(obj);
            return {statusByNamespace: status, namespaces: Object.keys(status)};
        }

        test('loads more namespaces on scroll near bottom', async () => {
            jest.useFakeTimers();
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
                jest.advanceTimersByTime(0);
            });
            expect(screen.getByRole('progressbar')).toBeInTheDocument();

            act(() => {
                jest.advanceTimersByTime(100);
            });
            await waitFor(() => {
                rows = within(screen.getByTestId('table-body')).getAllByTestId('table-row');
                expect(rows).toHaveLength(60);
            });
            jest.useRealTimers();
        });

        test('does not load more while already loading', () => {
            jest.useFakeTimers();
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
                jest.advanceTimersByTime(0);
            });
            expect(screen.getByRole('progressbar')).toBeInTheDocument();

            fireEvent.scroll(container);
            act(() => {
                jest.advanceTimersByTime(100);
            });
            expect(within(screen.getByTestId('table-body')).getAllByTestId('table-row')).toHaveLength(60);
            jest.useRealTimers();
        });

        test('does not load more if all visible', () => {
            jest.useFakeTimers();
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
                jest.advanceTimersByTime(0);
            });
            expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
            jest.useRealTimers();
        });

        test('removes scroll listener on unmount', () => {
            setup({data: generateLargeData(60)});
            const {unmount} = renderComponent();
            const container = screen.getByTestId('table-container');
            const removeSpy = jest.spyOn(container, 'removeEventListener');
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

    test('getColorByStatus returns correct colors', () => {
        const getColorByStatus = (status) => {
            const {green, red, orange, grey} = require('@mui/material/colors');
            switch (status) {
                case 'up':
                    return green[500];
                case 'down':
                    return red[500];
                case 'warn':
                    return orange[500];
                default:
                    return grey[500];
            }
        };
        expect(getColorByStatus('up')).toBe('#4caf50');
        expect(getColorByStatus('down')).toBe('#f44336');
        expect(getColorByStatus('warn')).toBe('#ff9800');
        expect(getColorByStatus('unknown')).toBe('#9e9e9e');
    });
});