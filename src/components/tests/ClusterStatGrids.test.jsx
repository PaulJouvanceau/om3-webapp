import React from 'react';
import {render, screen, fireEvent, waitFor, within, act} from '@testing-library/react';
import '@testing-library/jest-dom';
import {
    GridNodes,
    GridObjects,
    GridNamespaces,
    GridHeartbeats,
    GridPools,
    GridNetworks,
    GridKinds,
} from '../ClusterStatGrids.jsx';

jest.mock('../../eventSourceManager', () => ({
    prepareForNavigation: jest.fn(),
}));

jest.useFakeTimers();

describe('ClusterStatGrids', () => {
    const mockOnClick = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        jest.clearAllTimers();
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    const advanceAndFlush = async () => {
        act(() => {
            jest.advanceTimersByTime(50);
        });
        await act(async () => {
        });
    };

    // ---------- GridNodes ----------
    test('GridNodes renders, handles click and shows loading spinner', async () => {
        render(<GridNodes nodeCount={5} frozenCount={2} onClick={mockOnClick}/>);
        expect(screen.getByText('Nodes')).toBeInTheDocument();
        expect(screen.getByRole('heading', {name: '5'})).toBeInTheDocument();
        expect(screen.getByText('Frozen 2')).toBeInTheDocument();

        // Card click
        fireEvent.click(screen.getByText('Nodes'));
        expect(screen.getAllByRole('progressbar')).toHaveLength(1);
        await advanceAndFlush();
        expect(mockOnClick).toHaveBeenCalled();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

        // Chip click
        fireEvent.click(screen.getByText('Frozen 2'));
        expect(screen.getAllByRole('progressbar')).toHaveLength(1);
        await advanceAndFlush();
        expect(mockOnClick).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    test('GridNodes handles zero values', () => {
        render(<GridNodes nodeCount={0} frozenCount={0} onClick={mockOnClick}/>);
        expect(screen.getByText('Nodes')).toBeInTheDocument();
        expect(screen.getByRole('heading', {name: '0'})).toBeInTheDocument();
        expect(screen.getByText('Frozen 0')).toBeInTheDocument();
    });

    // ---------- GridObjects ----------
    const statusAll = {up: 5, warn: 2, down: 1, unprovisioned: 3};

    test('GridObjects renders, handles chip clicks with correct status and loading spinner', async () => {
        render(<GridObjects objectCount={11} statusCount={statusAll} onClick={mockOnClick}/>);
        expect(screen.getByText('Objects')).toBeInTheDocument();
        expect(screen.getByRole('heading', {name: '11'})).toBeInTheDocument();
        for (const stat of ['Up 5', 'Warn 2', 'Down 1', 'Unprovisioned 3']) {
            expect(screen.getByText(stat)).toBeInTheDocument();
        }

        // Test 'up' chip with loading spinner check
        fireEvent.click(screen.getByText('Up 5'));
        expect(screen.getAllByRole('progressbar')).toHaveLength(1);
        await advanceAndFlush();
        expect(mockOnClick).toHaveBeenCalledWith('up');
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

        // Other chips (spinner not re‑checked, just argument)
        fireEvent.click(screen.getByText('Warn 2'));
        jest.runAllTimers();
        expect(mockOnClick).toHaveBeenCalledWith('warn');

        fireEvent.click(screen.getByText('Down 1'));
        jest.runAllTimers();
        expect(mockOnClick).toHaveBeenCalledWith('down');

        fireEvent.click(screen.getByText('Unprovisioned 3'));
        jest.runAllTimers();
        expect(mockOnClick).toHaveBeenCalledWith('unprovisioned');
    });

    test('GridObjects handles card click with loading spinner', async () => {
        render(<GridObjects objectCount={8} statusCount={{up: 5, warn: 2, down: 1, unprovisioned: 0}}
                            onClick={mockOnClick}/>);
        fireEvent.click(screen.getByText('Objects'));
        expect(screen.getAllByRole('progressbar')).toHaveLength(1);
        await advanceAndFlush();
        expect(mockOnClick).toHaveBeenCalledWith();
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    test('GridObjects hides zero-value status chips', () => {
        const zeroStatus = {up: 0, warn: 0, down: 0, unprovisioned: 0};
        render(<GridObjects objectCount={0} statusCount={zeroStatus} onClick={mockOnClick}/>);
        expect(screen.getByText('Objects')).toBeInTheDocument();
        expect(screen.getByRole('heading', {name: '0'})).toBeInTheDocument();
        for (const text of [/Up \d+/, /Warn \d+/, /Down \d+/, /Unprovisioned \d+/]) {
            expect(screen.queryByText(text)).not.toBeInTheDocument();
        }
    });

    // ---------- GridNamespaces ----------
    const nsSubtitle = [
        {
            namespace: 'ns1',
            status: {up: 5, warn: 3, down: 2, 'n/a': 1, unprovisioned: 0},
        },
        {
            namespace: 'ns2',
            status: {up: 3, warn: 1, down: 1, 'n/a': 0, unprovisioned: 2},
        },
    ];

    test('GridNamespaces renders, shows status indicators with aria-labels, handles chip clicks', async () => {
        render(<GridNamespaces namespaceCount={2} namespaceSubtitle={nsSubtitle} onClick={mockOnClick}/>);
        expect(screen.getByText('Namespaces')).toBeInTheDocument();
        expect(screen.getByRole('heading', {name: '2'})).toBeInTheDocument();
        expect(screen.getByText('ns1')).toBeInTheDocument();
        expect(screen.getByText('ns2')).toBeInTheDocument();

        // Aria labels
        expect(screen.getByLabelText('up status for namespace ns1: 5 objects')).toBeInTheDocument();
        expect(screen.getByLabelText('warn status for namespace ns1: 3 objects')).toBeInTheDocument();
        expect(screen.getByLabelText('down status for namespace ns1: 2 objects')).toBeInTheDocument();
        expect(screen.queryByLabelText(/unprovisioned status for namespace ns1/)).not.toBeInTheDocument();
        expect(screen.getByLabelText('unprovisioned status for namespace ns2: 2 objects')).toBeInTheDocument();

        // Click namespace chip with spinner
        fireEvent.click(screen.getByText('ns1'));
        const ns1Box = screen.getByText('ns1').closest('.MuiBox-root');
        expect(within(ns1Box).getAllByRole('progressbar')).toHaveLength(1);
        await advanceAndFlush();
        expect(mockOnClick).toHaveBeenCalledWith('/objects?namespace=ns1');
        expect(within(ns1Box).queryByRole('progressbar')).not.toBeInTheDocument();

        // Click status indicator with spinner
        const upIndicator = screen.getByLabelText('up status for namespace ns1: 5 objects');
        fireEvent.click(upIndicator);
        expect(within(ns1Box).getAllByRole('progressbar')).toHaveLength(1);
        await advanceAndFlush();
        expect(mockOnClick).toHaveBeenCalledWith('/objects?namespace=ns1&globalState=up');
        expect(within(ns1Box).queryByRole('progressbar')).not.toBeInTheDocument();

        // Card click with spinner
        fireEvent.click(screen.getByText('Namespaces'));
        expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
        await advanceAndFlush();
        expect(mockOnClick).toHaveBeenCalledWith('/namespaces');
    });

    test('GridNamespaces prevents duplicate clicks while loading', async () => {
        const singleNs = [{namespace: 'ns1', status: {up: 5, warn: 0, down: 0, 'n/a': 0, unprovisioned: 0}}];
        render(<GridNamespaces namespaceCount={1} namespaceSubtitle={singleNs} onClick={mockOnClick}/>);
        const chip = screen.getByText('ns1');
        fireEvent.click(chip);
        fireEvent.click(chip); // second click while loading
        await advanceAndFlush();
        expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    // ---------- GridHeartbeats ----------
    const hbStats = {
        '1.rx': {running: 2, beating: 2},
        '1.tx': {running: 3, beating: 3},
        '2.rx': {running: 1, beating: 1},
        '2.tx': {running: 4, beating: 2},
        '3.rx': {running: 0, beating: 0},
        '3.tx': {running: 0, beating: 0},
        '4.rx': {running: 5, beating: 5},
        '4.tx': {running: 5, beating: 5},
    };

    test('GridHeartbeats renders grouped chips, correct colors, and handles clicks', async () => {
        render(<GridHeartbeats heartbeatCount={3} perHeartbeatStats={hbStats} onClick={mockOnClick}/>);
        expect(screen.getByText('Heartbeats')).toBeInTheDocument();
        expect(screen.getByRole('heading', {name: '3'})).toBeInTheDocument();

        const chip1 = screen.getByRole('button', {name: '1'});
        const chip2 = screen.getByRole('button', {name: '2'});
        const chip4 = screen.getByRole('button', {name: '4'});
        expect(screen.queryByRole('button', {name: '3'})).not.toBeInTheDocument();

        expect(chip1).toHaveStyle('background-color: green');
        expect(chip2).toHaveStyle('background-color: red');
        expect(chip4).toHaveStyle('background-color: green');

        // Chip click with spinner
        fireEvent.click(chip1);
        expect(screen.getAllByRole('progressbar')).toHaveLength(1);
        await advanceAndFlush();
        expect(mockOnClick).toHaveBeenCalledWith(null, null, '1');
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

        // Card click with spinner
        fireEvent.click(screen.getByText('Heartbeats'));
        expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
        await advanceAndFlush();
        expect(mockOnClick).toHaveBeenCalledWith();
    });

    test('GridHeartbeats handles empty stats and single‑node partial health', () => {
        render(<GridHeartbeats heartbeatCount={0} perHeartbeatStats={{}} onClick={mockOnClick}/>);
        expect(screen.getByRole('heading', {name: '0'})).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();

        const partial = {'1.rx': {running: 2, beating: 2}, '1.tx': {running: 2, beating: 1}};
        const {rerender} = render(<GridHeartbeats heartbeatCount={1} perHeartbeatStats={partial}
                                                  onClick={mockOnClick}/>);
        const chip = screen.getByRole('button', {name: '1'});
        expect(chip).toHaveStyle('background-color: red');
    });

    // ---------- GridPools ----------
    const pools = [
        {name: 'pool1', size: 100, used: 95},
        {name: 'pool2', size: 200, used: 100},
        {name: 'pool3', size: 0, used: 0},
        {name: 'pool4', used: 10},
        {name: 'pool5', size: 100},
        {name: 'pool6'},
    ];

    test('GridPools renders usage percentages, low storage warning and handles click', async () => {
        render(<GridPools poolCount={6} pools={pools} onClick={mockOnClick}/>);
        expect(screen.getByText('Pools')).toBeInTheDocument();
        expect(screen.getByRole('heading', {name: '6'})).toBeInTheDocument();

        expect(screen.getByText('pool1 (95.0% used)')).toBeInTheDocument();
        expect(screen.getByText('pool2 (50.0% used)')).toBeInTheDocument();
        expect(screen.getByText('pool3 (N/A% used)')).toBeInTheDocument();
        expect(screen.getByText('pool4 (N/A% used)')).toBeInTheDocument();
        expect(screen.getByText('pool5 (N/A% used)')).toBeInTheDocument();
        expect(screen.getByText('pool6 (N/A% used)')).toBeInTheDocument();

        const lowChip = screen.getByText('pool1 (95.0% used)').closest('.MuiChip-root');
        expect(lowChip).toHaveStyle('background-color: red');
        const normalChip = screen.getByText('pool2 (50.0% used)').closest('.MuiChip-root');
        expect(normalChip).not.toHaveStyle('background-color: red');

        fireEvent.click(screen.getByText('Pools'));
        jest.runAllTimers();
        expect(mockOnClick).toHaveBeenCalled();
    });

    // ---------- GridNetworks ----------
    const networks = [
        {name: 'network1', size: 100, used: 50, free: 50},
        {name: 'network2', size: 200, used: 182, free: 18},
        {name: 'network3', size: 0, used: 0, free: 0},
        {name: 'network4', used: 10, free: 90}, // no size
    ];

    test('GridNetworks renders, highlights low free space and handles card click', async () => {
        render(<GridNetworks networks={networks} onClick={mockOnClick}/>);
        expect(screen.getByText('Networks')).toBeInTheDocument();
        expect(screen.getByRole('heading', {name: '4'})).toBeInTheDocument();

        expect(screen.getByText('network1 (50.0% used)')).toBeInTheDocument();
        expect(screen.getByText('network2 (91.0% used)')).toBeInTheDocument();
        expect(screen.getByText('network3 (0% used)')).toBeInTheDocument();
        expect(screen.getByText('network4 (0% used)')).toBeInTheDocument();

        const lowChip = screen.getByText('network2 (91.0% used)').closest('.MuiChip-root');
        expect(lowChip).toHaveStyle('background-color: red');

        fireEvent.click(screen.getByText('Networks'));
        jest.runAllTimers();
        expect(mockOnClick).toHaveBeenCalled();
    });

    test('GridNetworks handles empty array', () => {
        render(<GridNetworks networks={[]} onClick={mockOnClick}/>);
        expect(screen.getByRole('heading', {name: '0'})).toBeInTheDocument();
    });

    // ---------- GridKinds ----------
    const kindSubtitle = [
        {kind: 'Pod', status: {up: 5, warn: 2, down: 1, unprovisioned: 0}},
        {kind: 'Service', status: {up: 3, warn: 0, down: 0, unprovisioned: 0}},
        {kind: 'Node', status: {up: 1, warn: 1, down: 1, unprovisioned: 1}},
    ];

    test('GridKinds renders chips, status indicators with aria-labels and handles clicks', async () => {
        render(<GridKinds kindCount={3} kindSubtitle={kindSubtitle} onClick={mockOnClick}/>);
        expect(screen.getByText('Kinds')).toBeInTheDocument();
        expect(screen.getAllByText('3')).toHaveLength(2); // card value + chip "3"?
        for (const kind of ['Pod', 'Service', 'Node']) {
            expect(screen.getByText(kind)).toBeInTheDocument();
        }

        // Aria‑labels
        expect(screen.getByLabelText('up status for kind Pod: 5 objects')).toBeInTheDocument();
        expect(screen.getByLabelText('warn status for kind Pod: 2 objects')).toBeInTheDocument();
        expect(screen.queryByLabelText('unprovisioned status for kind Pod: 0 objects')).not.toBeInTheDocument();
        expect(screen.getByLabelText('unprovisioned status for kind Node: 1 objects')).toBeInTheDocument();

        // Click kind chip (Pod) with spinner
        fireEvent.click(screen.getByText('Pod'));
        const podBox = screen.getByText('Pod').closest('.MuiBox-root');
        expect(within(podBox).getAllByRole('progressbar')).toHaveLength(1);
        await advanceAndFlush();
        expect(mockOnClick).toHaveBeenCalledWith('/objects?kind=Pod');
        expect(within(podBox).queryByRole('progressbar')).not.toBeInTheDocument();

        // Click status indicator with spinner
        const upIndicator = screen.getByLabelText('up status for kind Pod: 5 objects');
        fireEvent.click(upIndicator);
        expect(within(podBox).getAllByRole('progressbar')).toHaveLength(1);
        await advanceAndFlush();
        expect(mockOnClick).toHaveBeenCalledWith('/objects?kind=Pod&globalState=up');
        expect(within(podBox).queryByRole('progressbar')).not.toBeInTheDocument();

        // Card click with spinner
        fireEvent.click(screen.getByText('Kinds'));
        expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);
        await advanceAndFlush();
        expect(mockOnClick).toHaveBeenCalledWith('/kinds');
    });

    test('GridKinds prevents duplicate clicks on same chip and allows different ones', async () => {
        render(<GridKinds kindCount={3} kindSubtitle={kindSubtitle} onClick={mockOnClick}/>);
        const podChip = screen.getByText('Pod');
        const serviceChip = screen.getByText('Service');

        // Two clicks on same chip while loading → only one fires
        fireEvent.click(podChip);
        fireEvent.click(podChip);
        await advanceAndFlush();
        expect(mockOnClick).toHaveBeenCalledTimes(1);
        expect(mockOnClick).toHaveBeenCalledWith('/objects?kind=Pod');

        // Click another kind (allowed)
        fireEvent.click(serviceChip);
        await advanceAndFlush();
        expect(mockOnClick).toHaveBeenCalledTimes(2);
        expect(mockOnClick).toHaveBeenCalledWith('/objects?kind=Service');
    });
});
