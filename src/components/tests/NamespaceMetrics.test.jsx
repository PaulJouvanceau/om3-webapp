import React from 'react';
import {render, screen, within, act} from '@testing-library/react';
import {vi} from 'vitest';
import NamespaceMetrics, {REFRESH_INTERVAL_MS} from '../NamespaceMetrics';
import i18n from '../../i18n';

vi.mock('../../utils/logger.js', () => ({
    default: {error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn()},
}));

const metricsText = (cpuUsec, dbCpuUsec = 0) => `
opensvc_pg_cgroup_cpu_usage_usec{namespace="prod",path="prod/svc/web"} ${cpuUsec}
opensvc_pg_cgroup_memory_current_bytes{namespace="prod",path="prod/svc/web"} 1048576
opensvc_pg_cgroup_memory_max_bytes{namespace="prod",path="prod/svc/web"} +Inf
opensvc_pg_cgroup_cpu_usage_usec{namespace="prod",path="prod/svc/db"} ${dbCpuUsec}
opensvc_pg_cgroup_memory_current_bytes{namespace="prod",path="prod/svc/db"} 2097152
opensvc_pg_cgroup_cpu_usage_usec{namespace="dev",path="dev/svc/web"} 1
`;

const respond = (text, ok = true, status = 200) =>
    Promise.resolve({ok, status, text: () => Promise.resolve(text)});

const rowOf = (path) => screen.getByRole('cell', {name: path}).closest('tr');

describe('NamespaceMetrics', () => {
    beforeEach(() => {
        vi.useFakeTimers({shouldAdvanceTime: true});
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('shows the usage of the objects of the namespace only', async () => {
        global.fetch.mockReturnValue(respond(metricsText(0)));
        render(<NamespaceMetrics namespace="prod"/>);

        const row = await screen.findByRole('row', {name: /prod\/svc\/web/});
        const cells = within(row).getAllByRole('cell');
        expect(cells[1]).toHaveTextContent('-');
        expect(cells[2]).toHaveTextContent('1.0 MiB');
        expect(cells[3]).toHaveTextContent('unlimited');
        expect(screen.queryByText('dev/svc/web')).not.toBeInTheDocument();
        expect(global.fetch).toHaveBeenCalledWith('/metrics/pg', expect.any(Object));
    });

    test('shows the CPU rate from the second reading', async () => {
        global.fetch.mockReturnValueOnce(respond(metricsText(0)));
        render(<NamespaceMetrics namespace="prod"/>);
        await screen.findByRole('row', {name: /prod\/svc\/web/});

        // half a CPU over the refresh interval
        global.fetch.mockReturnValueOnce(respond(metricsText(REFRESH_INTERVAL_MS * 500)));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
        });

        const cpu = within(rowOf('prod/svc/web')).getAllByRole('cell')[1];
        // the clock also moves while the first reading is awaited
        expect(cpu.textContent).toMatch(/^\d+\.\d %$/);
        expect(Math.abs(parseFloat(cpu.textContent) - 50)).toBeLessThan(2);
    });

    test('totals the CPU and memory of the namespace', async () => {
        global.fetch.mockReturnValueOnce(respond(metricsText(0)));
        render(<NamespaceMetrics namespace="prod"/>);
        await screen.findByRole('row', {name: /prod\/svc\/web/});
        // The total comes first, over the table.
        const totals = screen.getByRole('region', {name: 'Namespace total'});
        expect(totals.compareDocumentPosition(screen.getByRole('table')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        const total = (label) => within(totals).getByText(label).nextElementSibling;
        // no rate on the first reading
        expect(total('Namespace cpu')).toHaveTextContent('-');
        expect(total('Namespace memory')).toHaveTextContent('3.0 MiB');

        // half a CPU for web, a quarter for db, over the refresh interval
        global.fetch.mockReturnValueOnce(respond(metricsText(REFRESH_INTERVAL_MS * 500, REFRESH_INTERVAL_MS * 250)));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
        });

        // the clock also moves while the first reading is awaited
        expect(Math.abs(parseFloat(total('Namespace cpu').textContent) - 75)).toBeLessThan(3);
    });

    test('shows no total for a namespace without cgroup', async () => {
        global.fetch.mockReturnValue(respond(metricsText(0)));
        render(<NamespaceMetrics namespace="empty"/>);
        await screen.findByText('No cgroup metrics for the objects of empty');
        expect(screen.queryByRole('region', {name: 'Namespace total'})).not.toBeInTheDocument();
    });

    test('says when the namespace has no cgroup', async () => {
        global.fetch.mockReturnValue(respond(metricsText(0)));
        render(<NamespaceMetrics namespace="empty"/>);
        expect(await screen.findByText('No cgroup metrics for the objects of empty')).toBeInTheDocument();
    });

    test('reports a failed read', async () => {
        global.fetch.mockReturnValue(respond('', false, 503));
        render(<NamespaceMetrics namespace="prod"/>);
        expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch metrics: HTTP 503');
    });

    test('speaks French to a French browser', async () => {
        global.fetch.mockReturnValue(respond('', false, 503));
        await i18n.changeLanguage('fr');
        try {
            render(<NamespaceMetrics namespace="prod"/>);
            expect(await screen.findByRole('alert')).toHaveTextContent('Échec de la récupération des métriques : HTTP 503');
            expect(screen.getByRole('columnheader', {name: 'Mémoire'})).toBeInTheDocument();
        } finally {
            await i18n.changeLanguage('en');
        }
    });

    test('stops reading once unmounted', async () => {
        global.fetch.mockReturnValue(respond(metricsText(0)));
        const {unmount} = render(<NamespaceMetrics namespace="prod"/>);
        await screen.findByRole('row', {name: /prod\/svc\/web/});
        unmount();
        const calls = global.fetch.mock.calls.length;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 2);
        });
        expect(global.fetch).toHaveBeenCalledTimes(calls);
    });
});
