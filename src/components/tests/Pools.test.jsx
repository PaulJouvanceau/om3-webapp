import React from 'react';
import {render, screen, waitFor, fireEvent, within} from '@testing-library/react';
import '@testing-library/jest-dom';
import {vi, describe, test, expect, beforeEach, afterEach} from 'vitest';
import axios from 'axios';
import Pools from '../Pools';
import {URL_POOL} from '../../config/apiPath.js';

// ── Mocks ──────────────────────────────────────────────────────────────
vi.mock('axios', () => ({
    default: {
        get: vi.fn(),
    },
}));

// Mock localStorage
const mockLocalStorage = {
    getItem: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
});

// Sample pool data
const mockPools = [
    {name: 'pool1', type: 'zfs', volume_count: 5, used: 50, size: 100, head: 'node1'},
    {name: 'pool2', type: 'lvm', volume_count: 3, used: 0, size: 200, head: 'node2'},
    {name: 'pool3', type: 'ext4', volume_count: 10, used: 75, size: 100, head: 'node3'},
];

describe('Pools Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLocalStorage.getItem.mockReturnValue('mock-token');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('renders table headers correctly', async () => {
        axios.get.mockResolvedValueOnce({data: {items: []}});

        render(<Pools/>);

        await waitFor(() => {
            expect(screen.getByText('Name')).toBeInTheDocument();
            expect(screen.getByText('Type')).toBeInTheDocument();
            expect(screen.getByText('Volume Count')).toBeInTheDocument();
            expect(screen.getByText('Usage')).toBeInTheDocument();
            expect(screen.getByText('Head')).toBeInTheDocument();
        });
    });

    test('displays pool data correctly when API call succeeds', async () => {
        axios.get.mockResolvedValueOnce({data: {items: mockPools}});

        render(<Pools/>);

        await waitFor(() => {
            expect(screen.getByText('pool1')).toBeInTheDocument();
            expect(screen.getByText('zfs')).toBeInTheDocument();
            expect(screen.getByText('5')).toBeInTheDocument();
            expect(screen.getByText('50.0%')).toBeInTheDocument();
            expect(screen.getByText('node1')).toBeInTheDocument();

            expect(screen.getByText('pool2')).toBeInTheDocument();
            expect(screen.getByText('lvm')).toBeInTheDocument();
            expect(screen.getByText('3')).toBeInTheDocument();
            expect(screen.getByText('0.0%')).toBeInTheDocument();
            expect(screen.getByText('node2')).toBeInTheDocument();

            expect(screen.getByText('pool3')).toBeInTheDocument();
            expect(screen.getByText('ext4')).toBeInTheDocument();
            expect(screen.getByText('10')).toBeInTheDocument();
            expect(screen.getByText('75.0%')).toBeInTheDocument();
            expect(screen.getByText('node3')).toBeInTheDocument();
        });

        expect(axios.get).toHaveBeenCalledWith(URL_POOL, {
            headers: {Authorization: 'Bearer mock-token'},
        });
    });

    test('handles API error gracefully', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        });
        axios.get.mockRejectedValueOnce(new Error('API Error'));

        render(<Pools/>);

        await waitFor(() => {
            expect(consoleErrorSpy).toHaveBeenCalledWith('Error retrieving pools', expect.any(Error));
            expect(screen.queryByText('pool1')).not.toBeInTheDocument();
            expect(screen.queryByText('pool2')).not.toBeInTheDocument();

            const alert = screen.getByRole('alert');
            expect(alert).toHaveClass('MuiAlert-standardError');
            expect(within(alert).getByText('Failed to load pools. Please try again.')).toBeInTheDocument();
            expect(within(alert).getByRole('button', {name: /retry/i})).toBeInTheDocument();
        });

        consoleErrorSpy.mockRestore();
    });

    test('does not update state when component is unmounted during API error', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        });
        axios.get.mockImplementationOnce(
            () =>
                new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('API Error')), 100);
                })
        );

        const {unmount} = render(<Pools/>);
        unmount();

        await new Promise((resolve) => setTimeout(resolve, 150));

        expect(consoleErrorSpy).toHaveBeenCalledWith('Error retrieving pools', expect.any(Error));
        expect(screen.queryByText('Failed to load pools. Please try again.')).not.toBeInTheDocument();

        consoleErrorSpy.mockRestore();
    });

    test('displays N/A for usage when used is negative', async () => {
        const poolsWithNegativeUsed = [
            {name: 'pool4', type: 'zfs', volume_count: 2, used: -10, size: 100, head: 'node4'},
        ];
        axios.get.mockResolvedValueOnce({data: {items: poolsWithNegativeUsed}});

        render(<Pools/>);

        await waitFor(() => {
            expect(screen.getByText('pool4')).toBeInTheDocument();
        });

        const usageCell = screen.getByText((content, element) => content.includes('N/A') && element.tagName === 'TD');
        expect(usageCell).toBeInTheDocument();
    });

    test('handles pools with missing properties', async () => {
        const poolsWithMissingProps = [
            {name: null, type: undefined, volume_count: null, used: undefined, size: null, head: undefined},
        ];
        axios.get.mockResolvedValueOnce({data: {items: poolsWithMissingProps}});

        render(<Pools/>);

        await waitFor(() => {
            const naElements = screen.getAllByText((content, element) => content.includes('N/A') && element.tagName === 'TD');
            expect(naElements.length).toBe(5);
        });
    });

    test('handles API response with null items', async () => {
        axios.get.mockResolvedValueOnce({data: {items: null}});

        render(<Pools/>);

        await waitFor(() => {
            expect(screen.getByText('No pools available.')).toBeInTheDocument();
        });
    });

    test('calls API with correct authorization token', async () => {
        axios.get.mockResolvedValueOnce({data: {items: []}});

        render(<Pools/>);

        await waitFor(() => {
            expect(axios.get).toHaveBeenCalledWith(URL_POOL, {
                headers: {Authorization: 'Bearer mock-token'},
            });
        });
    });

    test('displays "No pools available." when API returns an empty list', async () => {
        axios.get.mockResolvedValueOnce({data: {items: []}});

        render(<Pools/>);

        await waitFor(() => {
            expect(screen.getByText('No pools available.')).toBeInTheDocument();
        });
    });

    test('displays error and allows retry on failure', async () => {
        axios.get.mockRejectedValueOnce(new Error('API Error'));

        render(<Pools/>);

        await waitFor(() => {
            expect(screen.getByText('Failed to load pools. Please try again.')).toBeInTheDocument();
            expect(screen.getByRole('button', {name: /retry/i})).toBeInTheDocument();
        });

        // Second call succeeds
        axios.get.mockResolvedValueOnce({data: {items: mockPools}});

        const retryButton = screen.getByRole('button', {name: /retry/i});
        fireEvent.click(retryButton);

        await waitFor(() => {
            expect(screen.getByText('pool1')).toBeInTheDocument();
            expect(screen.getByText('pool2')).toBeInTheDocument();
            expect(screen.getByText('pool3')).toBeInTheDocument();
            expect(screen.queryByText('Failed to load pools. Please try again.')).not.toBeInTheDocument();
        });

        expect(axios.get).toHaveBeenCalledTimes(2);
    });

    test('handles retry with missing auth token', async () => {
        axios.get.mockRejectedValueOnce(new Error('API Error'));

        render(<Pools/>);

        await waitFor(() => {
            expect(screen.getByText('Failed to load pools. Please try again.')).toBeInTheDocument();
        });

        mockLocalStorage.getItem.mockReturnValue(null);
        axios.get.mockRejectedValueOnce(new Error('No Token'));

        const retryButton = screen.getByRole('button', {name: /retry/i});
        fireEvent.click(retryButton);

        await waitFor(() => {
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(screen.getByText('Failed to load pools. Please try again.')).toBeInTheDocument();
        });

        expect(axios.get).toHaveBeenCalledWith(URL_POOL, {
            headers: {Authorization: 'Bearer null'},
        });
        expect(axios.get).toHaveBeenCalledTimes(2);
    });

    test('sorts table by different columns', async () => {
        axios.get.mockResolvedValueOnce({data: {items: mockPools}});

        render(<Pools/>);

        await waitFor(() => {
            expect(screen.getByText('pool1')).toBeInTheDocument();
        });

        const getRows = () => screen.getAllByRole('row', {name: /pool[1-3]/});

        // initial name asc
        await waitFor(() => {
            const rows = getRows();
            expect(within(rows[0]).getByText('pool1')).toBeInTheDocument();
            expect(within(rows[1]).getByText('pool2')).toBeInTheDocument();
            expect(within(rows[2]).getByText('pool3')).toBeInTheDocument();
            expect(screen.getByTestId('KeyboardArrowUpIcon')).toBeInTheDocument();
        });

        // name desc
        fireEvent.click(screen.getByText('Name'));
        await waitFor(() => {
            const rows = getRows();
            expect(within(rows[0]).getByText('pool3')).toBeInTheDocument();
            expect(within(rows[1]).getByText('pool2')).toBeInTheDocument();
            expect(within(rows[2]).getByText('pool1')).toBeInTheDocument();
            expect(screen.getByTestId('KeyboardArrowDownIcon')).toBeInTheDocument();
        });

        // type asc
        fireEvent.click(screen.getByText('Type'));
        await waitFor(() => {
            const rows = getRows();
            expect(within(rows[0]).getByText('pool3')).toBeInTheDocument(); // ext4
            expect(within(rows[1]).getByText('pool2')).toBeInTheDocument(); // lvm
            expect(within(rows[2]).getByText('pool1')).toBeInTheDocument(); // zfs
            expect(screen.getByTestId('KeyboardArrowUpIcon')).toBeInTheDocument();
        });

        // type desc
        fireEvent.click(screen.getByText('Type'));
        await waitFor(() => {
            const rows = getRows();
            expect(within(rows[0]).getByText('pool1')).toBeInTheDocument(); // zfs
            expect(screen.getByTestId('KeyboardArrowDownIcon')).toBeInTheDocument();
        });

        // volume_count asc
        fireEvent.click(screen.getByText('Volume Count'));
        await waitFor(() => {
            const rows = getRows();
            expect(within(rows[0]).getByText('pool2')).toBeInTheDocument(); // 3
            expect(within(rows[1]).getByText('pool1')).toBeInTheDocument(); // 5
            expect(within(rows[2]).getByText('pool3')).toBeInTheDocument(); // 10
            expect(screen.getByTestId('KeyboardArrowUpIcon')).toBeInTheDocument();
        });

        // volume_count desc
        fireEvent.click(screen.getByText('Volume Count'));
        await waitFor(() => {
            const rows = getRows();
            expect(within(rows[0]).getByText('pool3')).toBeInTheDocument(); // 10
            expect(screen.getByTestId('KeyboardArrowDownIcon')).toBeInTheDocument();
        });

        // usage asc
        fireEvent.click(screen.getByText('Usage'));
        await waitFor(() => {
            const rows = getRows();
            expect(within(rows[0]).getByText('pool2')).toBeInTheDocument(); // 0.0%
            expect(within(rows[1]).getByText('pool1')).toBeInTheDocument(); // 50.0%
            expect(within(rows[2]).getByText('pool3')).toBeInTheDocument(); // 75.0%
            expect(screen.getByTestId('KeyboardArrowUpIcon')).toBeInTheDocument();
        });

        // usage desc
        fireEvent.click(screen.getByText('Usage'));
        await waitFor(() => {
            const rows = getRows();
            expect(within(rows[0]).getByText('pool3')).toBeInTheDocument(); // 75.0%
            expect(screen.getByTestId('KeyboardArrowDownIcon')).toBeInTheDocument();
        });

        // head asc
        fireEvent.click(screen.getByText('Head'));
        await waitFor(() => {
            const rows = getRows();
            expect(within(rows[0]).getByText('pool1')).toBeInTheDocument(); // node1
            expect(within(rows[1]).getByText('pool2')).toBeInTheDocument(); // node2
            expect(within(rows[2]).getByText('pool3')).toBeInTheDocument(); // node3
            expect(screen.getByTestId('KeyboardArrowUpIcon')).toBeInTheDocument();
        });

        // head desc
        fireEvent.click(screen.getByText('Head'));
        await waitFor(() => {
            const rows = getRows();
            expect(within(rows[0]).getByText('pool3')).toBeInTheDocument(); // node3
            expect(screen.getByTestId('KeyboardArrowDownIcon')).toBeInTheDocument();
        });
    });

    test('handles usage calculation with zero size', async () => {
        const poolsWithZeroSize = [
            {name: 'pool5', type: 'zfs', volume_count: 2, used: 10, size: 0, head: 'node5'},
        ];
        axios.get.mockResolvedValueOnce({data: {items: poolsWithZeroSize}});

        render(<Pools/>);

        await waitFor(() => {
            expect(screen.getByText('pool5')).toBeInTheDocument();
            const naText = screen.getByText((content, element) => content.includes('N/A') && element.tagName === 'TD');
            expect(naText).toBeInTheDocument();
        });
    });

    test('renders Alert component with correct properties on API error', async () => {
        axios.get.mockRejectedValueOnce(new Error('API Error'));

        render(<Pools/>);

        await waitFor(() => {
            const alert = screen.getByRole('alert');
            expect(alert).toHaveClass('MuiAlert-standardError');
            expect(within(alert).getByText('Failed to load pools. Please try again.')).toBeInTheDocument();

            const retryButton = within(alert).getByRole('button', {name: /retry/i});
            expect(retryButton).toHaveClass('MuiButton-colorInherit');
            expect(retryButton).toHaveClass('MuiButton-sizeSmall');
        });

        // Retry fails again
        axios.get.mockRejectedValueOnce(new Error('Retry Failed'));
        const retryButton = screen.getByRole('button', {name: /retry/i});
        fireEvent.click(retryButton);

        await waitFor(() => {
            expect(screen.getByRole('progressbar')).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(screen.getByText('Failed to load pools. Please try again.')).toBeInTheDocument();
            expect(screen.getByRole('button', {name: /retry/i})).toBeInTheDocument();
        });

        expect(axios.get).toHaveBeenCalledTimes(2);
    });
});
