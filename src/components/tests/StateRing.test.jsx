import React from 'react';
import {render} from '@testing-library/react';
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
