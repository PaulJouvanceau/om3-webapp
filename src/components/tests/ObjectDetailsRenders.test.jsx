import React, {act} from 'react';
import {render} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {vi} from 'vitest';
import ObjectDetail from '../ObjectDetails';
import useEventStore from '../../hooks/useEventStore.js';

// The page against the store itself, its renders counted by its header.
const {headerRenders} = vi.hoisted(() => ({headerRenders: vi.fn()}));

vi.mock('../HeaderSection', () => ({
    __esModule: true,
    default: () => {
        headerRenders();
        return null;
    },
}));

vi.mock('../../eventSourceManager.jsx', () => ({
    retainEventReception: () => () => {},
}));

const PATH = 'ns1/svc/a';

describe('ObjectDetail renders', () => {
    beforeEach(() => {
        headerRenders.mockClear();
        useEventStore.setState({
            objectStatus: {[PATH]: {avail: 'up'}, 'ns1/svc/b': {avail: 'up'}},
            objectInstanceStatus: {[PATH]: {n1: {avail: 'up'}}, 'ns1/svc/b': {n1: {avail: 'up'}}},
            instanceMonitor: {[`n1:${PATH}`]: {state: 'idle'}, 'n1:ns1/svc/b': {state: 'idle'}},
            instanceConfig: {},
        });
    });

    test('a monitor event of another object renders it not again, one of its own does', () => {
        render(<MemoryRouter><ObjectDetail path={PATH} embedded/></MemoryRouter>);
        const before = headerRenders.mock.calls.length;

        act(() => {
            useEventStore.setState((s) => ({
                instanceMonitor: {...s.instanceMonitor, 'n1:ns1/svc/b': {state: 'starting'}},
            }));
        });
        expect(headerRenders.mock.calls.length).toBe(before);

        act(() => {
            useEventStore.setState((s) => ({
                instanceMonitor: {...s.instanceMonitor, [`n1:${PATH}`]: {state: 'starting'}},
            }));
        });
        expect(headerRenders.mock.calls.length).toBeGreaterThan(before);
    });
});
