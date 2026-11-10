import React from 'react';
import {render, screen, fireEvent, within} from '@testing-library/react';
import {HeartbeatMesh} from '../HeartbeatMesh';

const STATUS = {
    dev3n1: {streams: [
        {id: 'hb#1.tx', type: 'unicast', state: 'running', peers: {dev3n2: {is_beating: true, desc: '→ dev3n2:10011', last_beating_at: '2026-10-16T10:00:00Z'}}},
        {id: 'hb#1.rx', type: 'unicast', state: 'running', peers: {dev3n2: {is_beating: true, desc: ':10011 ← dev3n2'}}},
    ]},
    dev3n2: {streams: [
        {id: 'hb#1.rx', type: 'unicast', state: 'running', peers: {dev3n1: {is_beating: false, desc: ':10011 ← dev3n1'}}},
        {id: 'hb#1.tx', type: 'unicast', state: 'running', peers: {dev3n1: {is_beating: true}}},
    ]},
};

const lines = (container) => [...container.querySelectorAll('[data-group]')];

/** The box of the streams beside the mesh: their ring, whatever is hovered or clicked. */
const details = () => screen.getByRole('region', {name: 'Streams'});
/** The dialog of the streams of what was clicked; none when nothing is. */
const dialog = () => screen.queryByRole('dialog');

/** The cards of the details: the fields of each, by their names. */
const cardsOf = (box, fields) => [...box.querySelectorAll('[data-link], [data-stream]')].map((card) =>
    fields.map((field) => card.querySelector(`[data-field="${field}"]`)?.textContent ?? null));

describe('HeartbeatMesh', () => {
    test('a line each way between two nodes, no fan-out, no text: the color of its links', () => {
        const {container} = render(<HeartbeatMesh heartbeatStatus={STATUS}/>);
        expect(screen.getByRole('heading', {name: 'Mesh'})).toBeInTheDocument();
        // Always shown: no fold.
        expect(document.querySelector('details')).toBeNull();
        // A key to its lines; the ring no wider than its column.
        expect([...document.querySelectorAll('[data-legend-state]')].map((key) => key.textContent)).toEqual(['all beating', 'some beating', 'none beating']);
        // In the box of the drawing, under it, not under the box.
        const legend = document.querySelector('[data-legend]');
        expect(legend.parentElement).toHaveClass('border', 'border-line');
        expect(legend.previousElementSibling).toHaveClass('aspect-square');
        // A square as wide as its box, the drawing fitted to it.
        const svg = document.querySelector('svg[role="group"]');
        expect(svg).toHaveClass('h-full', 'w-full');
        expect(svg.parentElement).toHaveClass('aspect-square');
        expect(svg.getAttribute('width')).toBe(svg.getAttribute('height'));
        expect([...container.querySelectorAll('[data-node]')].map((n) => n.dataset.node)).toEqual(['dev3n1', 'dev3n2']);
        // No text drawn on a line: what a click shows alone.
        expect(lines(container).map((g) => [g.dataset.group, g.dataset.state, g.querySelectorAll('text').length])).toEqual([
            // One end beating, the other not: a mix, orange.
            ['dev3n1 dev3n2', 'warn', 0],
            // Both ends beating: green.
            ['dev3n2 dev3n1', 'up', 0],
        ]);
        // Each line in two halves: the tx of the sender, beating; the rx of the receiver, not.
        const halves = (g) => [...g.querySelectorAll('[data-half]')].map((h) => [h.dataset.half, h.dataset.state, h.getAttribute('class')]);
        expect(halves(lines(container)[0])).toEqual([['tx', 'up', 'stroke-state-up'], ['rx', 'down', 'stroke-state-down']]);
        expect(halves(lines(container)[1])).toEqual([['tx', 'up', 'stroke-state-up'], ['rx', 'up', 'stroke-state-up']]);
        expect(lines(container)[0]).toHaveAccessibleName('dev3n1 to dev3n2: 1 of 2 links beating');
    });

    test('a half hovered: outlined; the box of the streams kept as it is', () => {
        const {container} = render(<HeartbeatMesh heartbeatStatus={STATUS}/>);
        const [forward] = lines(container);
        const tx = forward.querySelector('[data-hover="tx"]');
        fireEvent.mouseEnter(tx);
        // Outlined, its arrow as it is; the other half not.
        expect([...forward.querySelectorAll('[data-outline]')].map((o) => o.dataset.outline)).toEqual(['tx']);
        // Its head outlined too: a larger head of the same shape under the arrow's.
        const head = forward.querySelector('[data-outline] [marker-end]').getAttribute('marker-end').match(/#([^)]+)/)[1];
        expect(document.getElementById(head)).toHaveAttribute('markerUnits', 'userSpaceOnUse');
        expect(forward.querySelector('[data-half="tx"]')).toHaveAttribute('stroke-width', '2');
        fireEvent.mouseLeave(tx);
        expect(forward.querySelector('[data-outline]')).toBeNull();
        expect(details().querySelector('[data-overall]')).not.toBeNull();
        expect(dialog()).toBeNull();
        // Only the halves are hover targets: none over the whole line, the gap included.
        expect([...forward.querySelectorAll('[data-hover]')].map((h) => h.dataset.hover)).toEqual(['tx', 'rx']);
    });

    test('a half clicked: its links in a dialog, titled as its end sees it; closed, let go', () => {
        const onSelect = vi.fn();
        const {container, rerender} = render(<HeartbeatMesh heartbeatStatus={STATUS} onSelect={onSelect} selected={null}/>);
        const [forward, backward] = lines(container);
        const tx = forward.querySelector('[data-hover="tx"]');
        // The press does not move the focus to the line.
        expect(fireEvent.mouseDown(tx)).toBe(false);
        fireEvent.click(tx);
        expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({key: 'dev3n1 dev3n2'}));
        rerender(<HeartbeatMesh heartbeatStatus={STATUS} onSelect={onSelect} selected="dev3n1 dev3n2"/>);
        const box = screen.getByRole('dialog', {name: 'Seen from dev3n1, outgoing to dev3n2'});
        expect(box).toHaveTextContent('1 of 1 beating');
        // A half: its side and node in the title, not on its cards; the cards by their heartbeat, type and description.
        expect(cardsOf(box, ['hb', 'type', 'desc']).map((fields) => fields.join(' '))).toEqual(['hb#1 unicast → dev3n2:10011']);
        expect(box.querySelector('[data-field="side"]')).toBeNull();
        // The description, cut short in a narrow card, whole in a popup hovered.
        expect(forward).toHaveAttribute('data-pinned', 'true');
        // The box of the streams beside the mesh not taken: its ring still.
        expect(details().querySelector('[data-overall]')).not.toBeNull();
        // Closed: let go, the selection of the page dropped.
        fireEvent.keyDown(box, {key: 'Escape'});
        expect(onSelect).toHaveBeenLastCalledWith(null);
        rerender(<HeartbeatMesh heartbeatStatus={STATUS} onSelect={onSelect} selected={null}/>);
        expect(dialog()).toBeNull();
        // The other way: its own title.
        fireEvent.click(backward.querySelector('[data-hover="rx"]'));
        expect(screen.getByRole('dialog', {name: 'Seen from dev3n1, incoming from dev3n2'})).toHaveTextContent('beating');
    });

    test('a line from the keyboard: Enter shows all its links, each with all of its data', () => {
        const {container} = render(<HeartbeatMesh heartbeatStatus={STATUS}/>);
        const [forward] = lines(container);
        fireEvent.focus(forward);
        expect(dialog()).toBeNull();
        fireEvent.keyDown(forward, {key: 'Enter'});
        const box = screen.getByRole('dialog', {name: 'dev3n1 → dev3n2'});
        expect(box).toHaveTextContent('1 of 2 beating');
        // Relative to now, as the fixture ages: "… ago", "yesterday", "last week"…
        const relative = expect.stringMatching(/ago|in |yesterday|last /);
        expect(cardsOf(box, ['hb', 'side', 'type', 'desc', 'status', 'beat'])).toEqual([
            ['hb#1', 'tx · dev3n1', 'unicast', '→ dev3n2:10011', 'Beating', relative],
            ['hb#1', 'rx · dev3n2', 'unicast', ':10011 ← dev3n1', 'Stale', '–'],
        ]);
        // Cards wrapping, alike the cards of the heartbeats and the routines.
        expect(box.querySelector('ul')).toHaveClass('grid', 'grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]');
        expect(box.querySelector('li[data-link]')).toHaveClass('rounded-(--radius-control)', 'border', 'border-transparent', 'bg-surface-sunken');
    });

    test('a line none of whose links beat is red', () => {
        const status = {
            a: {streams: [{id: 'hb#1.tx', type: 'unicast', state: 'stopped', peers: {b: {is_beating: true}}}]},
            b: {streams: [{id: 'hb#1.rx', type: 'unicast', state: 'running', peers: {a: {is_beating: false}}}]},
        };
        const {container} = render(<HeartbeatMesh heartbeatStatus={status}/>);
        expect(lines(container).map((g) => g.dataset.state)).toEqual(['down']);
    });

    test('a half whose end reports no link: grey and dashed', () => {
        const status = {
            a: {streams: [{id: 'hb#1.tx', type: 'unicast', state: 'running', peers: {b: {is_beating: true}}}]},
            b: {streams: []},
        };
        const {container} = render(<HeartbeatMesh heartbeatStatus={status}/>);
        const rx = lines(container)[0].querySelector('[data-half="rx"]');
        expect(rx).toHaveAttribute('data-state', 'none');
        expect(rx).toHaveClass('stroke-line');
        expect(rx).toHaveAttribute('stroke-dasharray', '4 3');
    });

    test('a node orange when some of its routines are stopped, red when all are; clicked, a dialog says which', () => {
        const status = {
            a: {streams: [
                {id: 'hb#1.tx', type: 'unicast', state: 'stopped', peers: {b: {is_beating: false}}},
                {id: 'hb#1.rx', type: 'unicast', state: 'running', peers: {b: {is_beating: true}}},
            ]},
            b: {streams: [
                {id: 'hb#1.tx', type: 'unicast', state: 'stopped', peers: {a: {is_beating: false}}},
                {id: 'hb#1.rx', type: 'unicast', state: 'failed', peers: {a: {is_beating: false}}},
            ]},
            c: {streams: [{id: 'hb#1.rx', type: 'unicast', state: 'running', peers: {a: {is_beating: true}}}]},
        };
        const {container} = render(<HeartbeatMesh heartbeatStatus={status}/>);
        const node = (name) => container.querySelector(`[data-node="${name}"]`);
        expect(['a', 'b', 'c'].map((name) => node(name).dataset.state)).toEqual(['warn', 'down', 'up']);
        expect(node('a').querySelector('rect')).toHaveClass('stroke-state-warn');
        expect(node('b').querySelector('rect')).toHaveClass('stroke-state-down');
        expect(node('c').querySelector('rect')).toHaveClass('stroke-line');
        fireEvent.click(node('b'));
        const box = screen.getByRole('dialog', {name: 'b'});
        expect(box).toHaveTextContent('2 of 2 routines stopped');
        expect(cardsOf(box, ['id', 'type', 'state'])).toEqual([['hb#1.tx', 'unicast', 'stopped'], ['hb#1.rx', 'unicast', 'failed']]);
        fireEvent.keyDown(box, {key: 'Escape'});
        expect(dialog()).toBeNull();
        fireEvent.keyDown(node('a'), {key: 'Enter'});
        expect([...screen.getByRole('dialog', {name: 'a'}).querySelectorAll('[data-stream]')].map((r) => r.dataset.stream)).toEqual(['hb#1.tx']);
        fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape'});
        // All running: nothing to click.
        expect(node('c')).not.toHaveAttribute('role');
        fireEvent.click(node('c'));
        expect(dialog()).toBeNull();
    });

    test('a half titled as its end sees it, in French too', async () => {
        const {default: i18n} = await import('../../i18n');
        await i18n.changeLanguage('fr');
        try {
            const {container} = render(<HeartbeatMesh heartbeatStatus={STATUS}/>);
            fireEvent.click(lines(container)[1].querySelector('[data-hover="rx"]'));
            expect(screen.getByRole('dialog', {name: 'Vu de dev3n1, entrant de dev3n2'})).toBeInTheDocument();
            fireEvent.keyDown(screen.getByRole('dialog'), {key: 'Escape'});
            fireEvent.click(lines(container)[1].querySelector('[data-hover="tx"]'));
            expect(screen.getByRole('dialog', {name: 'Vu de dev3n2, sortant vers dev3n1'})).toBeInTheDocument();
        } finally {
            await i18n.changeLanguage('en');
        }
    });

    test('all the streams in a ring, in the colours of the gauges, optimal when all beat; kept whatever is clicked', () => {
        const all = {
            a: {streams: [{id: 'hb#1.tx', type: 'unicast', state: 'running', peers: {b: {is_beating: true}}}]},
            b: {streams: [{id: 'hb#1.rx', type: 'unicast', state: 'running', peers: {a: {is_beating: true}}}]},
        };
        const {rerender} = render(<HeartbeatMesh heartbeatStatus={all}/>);
        const overall = () => details().querySelector('[data-overall]');
        const arcs = () => [...overall().querySelectorAll('[data-arc]')].map((arc) => [
            // Its colour, the first of its classes; those after, how it grows when pointed at.
            arc.dataset.arc, arc.getAttribute('class').split(' ')[0], Math.round(parseFloat(arc.getAttribute('stroke-dasharray'))), Math.round(0 - arc.getAttribute('stroke-dashoffset')),
        ]);
        const round = Math.round(2 * Math.PI * 52);
        expect(overall()).toHaveTextContent('2/2streams operationaloptimal');
        expect(overall().querySelector('.font-semibold.text-state-up')).toHaveTextContent('optimal');
        // On the grey of the cards, a single arc all round, in the colour of the beating dots.
        expect(overall().querySelector('circle')).toHaveClass('stroke-surface-sunken');
        expect(arcs()).toEqual([['up', 'stroke-state-up', round, 0]]);
        // Some beating, some failing, a stream stopped: their arcs one after the other, in that order.
        rerender(<HeartbeatMesh heartbeatStatus={{
            a: {streams: [
                {id: 'hb#1.tx', type: 'unicast', state: 'running', peers: {b: {is_beating: true}}},
                {id: 'hb#1.rx', type: 'unicast', state: 'running', peers: {b: {is_beating: false}}},
            ]},
            b: {streams: [
                {id: 'hb#1.tx', type: 'unicast', state: 'stopped', peers: {a: {is_beating: false}}},
                {id: 'hb#1.rx', type: 'unicast', state: 'running', peers: {a: {is_beating: true}}},
            ]},
        }}/>);
        expect(overall()).toHaveAttribute('data-overall', 'warn');
        expect(overall()).toHaveTextContent('2/4streams operationaldegraded');
        const quarter = 2 * Math.PI * 52 / 4;
        expect(arcs()).toEqual([
            ['up', 'stroke-state-up', Math.round(2 * quarter), 0],
            ['down', 'stroke-state-down', Math.round(quarter), Math.round(2 * quarter)],
            ['stopped', 'stroke-line', Math.round(quarter), Math.round(3 * quarter)],
        ]);
        // Something clicked: its streams in a dialog, the ring kept.
        fireEvent.keyDown(lines(document.body)[0], {key: 'Enter'});
        expect(dialog()).not.toBeNull();
        expect(overall()).not.toBeNull();
    });

    test('no heartbeat reported: no mesh', () => {
        const {container} = render(<HeartbeatMesh heartbeatStatus={{}}/>);
        expect(container).toBeEmptyDOMElement();
    });
});

