import React from 'react';
import {render, screen, waitFor, fireEvent, within} from '@testing-library/react';
import '@testing-library/jest-dom';
import {MemoryRouter} from 'react-router-dom';
import axios from 'axios';
import {vi, describe, test, expect, beforeEach, afterEach} from 'vitest';
import Network from '../Network';
import {URL_NETWORK} from '../../config/apiPath.js';

// Mock axios
vi.mock('axios', () => ({
    default: {
        get: vi.fn(),
    },
}));

// Mock useNavigate from react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

// Mock localStorage
const mockLocalStorage = {
    getItem: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
    value: mockLocalStorage,
});

// Sample network data for testing
const mockNetworks = [
    {name: 'lo', type: 'loopback', network: '127.0.0.0/8', size: 100, used: 50, free: 50},
    {name: 'default', type: 'bridge', network: '192.168.1.0/24', size: 200, used: 100, free: 100},
    {name: 'test', type: 'overlay', network: '10.0.0.0/24', size: 100, used: 90, free: 10},
    {name: 'mid', type: 'bridge', network: '172.16.0.0/16', size: 100, used: 60, free: 40},
];

describe('Network Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLocalStorage.getItem.mockReturnValue('mock-token');
    });

    test('renders table headers correctly', () => {
        render(<Network/>, {wrapper: MemoryRouter});
        const headers = ['Name', 'Type', 'Network', 'Usage'];
        headers.forEach((header) => {
            expect(screen.getByText(header)).toBeInTheDocument();
        });
    });

    test('displays network data correctly when API call succeeds', async () => {
        axios.get.mockResolvedValueOnce({data: {items: mockNetworks}});

        render(<Network/>, {wrapper: MemoryRouter});

        await waitFor(() => {
            expect(screen.getByText('lo')).toBeInTheDocument();
        });

        // Check lo data (sorted first)
        const loRow = screen.getByRole('row', {name: /lo/i});
        expect(loRow).toHaveTextContent('lo');
        await waitFor(() => {
            expect(loRow).toHaveTextContent('loopback');
        });
        await waitFor(() => {
            expect(loRow).toHaveTextContent('127.0.0.0/8');
        });
        await waitFor(() => {
            expect(loRow).toHaveTextContent('50.0%');
        });
        await waitFor(() => {
            expect(within(loRow).getByRole('progressbar')).toBeInTheDocument();
        });

        const defaultRow = screen.getByRole('row', {name: /default/i});
        expect(defaultRow).toHaveTextContent('default');
        await waitFor(() => {
            expect(defaultRow).toHaveTextContent('bridge');
        });
        await waitFor(() => {
            expect(defaultRow).toHaveTextContent('192.168.1.0/24');
        });
        await waitFor(() => {
            expect(defaultRow).toHaveTextContent('50.0%');
        });
        await waitFor(() => {
            expect(within(defaultRow).getByRole('progressbar')).toBeInTheDocument();
        });

        expect(axios.get).toHaveBeenCalledWith(URL_NETWORK, {
            headers: {Authorization: 'Bearer mock-token'},
        });
    });

    test('displays tooltip with used/size on percentage or progress bar hover', async () => {
        axios.get.mockResolvedValueOnce({data: {items: mockNetworks}});

        render(<Network/>, {wrapper: MemoryRouter});

        await waitFor(() => {
            expect(screen.getByText('lo')).toBeInTheDocument();
        });

        // First row (lo)
        const loRow = screen.getByRole('row', {name: /lo/i});
        const loPercentage = within(loRow).getByText('50.0%');

        // Hover over percentage
        fireEvent.mouseOver(loPercentage);
        expect(await screen.findByText('50/100')).toBeInTheDocument();

        // Hover over progress bar
        const loProgressBar = within(loRow).getByRole('progressbar');
        fireEvent.mouseOver(loProgressBar);
        expect(await screen.findByText('50/100')).toBeInTheDocument();

        // Second row (default)
        const defaultRow = screen.getByRole('row', {name: /default/i});
        const defaultPercentage = within(defaultRow).getByText('50.0%');
        fireEvent.mouseOver(defaultPercentage);
        expect(await screen.findByText('100/200')).toBeInTheDocument();

        const defaultProgressBar = within(defaultRow).getByRole('progressbar');
        fireEvent.mouseOver(defaultProgressBar);
        expect(await screen.findByText('100/200')).toBeInTheDocument();
    });

    test('handles API error gracefully', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        });
        axios.get.mockRejectedValueOnce(new Error('API Error'));

        render(<Network/>, {wrapper: MemoryRouter});

        await waitFor(() => {
            expect(consoleErrorSpy).toHaveBeenCalledWith('Error retrieving networks', expect.any(Error));
        });

        await waitFor(() => {
            expect(screen.getByText('No networks available.')).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(screen.queryByText('lo')).not.toBeInTheDocument();
        });

        await waitFor(() => {
            expect(screen.queryByText('default')).not.toBeInTheDocument();
        });

        consoleErrorSpy.mockRestore();
    });

    test('displays N/A for usage when size is zero', async () => {
        const networksWithZeroSize = [
            {name: 'test', type: 'bridge', network: '10.0.0.0/24', size: 0, used: 10, free: 0},
        ];
        axios.get.mockResolvedValueOnce({data: {items: networksWithZeroSize}});

        render(<Network/>, {wrapper: MemoryRouter});

        await waitFor(() => {
            expect(screen.getByText('test')).toBeInTheDocument();
        });

        const testRow = screen.getByRole('row', {name: /test/i});
        const usageCell = within(testRow).getByText('N/A');
        await waitFor(() => {
            expect(usageCell).toHaveTextContent('N/A');
        });
        await waitFor(() => {
            expect(within(testRow).queryByRole('progressbar')).not.toBeInTheDocument();
        });
    });

    test('calls API with correct authorization token', async () => {
        axios.get.mockResolvedValueOnce({data: {items: []}});

        render(<Network/>, {wrapper: MemoryRouter});

        await waitFor(() => {
            expect(axios.get).toHaveBeenCalledWith(URL_NETWORK, {
                headers: {Authorization: 'Bearer mock-token'},
            });
        });
    });

    test('sorts networks alphabetically by name in ascending order by default', async () => {
        const unsortedNetworks = [
            {name: 'zebra', type: 'bridge', network: '10.0.0.0/24', size: 100, used: 50, free: 50},
            {name: 'apple', type: 'loopback', network: '127.0.0.0/8', size: 100, used: 50, free: 50},
        ];
        axios.get.mockResolvedValueOnce({data: {items: unsortedNetworks}});

        render(<Network/>, {wrapper: MemoryRouter});

        await waitFor(() => {
            expect(screen.getByText('apple')).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(screen.getByText('zebra')).toBeInTheDocument();
        });

        const rows = screen.getAllByRole('row');
        const appleRow = rows.find(row => row.textContent.includes('apple'));
        const zebraRow = rows.find(row => row.textContent.includes('zebra'));

        expect(appleRow).toBeInTheDocument();
        expect(zebraRow).toBeInTheDocument();
        expect(rows.indexOf(appleRow)).toBeLessThan(rows.indexOf(zebraRow));
    });

    test('sorts networks alphabetically by name in descending order', async () => {
        const unsortedNetworks = [
            {name: 'zebra', type: 'bridge', network: '10.0.0.0/24', size: 100, used: 50, free: 50},
            {name: 'apple', type: 'loopback', network: '127.0.0.0/8', size: 100, used: 50, free: 50},
        ];
        axios.get.mockResolvedValueOnce({data: {items: unsortedNetworks}});

        render(<Network/>, {wrapper: MemoryRouter});

        await waitFor(() => {
            expect(screen.getByText('apple')).toBeInTheDocument();
        });

        const nameHeader = screen.getByText('Name');
        fireEvent.click(nameHeader);

        await waitFor(() => {
            const rows = screen.getAllByRole('row');
            const appleRow = rows.find(row => row.textContent.includes('apple'));
            const zebraRow = rows.find(row => row.textContent.includes('zebra'));
            expect(rows.indexOf(zebraRow)).toBeLessThan(rows.indexOf(appleRow));
        });
    });

    test('sorts networks by type in ascending order', async () => {
        const unsortedNetworks = [
            {name: 'zebra', type: 'loopback', network: '10.0.0.0/24', size: 100, used: 50, free: 50},
            {name: 'apple', type: 'bridge', network: '127.0.0.0/8', size: 100, used: 50, free: 50},
        ];
        axios.get.mockResolvedValueOnce({data: {items: unsortedNetworks}});

        render(<Network/>, {wrapper: MemoryRouter});

        await waitFor(() => {
            expect(screen.getByText('apple')).toBeInTheDocument();
        });

        const typeHeader = screen.getByText('Type');
        fireEvent.click(typeHeader);

        await waitFor(() => {
            expect(screen.getByText('bridge')).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(screen.getByText('loopback')).toBeInTheDocument();
        });

        const rows = screen.getAllByRole('row');
        const appleRow = rows.find(row => row.textContent.includes('bridge')); // apple has type 'bridge'
        const zebraRow = rows.find(row => row.textContent.includes('loopback')); // zebra has type 'loopback'

        expect(appleRow).toBeInTheDocument();
        expect(zebraRow).toBeInTheDocument();
        expect(rows.indexOf(appleRow)).toBeLessThan(rows.indexOf(zebraRow)); // bridge < loopback
    });

    test('sorts networks by type in descending order', async () => {
        const unsortedNetworks = [
            {name: 'zebra', type: 'loopback', network: '10.0.0.0/24', size: 100, used: 50, free: 50},
            {name: 'apple', type: 'bridge', network: '127.0.0.0/8', size: 100, used: 50, free: 50},
        ];
        axios.get.mockResolvedValueOnce({data: {items: unsortedNetworks}});

        render(<Network/>, {wrapper: MemoryRouter});

        await waitFor(() => {
            expect(screen.getByText('apple')).toBeInTheDocument();
        });

        const typeHeader = screen.getByText('Type');
        fireEvent.click(typeHeader); // to asc
        fireEvent.click(typeHeader); // to desc

        await waitFor(() => {
            const rows = screen.getAllByRole('row');
            const appleRow = rows.find(row => row.textContent.includes('bridge'));
            const zebraRow = rows.find(row => row.textContent.includes('loopback'));
            expect(rows.indexOf(zebraRow)).toBeLessThan(rows.indexOf(appleRow)); // loopback > bridge
        });
    });

    test('sorts networks by network in ascending order', async () => {
        const unsortedNetworks = [
            {name: 'zebra', type: 'bridge', network: '192.168.1.0/24', size: 100, used: 50, free: 50},
            {name: 'apple', type: 'loopback', network: '127.0.0.0/8', size: 100, used: 50, free: 50},
        ];
        axios.get.mockResolvedValueOnce({data: {items: unsortedNetworks}});

        render(<Network/>, {wrapper: MemoryRouter});

        await waitFor(() => {
            expect(screen.getByText('apple')).toBeInTheDocument();
        });

        const networkHeader = screen.getByText('Network');
        fireEvent.click(networkHeader);

        await waitFor(() => {
            expect(screen.getByText('127.0.0.0/8')).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(screen.getByText('192.168.1.0/24')).toBeInTheDocument();
        });

        const rows = screen.getAllByRole('row');
        const appleRow = rows.find(row => row.textContent.includes('127.0.0.0/8'));
        const zebraRow = rows.find(row => row.textContent.includes('192.168.1.0/24'));

        expect(appleRow).toBeInTheDocument();
        expect(zebraRow).toBeInTheDocument();
        expect(rows.indexOf(appleRow)).toBeLessThan(rows.indexOf(zebraRow)); // 127.0.0.0/8 < 192.168.1.0/24
    });

    test('sorts networks by network in descending order', async () => {
        const unsortedNetworks = [
            {name: 'zebra', type: 'bridge', network: '192.168.1.0/24', size: 100, used: 50, free: 50},
            {name: 'apple', type: 'loopback', network: '127.0.0.0/8', size: 100, used: 50, free: 50},
        ];
        axios.get.mockResolvedValueOnce({data: {items: unsortedNetworks}});

        render(<Network/>, {wrapper: MemoryRouter});

        await waitFor(() => {
            expect(screen.getByText('apple')).toBeInTheDocument();
        });

        const networkHeader = screen.getByText('Network');
        fireEvent.click(networkHeader); // to asc
        fireEvent.click(networkHeader); // to desc

        await waitFor(() => {
            const rows = screen.getAllByRole('row');
            const appleRow = rows.find(row => row.textContent.includes('127.0.0.0/8'));
            const zebraRow = rows.find(row => row.textContent.includes('192.168.1.0/24'));
            expect(rows.indexOf(zebraRow)).toBeLessThan(rows.indexOf(appleRow)); // 192 > 127
        });
    });

    test('sorts networks by usage in ascending order', async () => {
        const unsortedNetworks = [
            {name: 'zebra', type: 'bridge', network: '10.0.0.0/24', size: 100, used: 90, free: 10}, // 90%
            {name: 'apple', type: 'loopback', network: '127.0.0.0/8', size: 100, used: 50, free: 50}, // 50%
        ];
        axios.get.mockResolvedValueOnce({data: {items: unsortedNetworks}});

        render(<Network/>, {wrapper: MemoryRouter});

        await waitFor(() => {
            expect(screen.getByText('apple')).toBeInTheDocument();
        });

        const usageHeader = screen.getByText('Usage');
        fireEvent.click(usageHeader);

        await waitFor(() => {
            expect(screen.getByText('50.0%')).toBeInTheDocument();
        });

        await waitFor(() => {
            expect(screen.getByText('90.0%')).toBeInTheDocument();
        });

        const rows = screen.getAllByRole('row');
        const appleRow = rows.find(row => row.textContent.includes('50.0%'));
        const zebraRow = rows.find(row => row.textContent.includes('90.0%'));

        expect(appleRow).toBeInTheDocument();
        expect(zebraRow).toBeInTheDocument();
        expect(rows.indexOf(appleRow)).toBeLessThan(rows.indexOf(zebraRow)); // 50% < 90%
    });

    test('sorts networks by usage in descending order', async () => {
        const unsortedNetworks = [
            {name: 'zebra', type: 'bridge', network: '10.0.0.0/24', size: 100, used: 90, free: 10}, // 90%
            {name: 'apple', type: 'loopback', network: '127.0.0.0/8', size: 100, used: 50, free: 50}, // 50%
        ];
        axios.get.mockResolvedValueOnce({data: {items: unsortedNetworks}});

        render(<Network/>, {wrapper: MemoryRouter});

        await waitFor(() => {
            expect(screen.getByText('apple')).toBeInTheDocument();
        });

        const usageHeader = screen.getByText('Usage');
        fireEvent.click(usageHeader); // to asc
        fireEvent.click(usageHeader); // to desc

        await waitFor(() => {
            const rows = screen.getAllByRole('row');
            const appleRow = rows.find(row => row.textContent.includes('50.0%'));
            const zebraRow = rows.find(row => row.textContent.includes('90.0%'));
            expect(rows.indexOf(zebraRow)).toBeLessThan(rows.indexOf(appleRow)); // 90% > 50%
        });
    });

    test('sets progress bar color to success when usage <= 50%', async () => {
        axios.get.mockResolvedValueOnce({data: {items: mockNetworks}});

        render(<Network/>, {wrapper: MemoryRouter});

        await waitFor(() => {
            expect(screen.getByText('lo')).toBeInTheDocument();
        });

        const loRow = screen.getByRole('row', {name: /lo/i});
        const progressBar = within(loRow).getByRole('progressbar');
        expect(progressBar).toHaveStyle({backgroundColor: expect.stringContaining('success')});
    });

    test('sets progress bar color to warning when usage > 50% and <= 80%', async () => {
        axios.get.mockResolvedValueOnce({data: {items: mockNetworks}});

        render(<Network/>, {wrapper: MemoryRouter});

        await waitFor(() => {
            expect(screen.getByText('mid')).toBeInTheDocument();
        });

        const midRow = screen.getByRole('row', {name: /mid/i});
        const progressBar = within(midRow).getByRole('progressbar');
        expect(progressBar).toHaveStyle({backgroundColor: expect.stringContaining('warning')});
    });

    test('sets progress bar color to error when usage > 80%', async () => {
        axios.get.mockResolvedValueOnce({data: {items: mockNetworks}});

        render(<Network/>, {wrapper: MemoryRouter});

        await waitFor(() => {
            expect(screen.getByText('test')).toBeInTheDocument();
        });

        const testRow = screen.getByRole('row', {name: /test/i});
        const progressBar = within(testRow).getByRole('progressbar');
        expect(progressBar).toHaveStyle({backgroundColor: expect.stringContaining('error')});
    });

    test('handles usage > 100% by capping progress bar at 100%', async () => {
        const networksWithOverUsage = [
            {name: 'over', type: 'bridge', network: '10.0.0.0/24', size: 100, used: 120, free: -20},
        ];
        axios.get.mockResolvedValueOnce({data: {items: networksWithOverUsage}});

        render(<Network/>, {wrapper: MemoryRouter});

        await waitFor(() => {
            expect(screen.getByText('over')).toBeInTheDocument();
        });

        const overRow = screen.getByRole('row', {name: /over/i});
        expect(overRow).toHaveTextContent('120.0%');
        const progressBar = within(overRow).getByRole('progressbar');
        expect(progressBar).toHaveAttribute('aria-valuenow', '100');
        expect(progressBar).toHaveStyle({backgroundColor: expect.stringContaining('error')});

        const percentage = within(overRow).getByText('120.0%');
        fireEvent.mouseOver(percentage);
        expect(await screen.findByText('120/100')).toBeInTheDocument();
    });

    test('navigates to network details on row click', async () => {
        axios.get.mockResolvedValueOnce({data: {items: mockNetworks}});

        render(<Network/>, {wrapper: MemoryRouter});

        await waitFor(() => {
            expect(screen.getByText('lo')).toBeInTheDocument();
        });

        const loRow = screen.getByRole('row', {name: /lo/i});
        fireEvent.click(loRow);

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/network/lo');
        });

        const defaultRow = screen.getByRole('row', {name: /default/i});
        fireEvent.click(defaultRow);

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/network/default');
        });
    });
});
