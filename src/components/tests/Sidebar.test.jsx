import React from 'react';
import {render, screen, act, renderHook, within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {describe, test, expect, beforeEach, afterEach, vi} from 'vitest';
import {Sidebar, NAV_ROUTES, useSidebarOpen} from '../Sidebar';
import i18n from '../../i18n';

const {mockPills} = vi.hoisted(() => ({mockPills: {current: {}}}));
vi.mock('../../hooks/useSidebarAlerts', () => ({default: () => mockPills.current}));

function renderSidebar(open = true, path = '/cluster') {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Sidebar open={open}/>
        </MemoryRouter>
    );
}

describe('Sidebar', () => {
    beforeEach(() => {
        localStorage.clear();
        mockPills.current = {};
    });

    test.each([
        ['Heartbeats', 'text-icon-network'],
        ['Kinds', 'text-icon-tag'],
        ['Namespaces', 'text-icon-app'],
        ['Networks', 'text-icon-network'],
        ['Nodes', 'text-icon-node'],
        ['Objects', 'text-icon-service'],
        ['Pools', 'text-icon-disk'],
    ])('draws the %s entry with its oc3 icon, tinted %s', (name, tint) => {
        renderSidebar();
        const icon = screen.getByRole('link', {name: new RegExp(`^${name}`)}).querySelector('svg');
        expect(icon).toHaveClass(tint);
        expect(icon).toHaveAttribute('aria-hidden', 'true');
    });

    test('shows the details of an entry on mouseover', () => {
        mockPills.current = {'/nodes': {counts: [{state: 'frozen', count: 1}], details: ['2 nodes', 'frozen: 1']}};
        renderSidebar();
        expect(screen.getByRole('link', {name: /^Nodes/})).toHaveAttribute('title', '2 nodes\nfrozen: 1');
    });

    test('shows the details of an entry even without a pill', () => {
        mockPills.current = {'/pools': {counts: [], details: ['1 pool', 'full: 0']}};
        renderSidebar();
        expect(screen.queryByTestId('counts-pools')).toBeNull();
        expect(screen.getByRole('link', {name: /^Pools/})).toHaveAttribute('title', '1 pool\nfull: 0');
    });

    test('shows no pill when there is nothing to report', () => {
        renderSidebar();
        expect(screen.queryByTestId(/^counts-/)).toBeNull();
    });

    test.each([
        ['/nodes', 'frozen', 'bg-icon-network', '3 frozen'],
        ['/pools', 'down', 'bg-state-down', '2 full'],
        ['/network', 'down', 'bg-state-down', '1 full'],
    ])('numbers the alarming %s in a %s pill', (path, state, className, text) => {
        const count = Number(text.split(' ')[0]);
        mockPills.current = {[path]: {counts: [{state, count}], details: []}};
        renderSidebar();
        const pills = [...screen.getByTestId(`counts-${path.slice(1)}`).children];
        expect(pills).toHaveLength(1);
        expect(pills[0]).toHaveAttribute('data-state', state);
        expect(pills[0]).toHaveClass(className);
        expect(pills[0].firstChild.textContent).toBe(String(count));
        expect(pills[0]).toHaveTextContent(text);
        // Not a link: only the pills of the Objects entry are.
        expect(pills[0].tagName).toBe('SPAN');
    });

    test.each([
        ['/objects', 'up', 'down', 'n/a'],
        ['/namespaces', 'up', 'down', 'n/a'],
        ['/kinds', 'up', 'down', 'n/a'],
        ['/heartbeats', 'beating', 'stale or stopped', 'n/a'],
    ])('numbers the %s by state with coloured pills', (path, upLabel, downLabel, unknownLabel) => {
        mockPills.current = {
            [path]: {counts: [
                {state: 'up', count: 49},
                {state: 'warn', count: 2},
                {state: 'down', count: 12},
                {state: 'unknown', count: 18},
            ]},
        };
        renderSidebar();
        const pill = screen.getByTestId(`counts-${path.slice(1)}`);
        // One pill, its segments flush, rounded as a whole.
        expect(pill).toHaveClass('rounded-full', 'overflow-hidden');
        expect(pill).not.toHaveClass('gap-0.5');
        const pills = [...pill.children];
        pills.forEach((segment) => expect(segment).not.toHaveClass('rounded-full'));
        expect(pills.map((pill) => pill.getAttribute('data-state'))).toEqual(['up', 'warn', 'down', 'unknown']);
        expect(pills.map((pill) => pill.firstChild.textContent)).toEqual(['49', '2', '12', '18']);
        expect(pills[0]).toHaveClass('bg-state-up');
        expect(pills[1]).toHaveClass('bg-state-warn');
        expect(pills[2]).toHaveClass('bg-state-down');
        expect(pills[3]).toHaveClass('bg-state-unknown');
        expect(pills[0]).toHaveTextContent(`49 ${upLabel}`);
        expect(pills[2]).toHaveTextContent(`12 ${downLabel}`);
        expect(pills[3]).toHaveTextContent(`18 ${unknownLabel}`);
    });

    test('links each Objects pill to the Objects page filtered on its state', () => {
        mockPills.current = {
            '/objects': {counts: [
                {state: 'up', count: 49},
                {state: 'warn', count: 2},
                {state: 'down', count: 12},
                {state: 'unknown', count: 18},
            ]},
        };
        renderSidebar();
        expect(screen.getByRole('link', {name: /^49 up/})).toHaveAttribute('href', '/objects?globalState=up');
        expect(screen.getByRole('link', {name: /^2 warn/})).toHaveAttribute('href', '/objects?globalState=warn');
        expect(screen.getByRole('link', {name: /^12 down/})).toHaveAttribute('href', '/objects?globalState=down');
        expect(screen.getByRole('link', {name: /^18 n\/a/})).toHaveAttribute('href', '/objects?globalState=n%2Fa');
    });

    test('keeps the pills out of the menu link, which holds the name only', () => {
        mockPills.current = {'/objects': {counts: [{state: 'down', count: 12}]}};
        renderSidebar();
        const entry = screen.getByRole('link', {name: 'Objects'});
        expect(entry).toHaveAttribute('href', '/objects');
        expect(entry).not.toContainElement(screen.getByTestId('counts-objects'));
    });

    test('leaves the cluster overview and the user page to the top bar', () => {
        renderSidebar();
        expect(screen.queryByRole('link', {name: /^Cluster/})).toBeNull();
        expect(screen.queryByRole('link', {name: /^Who Am I/})).toBeNull();
    });

    test('lists the views in alphabetical order, kinds and namespaces under objects', () => {
        renderSidebar();
        const names = screen.getAllByRole('link').map((link) => link.textContent);
        expect(names.map((name) => name.replace(/(all up|warn|down|no status|frozen|a .* is .*)$/, '')))
            .toEqual(['Heartbeats', 'Networks', 'Nodes', 'Objects', 'Kinds', 'Namespaces', 'Pools']);
    });

    test('groups kinds and namespaces in a list nested under the objects entry', () => {
        renderSidebar();
        const objects = screen.getByRole('link', {name: /^Objects/}).closest('li');
        const nested = within(objects).getByRole('list');
        expect(within(nested).getAllByRole('link').map((link) => link.getAttribute('href')))
            .toEqual(['/kinds', '/namespaces']);
    });

    test('lists every view', () => {
        renderSidebar();
        const nav = screen.getByRole('navigation', {name: 'Main'});
        expect(nav).toBeInTheDocument();
        for (const {path, labelKey} of NAV_ROUTES.flatMap((route) => [route, ...(route.children ?? [])])) {
            expect(screen.getByRole('link', {name: new RegExp(`^${i18n.t(labelKey)}`)})).toHaveAttribute('href', path);
        }
    });

    test('marks the view on display', () => {
        renderSidebar(true, '/nodes');
        expect(screen.getByRole('link', {name: /^Nodes/})).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('link', {name: /^Objects/})).not.toHaveAttribute('aria-current');
    });

    test('marks the parent view on a detail page', () => {
        renderSidebar(true, '/network/default');
        expect(screen.getByRole('link', {name: /^Networks/})).toHaveAttribute('aria-current', 'page');
    });

    test('is taken out of the keyboard path when folded', () => {
        const {container} = renderSidebar(false);
        const aside = container.querySelector('#app-sidebar');
        expect(aside).toHaveAttribute('inert');
        expect(aside).toHaveClass('w-0');
    });

    test('is open and reachable when unfolded', () => {
        const {container} = renderSidebar(true);
        const aside = container.querySelector('#app-sidebar');
        expect(aside).not.toHaveAttribute('inert');
        expect(aside).toHaveClass('w-60');
    });
});

describe('useSidebarOpen', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('is open by default and remembers the folded state', () => {
        const {result} = renderHook(() => useSidebarOpen());
        expect(result.current[0]).toBe(true);
        act(() => result.current[1]());
        expect(result.current[0]).toBe(false);
        expect(localStorage.getItem('om3.sidebar')).toBe('closed');

        const {result: reloaded} = renderHook(() => useSidebarOpen());
        expect(reloaded.current[0]).toBe(false);
    });

    test('opens when storage is refused', () => {
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('denied');
        });
        try {
            const {result} = renderHook(() => useSidebarOpen());
            expect(result.current[0]).toBe(true);
        } finally {
            spy.mockRestore();
        }
    });
});

describe('Sidebar in French', () => {
    afterEach(async () => {
        await i18n.changeLanguage('en');
    });

    test('names the entries in French', async () => {
        await i18n.changeLanguage('fr');
        renderSidebar();
        expect(screen.getByRole('navigation', {name: 'Principal'})).toBeInTheDocument();
        expect(screen.getByRole('link', {name: /^Nœuds/})).toHaveAttribute('href', '/nodes');
        expect(screen.getByRole('link', {name: /^Namespaces/})).toHaveAttribute('href', '/namespaces');
    });

    test('says what the counts are in French', async () => {
        await i18n.changeLanguage('fr');
        mockPills.current = {'/nodes': {counts: [{state: 'frozen', count: 2}]}};
        renderSidebar();
        expect(screen.getByTestId('counts-nodes').querySelector('[data-state="frozen"]'))
            .toHaveAttribute('title', '2 gelés');
    });
});
