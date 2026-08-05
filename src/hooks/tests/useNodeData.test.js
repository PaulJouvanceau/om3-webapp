import {renderHook} from '@testing-library/react';
import useEventStore from '../useEventStore';
import {useNodeData} from '../useNodeData';

// Mock the useEventStore module
vi.mock('../useEventStore');

describe('useNodeData', () => {
    // Simulated store state, modifiable in each test
    let mockState;

    beforeEach(() => {
        mockState = {};
        // Mock useEventStore to execute the selector with the current state
        useEventStore.mockImplementation((selector) => selector(mockState));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    const objectName = 'testObject';
    const node = 'testNode';
    const monitorKey = `${node}:${objectName}`;

    test('returns the same reference when data does not change (covers line 44)', () => {
        // Initial state
        mockState = {
            objectInstanceStatus: {
                [objectName]: {
                    [node]: {
                        avail: 'available',
                        frozen_at: '2023-01-01T00:00:00Z',
                        provisioned: true,
                    },
                },
            },
            instanceMonitor: {
                [monitorKey]: {
                    state: 'running',
                },
            },
        };

        const {result, rerender} = renderHook(() => useNodeData(objectName, node));
        const firstResult = result.current;

        // Modify store state with an irrelevant property, but the extracted data remains the same
        mockState = {
            ...mockState,
            extraProperty: 'some value', // this does not affect the selected data
        };

        rerender();
        const secondResult = result.current;

        expect(secondResult).toBe(firstResult); // same reference
        expect(secondResult).toEqual({
            avail: 'available',
            frozen: 'frozen',
            state: 'running',
            provisioned: true,
        });
    });
});
