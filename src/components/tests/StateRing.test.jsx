import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach, describe, expect, test, vi} from 'vitest';
import {StateRing} from '../StateRing';

const PARTS = [
    ['up', 3, 'stroke-state-up', {word: 'up'}],
    ['down', 1, 'stroke-state-down', {word: 'down'}],
];

/** The ring drawn in a box `width` pixels wide, its observer told at once. */
const drawn = (width) => {
    vi.stubGlobal('ResizeObserver', class {
        observe() {}
        disconnect() {}
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({width});
    const {container} = render(<MemoryRouter><StateRing parts={PARTS}/></MemoryRouter>);
    return parseFloat(container.querySelector('[data-ring-labels]').style.fontSize);
};

describe('StateRing labels', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    test('drawn wide, at their size in the drawing', () => {
        // 368px for a drawing 248 wide: 8 read at about 12px.
        expect(drawn(368)).toBe(8);
    });

    test('shrunk to a phone, larger in the drawing: read at 11.5px at the least', () => {
        const size = drawn(256);
        expect(size).toBeGreaterThan(8);
        expect(size * (256 / 248)).toBeCloseTo(11.5, 1);
    });

    test('no ResizeObserver: their size in the drawing', () => {
        vi.stubGlobal('ResizeObserver', undefined);
        const {container} = render(<MemoryRouter><StateRing parts={PARTS}/></MemoryRouter>);
        expect(container.querySelector('[data-ring-labels]').style.fontSize).toBe('8px');
    });
});

describe('StateRing links', () => {
    test('tapped elsewhere than a link of its own, the ring lets it through to the link under it', () => {
        const {container} = render(<MemoryRouter><StateRing parts={PARTS}/></MemoryRouter>);
        expect(container.firstElementChild).toHaveClass('pointer-events-none');
        // No page to its parts: no link in it.
        expect(container.querySelector('a')).toBeNull();
    });

    test('an arc of a page, its link as its label, for the pointer alone: the label the way of the keyboard', () => {
        const parts = [
            ['up', 3, 'stroke-state-up', {word: 'up', to: '/objects?globalState=up', title: 'Filtered: up'}],
            ['down', 1, 'stroke-state-down', {word: 'down'}],
        ];
        const {container} = render(<MemoryRouter><StateRing parts={parts}/></MemoryRouter>);
        const arc = container.querySelector('[data-arc-link="up"]').closest('a');
        expect(arc).toHaveAttribute('href', '/objects?globalState=up');
        expect(arc).toHaveAttribute('tabindex', '-1');
        expect(arc).not.toHaveAttribute('aria-label');
        expect(arc).toHaveClass('pointer-events-auto');
        expect(screen.getByRole('link', {name: 'Filtered: up'})).toHaveAttribute('href', '/objects?globalState=up');
        // An arc of no page, none.
        expect(container.querySelector('[data-arc="down"]').closest('a')).toBeNull();
    });

    test('an arc of a page pointed at, by itself or its label: thicker, its label underlined; left, as before', () => {
        const parts = [
            ['up', 3, 'stroke-state-up', {word: 'up', to: '/objects?globalState=up', title: 'Filtered: up'}],
            ['down', 1, 'stroke-state-down', {word: 'down', to: '/objects?globalState=down', title: 'Filtered: down'}],
        ];
        const {container} = render(<MemoryRouter><StateRing parts={parts}/></MemoryRouter>);
        const arc = (part) => container.querySelector(`[data-arc="${part}"]`);
        const text = (part) => container.querySelector(`[data-label="${part}"] text`);
        // On a card pointed at, the whole ring a little thicker.
        expect(arc('up')).toHaveClass('[[data-card]:hover_&]:[stroke-width:10]');
        fireEvent.mouseEnter(arc('down').closest('a'));
        expect(arc('down')).toHaveStyle({strokeWidth: '13'});
        expect(text('down')).toHaveClass('underline');
        expect(arc('up').style.strokeWidth).toBe('');
        fireEvent.mouseLeave(arc('down').closest('a'));
        expect(arc('down').style.strokeWidth).toBe('');
        expect(text('down')).not.toHaveClass('underline');
        // Its label pointed at, or focused from the keyboard: its arc so too.
        fireEvent.focus(screen.getByRole('link', {name: 'Filtered: up'}));
        expect(arc('up')).toHaveStyle({strokeWidth: '13'});
    });
});
