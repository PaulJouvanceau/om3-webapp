import React from 'react';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {vi} from 'vitest';
import HeaderSection from '../HeaderSection';

// ── Hoisted mock functions ──────────────────────────────────────────────
const {mockSetObjectMenuAnchor, mockHandleObjectActionClick} = vi.hoisted(() => ({
    mockSetObjectMenuAnchor: vi.fn(),
    mockHandleObjectActionClick: vi.fn(),
}));

// ── Mocks ───────────────────────────────────────────────────────────────
vi.mock('../../constants/actions', () => ({
    OBJECT_ACTIONS: [
        {name: 'delete', icon: 'delete-icon', color: 'red'},
        {name: 'edit', icon: 'edit-icon'},
    ],
}));

vi.mock('@mui/material', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        Typography: ({children, ...props}) => <span {...props}>{children}</span>,
        Tooltip: ({children, title}) => <span title={title}>{children}</span>,
        IconButton: ({children, onClick, disabled, ...props}) => (
            <button onClick={onClick} disabled={disabled} {...props}>
                {children}
            </button>
        ),
        Menu: ({open, children, anchorEl, onClose, ...props}) =>
            open ? (
                <div role="menu" {...props}>
                    {children}
                    <button aria-label="close-menu" onClick={onClose}>
                        Close
                    </button>
                </div>
            ) : null,
        MenuItem: ({children, onClick, disabled, ...props}) => (
            <div role="menuitem" onClick={onClick} data-disabled={disabled} {...props}>
                {children}
            </div>
        ),
        ListItemIcon: ({children, ...props}) => <span {...props}>{children}</span>,
        ListItemText: ({children}) => <span>{children}</span>,
    };
});

vi.mock('@mui/icons-material/FiberManualRecord', () => ({
    default: () => <svg data-testid="FiberManualRecordIcon"/>,
}));
vi.mock('@mui/icons-material/PriorityHigh', () => ({
    default: () => <svg data-testid="PriorityHighIcon"/>,
}));
vi.mock('@mui/icons-material/AcUnit', () => ({
    default: () => <svg data-testid="AcUnitIcon"/>,
}));
vi.mock('@mui/icons-material/MoreVert', () => ({
    default: () => <svg data-testid="MoreVertIcon"/>,
}));

vi.mock('../../utils/objectUtils', () => ({
    isActionAllowedForSelection: vi.fn(),
}));

import {isActionAllowedForSelection} from '../../utils/objectUtils';

// Mock navigator.userAgent
Object.defineProperty(global.navigator, 'userAgent', {
    value:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
    writable: true,
});

// Mock localStorage
const mockLocalStorage = {
    getItem: vi.fn(() => 'mock-token'),
    setItem: vi.fn(),
    removeItem: vi.fn(),
};
Object.defineProperty(global, 'localStorage', {value: mockLocalStorage});

describe('HeaderSection Component', () => {
    const defaultProps = {
        decodedObjectName: 'root/svc/svc1',
        globalStatus: {avail: 'up', frozen: 'frozen', provisioned: 'true'},
        actionInProgress: false,
        objectMenuAnchor: null,
        setObjectMenuAnchor: mockSetObjectMenuAnchor,
        handleObjectActionClick: mockHandleObjectActionClick,
        getObjectStatus: vi.fn(() => ({
            avail: 'up',
            frozen: 'frozen',
            globalExpect: 'placed@node1',
        })),
        getColor: vi.fn((status) => {
            if (status === 'up') return 'green';
            if (status === 'warn') return 'orange';
            if (status === 'down') return 'red';
            return 'grey';
        }),
        objectMenuAnchorRef: {current: null},
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(isActionAllowedForSelection).mockReturnValue(true);
        defaultProps.getObjectStatus.mockReturnValue({
            avail: 'up',
            frozen: 'frozen',
            globalExpect: 'placed@node1',
        });
        global.navigator.userAgent =
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36';
    });

    test('renders object name and status icons', async () => {
        render(<HeaderSection {...defaultProps} />);

        expect(screen.getByText('root/svc/svc1')).toBeInTheDocument();
        expect(screen.getByTestId('FiberManualRecordIcon')).toBeInTheDocument();
        expect(screen.getByTestId('AcUnitIcon')).toBeInTheDocument();
        expect(screen.getByText('placed@node1')).toBeInTheDocument();
    });

    test('renders warning icon when status is warn', async () => {
        defaultProps.getObjectStatus.mockReturnValue({
            avail: 'warn',
            frozen: 'unfrozen',
            globalExpect: null,
        });

        render(<HeaderSection {...defaultProps} />);

        expect(screen.getByText('root/svc/svc1')).toBeInTheDocument();
        expect(screen.getByTestId('FiberManualRecordIcon')).toBeInTheDocument();
        expect(screen.queryByTestId('AcUnitIcon')).not.toBeInTheDocument();
        expect(screen.queryByText('placed@node1')).not.toBeInTheDocument();
    });

    test('renders not provisioned icon when provisioned is false', async () => {
        const props = {
            ...defaultProps,
            globalStatus: {...defaultProps.globalStatus, provisioned: 'false'},
        };

        render(<HeaderSection {...props} />);

        expect(screen.getByText('root/svc/svc1')).toBeInTheDocument();
        expect(screen.getAllByTestId('PriorityHighIcon')).toHaveLength(1);
        expect(screen.getByTestId('FiberManualRecordIcon')).toBeInTheDocument();
        expect(screen.getByTestId('AcUnitIcon')).toBeInTheDocument();
    });

    test('disables menu button when actionInProgress is true', async () => {
        const props = {
            ...defaultProps,
            actionInProgress: true,
        };

        render(<HeaderSection {...props} />);

        const objectMenuButton = screen.getByRole('button', {name: 'Object actions'});
        expect(objectMenuButton).toBeDisabled();
    });

    test('does not render when globalStatus is undefined', async () => {
        const props = {
            ...defaultProps,
            globalStatus: undefined,
        };

        render(<HeaderSection {...props} />);

        expect(screen.queryByText('root/svc/svc1')).not.toBeInTheDocument();
        expect(screen.queryByTestId('FiberManualRecordIcon')).not.toBeInTheDocument();
    });

    test('opens menu and logs position on button click', async () => {
        vi.spyOn(console, 'info').mockImplementation(() => {
        });
        render(<HeaderSection {...defaultProps} />);

        const button = screen.getByLabelText('Object actions');
        await userEvent.click(button);

        expect(mockSetObjectMenuAnchor).toHaveBeenCalledWith(expect.anything());
        expect(console.info).toHaveBeenCalledWith(
            'Object menu opened at:',
            expect.any(Object)
        );
    });

    test('renders menu when objectMenuAnchor is set', () => {
        const mockAnchor = {
            getBoundingClientRect: vi.fn(() => ({})),
        };
        const props = {
            ...defaultProps,
            objectMenuAnchor: mockAnchor,
        };
        render(<HeaderSection {...props} />);

        expect(screen.getByRole('menu')).toBeInTheDocument();
        expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    });

    test('handles object action click', async () => {
        const mockAnchor = {
            getBoundingClientRect: vi.fn(() => ({})),
        };
        const props = {
            ...defaultProps,
            objectMenuAnchor: mockAnchor,
        };
        render(<HeaderSection {...props} />);

        const menuItems = screen.getAllByRole('menuitem');
        await userEvent.click(menuItems[0]);

        expect(mockHandleObjectActionClick).toHaveBeenCalledWith('delete');
        expect(mockSetObjectMenuAnchor).toHaveBeenCalledWith(null);
    });

    test('disables menu items when not allowed', () => {
        vi.mocked(isActionAllowedForSelection).mockReturnValue(false);
        const mockAnchor = {
            getBoundingClientRect: vi.fn(() => ({})),
        };
        const props = {
            ...defaultProps,
            objectMenuAnchor: mockAnchor,
        };
        render(<HeaderSection {...props} />);

        const menuItems = screen.getAllByRole('menuitem');
        expect(menuItems[0]).toHaveAttribute('data-disabled', 'true');
    });

    test('closes menu when onClose is triggered', async () => {
        const mockAnchor = {
            getBoundingClientRect: vi.fn(() => ({})),
        };
        const props = {
            ...defaultProps,
            objectMenuAnchor: mockAnchor,
        };
        render(<HeaderSection {...props} />);

        const closeButton = screen.getByRole('button', {name: 'close-menu'});
        await userEvent.click(closeButton);

        expect(mockSetObjectMenuAnchor).toHaveBeenCalledWith(null);
    });
});
