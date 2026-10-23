import React from 'react';
import {fireEvent, render, screen, within} from '@testing-library/react';
import {describe, expect, test, vi} from 'vitest';
import ActionDialogManager from '../ActionDialogManager';

// The options of an action, through the dialogs that confirm it (not mocked here).
const manager = (props) => {
    const handleConfirm = vi.fn();
    const view = render(
        <ActionDialogManager
            handleConfirm={handleConfirm}
            target="ns1/svc/web"
            supportedActions={['switch', 'start', 'freeze', 'stop']}
            onClose={vi.fn()}
            {...props}
        />,
    );
    return {handleConfirm, ...view};
};

describe('the options of an action, in its confirmation', () => {
    test('the switch to a node of the object, live: the daemon given both', () => {
        const {handleConfirm} = manager({pendingAction: {action: 'switch'}, nodes: ['n1', 'n2']});
        const dialog = screen.getByRole('dialog');
        const destination = within(dialog).getByRole('combobox', {name: '--to'});
        // Unpicked, the daemon chooses: the next preferred node.
        expect(destination).toHaveValue('');
        expect(within(destination).getAllByRole('option').map((o) => o.textContent))
            .toEqual(['Next preferred node', 'n1', 'n2']);
        fireEvent.change(destination, {target: {value: 'n2'}});
        fireEvent.click(within(dialog).getByText('Options'));
        fireEvent.click(within(dialog).getByRole('checkbox', {name: '--live'}));
        fireEvent.click(within(dialog).getByRole('checkbox', {name: 'Confirm service unavailability'}));
        fireEvent.click(within(dialog).getByRole('button', {name: 'Confirm switch action'}));
        expect(handleConfirm).toHaveBeenCalledWith('switch', {destination: 'n2', live: true});
    });

    test('the node typed when the nodes of the object are not known', () => {
        manager({pendingAction: {action: 'switch'}});
        expect(screen.getByRole('textbox', {name: '--to'})).toBeInTheDocument();
    });

    test('an instance start: its flags and selectors folded, how many set said on the fold', () => {
        const {handleConfirm} = manager({pendingAction: {action: 'start', targets: [{node: 'n1'}]}, instances: true});
        const dialog = screen.getByRole('dialog');
        fireEvent.click(within(dialog).getByText('Options'));
        fireEvent.click(within(dialog).getByRole('checkbox', {name: '--force'}));
        fireEvent.change(within(dialog).getByRole('textbox', {name: '--subset'}), {target: {value: 'db'}});
        expect(within(dialog).getByText('Options (2 set)')).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', {name: 'Confirm'}));
        expect(handleConfirm).toHaveBeenCalledWith('start', {force: true, subset: 'db'});
    });

    test('a resource start offers no selector: its resources are named', () => {
        manager({pendingAction: {action: 'start', targets: [{node: 'n1', rid: 'fs#1'}]}, instances: true});
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByRole('checkbox', {name: '--force'})).toBeInTheDocument();
        expect(within(dialog).queryByRole('textbox', {name: '--subset'})).toBeNull();
    });

    test('an action taking none shows none', () => {
        manager({pendingAction: {action: 'freeze'}});
        expect(screen.queryByTestId('action-options')).toBeNull();
    });

    test('the options of an action start unset when another is asked', () => {
        const {rerender, handleConfirm} = manager({pendingAction: {action: 'start', targets: [{node: 'n1'}]}, instances: true});
        fireEvent.click(screen.getByText('Options'));
        fireEvent.click(screen.getByRole('checkbox', {name: '--force'}));
        rerender(
            <ActionDialogManager
                handleConfirm={handleConfirm}
                target="ns1/svc/web"
                supportedActions={['switch', 'start', 'freeze', 'stop']}
                onClose={vi.fn()}
                pendingAction={{action: 'stop', targets: [{node: 'n1'}]}}
                instances
            />,
        );
        fireEvent.click(screen.getByText('Options'));
        expect(screen.getByRole('checkbox', {name: '--force'})).not.toBeChecked();
    });
});
