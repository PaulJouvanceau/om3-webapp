import React from 'react';
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import ConfigEvalDialog from '../ConfigEvalDialog';

const URL = '/api/cluster/config';
const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
const item = (keyword, value, evaluated_text, as = 'n1') => ({keyword, value, evaluated_text, evaluated: evaluated_text, evaluated_as: as});

let requests;
let answer;

beforeEach(() => {
    localStorage.setItem('authToken', 'tok');
    requests = [];
    answer = () => json(200, {items: [item('nodes', '*', 'n1 n2'), item('cluster.secret', 'abc123', 'abc123')]});
    global.fetch = vi.fn((url) => {
        requests.push(url);
        if (url.includes('/config/file')) return Promise.resolve(new Response('[DEFAULT]\nnodes = *\n\n[cluster]\nsecret = ********\n', {status: 200}));
        return Promise.resolve(answer(url));
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
});

const evaluations = () => requests.filter((u) => !u.includes('/config/file'));
const rows = () => within(screen.getByRole('table', {name: 'Keywords evaluated'})).getAllByRole('row').slice(1)
    .map((r) => [...r.querySelectorAll('th, td')].map((c) => c.textContent));

describe('the keywords evaluated', () => {
    test('opened: the keywords set, evaluated on the node answering, the secrets the file masks masked', async () => {
        render(<ConfigEvalDialog open onClose={vi.fn()} configUrl={URL} subject="cluster" nodes={['n1', 'n2']}/>);
        await waitFor(() => expect(rows()).toEqual([
            ['nodes', '*', 'n1 n2'],
            ['cluster.secret', '********', '********'],
        ]));
        expect(evaluations()).toEqual([`${URL}?evaluate=true`]);
        expect(screen.getByText(/Evaluated as n1\./)).toBeInTheDocument();
        // Shown on demand, masked again after a while.
        fireEvent.click(screen.getByRole('button', {name: 'Show secrets'}));
        expect(rows()[1]).toEqual(['cluster.secret', 'abc123', 'abc123']);
    });

    test('a keyword not evaluated, the whole configuration asked: why, beside it', async () => {
        answer = () => json(200, {items: [
            item('nodes', '*', 'n1 n2'),
            {keyword: 'env.db', value: '{cfg.x}', evaluated_as: 'n1', error: 'reference cfg.x not found'},
        ]});
        render(<ConfigEvalDialog open onClose={vi.fn()} configUrl={URL} subject="cluster" nodes={['n1']}/>);
        await waitFor(() => expect(rows()[1]).toEqual(['env.db', '{cfg.x}', 'reference cfg.x not found']));
    });

    test('as another node: impersonated at once; patterns asked by kw', async () => {
        render(<ConfigEvalDialog open onClose={vi.fn()} configUrl={URL} subject="cluster" nodes={['n1', 'n2']}/>);
        await waitFor(() => expect(evaluations()).toHaveLength(1));
        fireEvent.change(screen.getByRole('combobox', {name: 'Evaluate as'}), {target: {value: 'n2'}});
        await waitFor(() => expect(evaluations()).toHaveLength(2));
        expect(evaluations()[1]).toBe(`${URL}?evaluate=true&impersonate=n2`);
        fireEvent.change(screen.getByRole('textbox', {name: 'Keywords'}), {target: {value: 'hb#1.*, DEFAULT.nodes'}});
        await act(() => fireEvent.click(screen.getByRole('button', {name: 'Evaluate'})));
        await waitFor(() => expect(evaluations()).toHaveLength(3));
        expect(evaluations()[2]).toBe(`${URL}?evaluate=true&impersonate=n2&kw=hb%231.*&kw=DEFAULT.nodes`);
    });

    test('a keyword the daemon does not know: its words said', async () => {
        render(<ConfigEvalDialog open onClose={vi.fn()} configUrl={URL} subject="cluster" nodes={[]}/>);
        await waitFor(() => expect(evaluations()).toHaveLength(1));
        answer = () => json(400, {title: 'EvalAs', detail: 'keyword does not exist: "fs#1.mnt"'});
        fireEvent.change(screen.getByRole('textbox', {name: 'Keywords'}), {target: {value: 'fs#1.mnt'}});
        await act(() => fireEvent.click(screen.getByRole('button', {name: 'Evaluate'})));
        expect(await screen.findByRole('alert')).toHaveTextContent('keyword does not exist: "fs#1.mnt"');
        expect(screen.queryByRole('table')).toBeNull();
    });

    test('the nodes not known: the node typed', async () => {
        render(<ConfigEvalDialog open onClose={vi.fn()} configUrl={URL} subject="cluster" nodes={[]}/>);
        expect(screen.getByRole('textbox', {name: 'Evaluate as'})).toBeInTheDocument();
    });

    test('a configuration of one node: evaluated there, no node to pick', async () => {
        render(<ConfigEvalDialog open onClose={vi.fn()} configUrl="/api/node/name/n1/config" subject="n1" nodes={null}/>);
        await waitFor(() => expect(evaluations()).toEqual(['/api/node/name/n1/config?evaluate=true']));
        expect(screen.queryByRole('combobox', {name: 'Evaluate as'})).toBeNull();
        expect(screen.queryByRole('textbox', {name: 'Evaluate as'})).toBeNull();
    });

    test('the redacted file not read: every value masked', async () => {
        global.fetch = vi.fn((url) => Promise.resolve(url.includes('/config/file')
            ? new Response('no', {status: 500})
            : json(200, {items: [item('nodes', '*', 'n1 n2')]})));
        render(<ConfigEvalDialog open onClose={vi.fn()} configUrl={URL} subject="cluster" nodes={[]}/>);
        await waitFor(() => expect(rows()).toEqual([['nodes', '********', '********']]));
    });
});
