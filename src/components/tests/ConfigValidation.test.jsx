import React from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, test, vi} from 'vitest';
import '../../i18n';
import {ConfigValidationResult, ValidateButton, useConfigValidation} from '../ConfigValidation';

const URL = '/api/node/name/n1/config/validate';

function Validation({url = URL, changes = 0}) {
    const {result, validate, reset} = useConfigValidation(url, changes);
    return (
        <>
            <ValidateButton onClick={() => void validate()}/>
            <ConfigValidationResult result={result} onClose={reset}/>
        </>
    );
}

const answer = (status, body) => {
    global.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), {status})));
};

const run = () => act(async () => {
    fireEvent.click(screen.getByRole('button', {name: 'Validate the configuration'}));
});

describe('ConfigValidation', () => {
    const original = global.fetch;
    afterEach(() => {
        global.fetch = original;
    });

    test('read, not posted: the configuration held, validated on its node', async () => {
        answer(200, {kind: 'ConfigAlertList', items: []});
        render(<Validation/>);
        await run();
        expect(global.fetch).toHaveBeenCalledWith(URL, expect.objectContaining({cache: 'no-cache'}));
        expect(global.fetch.mock.calls[0][1].method).toBeUndefined();
        expect(screen.getByText('The configuration is valid: no error, no warning.')).toBeInTheDocument();
        // Closed, forgotten.
        fireEvent.click(screen.getByRole('button', {name: 'Close the validation'}));
        expect(screen.queryByText(/The configuration is valid/)).toBeNull();
    });

    test('a daemon older than the validation, said so; a refusal, its reason', async () => {
        answer(404, {message: 'Not Found'});
        const {unmount} = render(<Validation/>);
        await run();
        expect(screen.getByText('This daemon does not validate a configuration: it is older than the validation.')).toBeInTheDocument();
        unmount();
        answer(403, {title: 'Forbidden', detail: 'root only'});
        render(<Validation/>);
        await run();
        expect(screen.getByText(/^The configuration could not be validated: /)).toBeInTheDocument();
    });

    test('the configuration changed since, by someone else: the result not left shown, said to validate again', async () => {
        answer(200, {kind: 'ConfigAlertList', items: [{level: 'warning', key: 'a', kind: 'deprecated'}]});
        const {rerender} = render(<Validation changes={0}/>);
        await run();
        expect(screen.getByText('1 warning')).toBeInTheDocument();
        rerender(<Validation changes={1}/>);
        expect(screen.queryByText('1 warning')).toBeNull();
        expect(screen.getByText('The configuration changed since it was validated: validate it again.')).toBeInTheDocument();
        // Validated again: the result of the configuration as it is now.
        answer(200, {kind: 'ConfigAlertList', items: []});
        await run();
        expect(screen.getByText('The configuration is valid: no error, no warning.')).toBeInTheDocument();
    });

    test('changed while validated: the answer, of the configuration before, dropped; nothing shown, nothing said', async () => {
        let respond;
        global.fetch = vi.fn(() => new Promise((resolve) => {
            respond = resolve;
        }));
        const {rerender} = render(<Validation changes={0}/>);
        await run();
        rerender(<Validation changes={1}/>);
        await act(async () => {
            respond(new Response(JSON.stringify({kind: 'ConfigAlertList', items: []}), {status: 200}));
        });
        expect(screen.queryByText(/The configuration is valid/)).toBeNull();
        expect(screen.getByText(/changed since it was validated/)).toBeInTheDocument();
        // Closed, then changed again: nothing to say of a result no longer shown.
        fireEvent.click(screen.getByRole('button', {name: 'Close the validation'}));
        rerender(<Validation changes={2}/>);
        expect(screen.queryByText(/changed since it was validated/)).toBeNull();
    });

    test('another address, the result of the last one gone', async () => {
        answer(200, {kind: 'ConfigAlertList', items: []});
        const {rerender} = render(<Validation/>);
        await run();
        expect(screen.getByText(/The configuration is valid/)).toBeInTheDocument();
        rerender(<Validation url="/api/node/name/n2/config/validate"/>);
        expect(screen.queryByText(/The configuration is valid/)).toBeNull();
    });
});
