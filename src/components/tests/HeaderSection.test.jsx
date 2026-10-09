import React from 'react';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {vi} from 'vitest';
import HeaderSection from '../HeaderSection';

// ── Hoisted mock functions ──────────────────────────────────────────────
const {mockHandleObjectActionClick} = vi.hoisted(() => ({
    mockHandleObjectActionClick: vi.fn(),
}));

// ── Mocks ───────────────────────────────────────────────────────────────
vi.mock('../../constants/actions', async (importOriginal) => ({
    actionLabel: (await importOriginal()).actionLabel,
    OBJECT_ACTIONS: [
        {name: 'delete', icon: 'delete-icon', color: 'red'},
        {name: 'edit', icon: 'edit-icon'},
        // svc-only actions — filtered by action.kinds
        {name: 'enable', icon: 'enable-icon', kinds: ['svc']},
        {name: 'disable', icon: 'disable-icon', kinds: ['svc'], color: 'red'},
        // vol-only action — used to verify filtering for other kinds
        {name: 'snapshot', icon: 'snapshot-icon', kinds: ['vol']},
    ],
}));

vi.mock('../../utils/objectUtils', () => ({
    isActionAllowedForSelection: vi.fn(),
}));

import {isActionAllowedForSelection} from '../../utils/objectUtils';

describe('HeaderSection Component', () => {
    const defaultProps = {
        decodedObjectName: 'root/svc/svc1',
        kind: 'svc',
        globalStatus: {avail: 'up', frozen: 'frozen', provisioned: 'true'},
        actionInProgress: false,
        handleObjectActionClick: mockHandleObjectActionClick,
        getObjectStatus: vi.fn(() => ({
            avail: 'up',
            frozen: 'frozen',
            globalExpect: 'placed@node1',
        })),
    };

    const status = () => document.querySelector('[data-state]');

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(isActionAllowedForSelection).mockReturnValue(true);
        defaultProps.getObjectStatus.mockReturnValue({
            avail: 'up',
            frozen: 'frozen',
            globalExpect: 'placed@node1',
        });
    });

    test('renders object name as heading, status, frozen mark and global expect', () => {
        render(<HeaderSection {...defaultProps} />);

        expect(screen.getByRole('heading', {level: 1, name: 'root/svc/svc1'})).toBeInTheDocument();
        expect(status()).toHaveAttribute('data-state', 'up');
        expect(status()).toHaveTextContent('up');
        expect(screen.getByTitle('frozen')).toBeInTheDocument();
        expect(screen.getByText('placed@node1')).toBeInTheDocument();
        expect(screen.queryByRole('img', {name: 'Object is not provisioned'})).not.toBeInTheDocument();
    });

    test('renders warn status, no frozen mark and no global expect', () => {
        defaultProps.getObjectStatus.mockReturnValue({
            avail: 'warn',
            frozen: 'unfrozen',
            globalExpect: null,
        });

        render(<HeaderSection {...defaultProps} />);

        expect(screen.getByText('root/svc/svc1')).toBeInTheDocument();
        expect(status()).toHaveAttribute('data-state', 'warn');
        expect(screen.queryByTitle('frozen')).not.toBeInTheDocument();
        expect(screen.queryByText('placed@node1')).not.toBeInTheDocument();
    });

    test.each([
        ['down', 'down'],
        ['n/a', 'unknown'],
        [undefined, 'unknown'],
    ])('maps avail %p to state %p', (avail, state) => {
        defaultProps.getObjectStatus.mockReturnValue({avail, frozen: 'unfrozen', globalExpect: null});
        render(<HeaderSection {...defaultProps} />);
        expect(status()).toHaveAttribute('data-state', state);
    });

    test.each([['false'], [false]])('renders not provisioned mark when provisioned is %p', (provisioned) => {
        const props = {
            ...defaultProps,
            globalStatus: {...defaultProps.globalStatus, provisioned},
        };

        render(<HeaderSection {...props} />);

        expect(screen.getByText('root/svc/svc1')).toBeInTheDocument();
        expect(screen.getAllByRole('img', {name: 'Object is not provisioned'})).toHaveLength(1);
        expect(status()).toHaveAttribute('data-state', 'up');
        expect(screen.getByTitle('frozen')).toBeInTheDocument();
    });

    test('disables menu button when actionInProgress is true', () => {
        render(<HeaderSection {...defaultProps} actionInProgress={true}/>);

        expect(screen.getByRole('button', {name: /Object actions/})).toBeDisabled();
    });

    test('does not render when globalStatus is undefined', () => {
        render(<HeaderSection {...defaultProps} globalStatus={undefined}/>);

        expect(screen.queryByText('root/svc/svc1')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', {name: /Object actions/})).not.toBeInTheDocument();
    });

    test('opens the actions menu on button click', async () => {
        render(<HeaderSection {...defaultProps} />);

        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', {name: /Object actions/}));

        const menu = screen.getByRole('menu', {name: 'Object actions'});
        // 2 unrestricted + 2 svc-only (the vol-only one is filtered out)
        expect(within(menu).getAllByRole('menuitem')).toHaveLength(4);
        expect(within(menu).getByRole('menuitem', {name: 'Delete'})).toBeInTheDocument();
        expect(within(menu).getByRole('menuitem', {name: 'Edit'})).toBeInTheDocument();
        expect(isActionAllowedForSelection).toHaveBeenCalledWith('delete', ['root/svc/svc1']);
    });

    // ── kind-based filtering ────────────────────────────────────────────
    describe('action filtering by kind', () => {
        const openMenuLabels = async () => {
            await userEvent.click(screen.getByRole('button', {name: /Object actions/}));
            const menu = screen.getByRole('menu', {name: 'Object actions'});
            // Entries by accessible name, in menu order (the icons are aria-hidden).
            const names = ['Delete', 'Edit', 'Enable', 'Disable', 'Snapshot'];
            const items = within(menu).getAllByRole('menuitem');
            return items.map((item) => names.find((n) => within(menu).queryByRole('menuitem', {name: n}) === item));
        };

        test('svc shows all non-kinds actions + svc-only actions', async () => {
            render(<HeaderSection {...defaultProps}/>);
            expect(await openMenuLabels()).toEqual(['Delete', 'Edit', 'Enable', 'Disable']);
        });

        test('vol shows only vol-restricted action, not enable/disable', async () => {
            render(<HeaderSection {...defaultProps} kind="vol"/>);
            expect(await openMenuLabels()).toEqual(['Delete', 'Edit', 'Snapshot']);
        });

        test('other kinds show only actions without a kinds restriction', async () => {
            render(<HeaderSection {...defaultProps} kind="cfg"/>);
            expect(await openMenuLabels()).toEqual(['Delete', 'Edit']);
        });

        test('svc-only actions are routed through the click handler', async () => {
            render(<HeaderSection {...defaultProps}/>);
            await userEvent.click(screen.getByRole('button', {name: /Object actions/}));
            await userEvent.click(screen.getByRole('menuitem', {name: 'Enable'}));
            expect(mockHandleObjectActionClick).toHaveBeenCalledWith('enable');
        });
    });

    test('handles object action click and closes the menu', async () => {
        render(<HeaderSection {...defaultProps} />);

        await userEvent.click(screen.getByRole('button', {name: /Object actions/}));
        await userEvent.click(screen.getAllByRole('menuitem')[0]);

        expect(mockHandleObjectActionClick).toHaveBeenCalledWith('delete');
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    test('disables menu items when not allowed', async () => {
        vi.mocked(isActionAllowedForSelection).mockReturnValue(false);
        render(<HeaderSection {...defaultProps} />);

        await userEvent.click(screen.getByRole('button', {name: /Object actions/}));

        const menuItems = screen.getAllByRole('menuitem');
        expect(menuItems).toHaveLength(4);
        menuItems.forEach((item) => expect(item).toBeDisabled());
        await userEvent.click(menuItems[0]);
        expect(mockHandleObjectActionClick).not.toHaveBeenCalled();
    });

    test('closes menu on Escape and on a click outside', async () => {
        render(<HeaderSection {...defaultProps} />);

        screen.getByRole('button', {name: /Object actions/}).focus();
        await userEvent.keyboard('{Enter}');
        expect(screen.getByRole('menu')).toBeInTheDocument();
        await userEvent.keyboard('{Escape}');
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', {name: /Object actions/}));
        expect(screen.getByRole('menu')).toBeInTheDocument();
        await userEvent.click(document.body);

        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(mockHandleObjectActionClick).not.toHaveBeenCalled();
    });
});
