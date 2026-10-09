import React, {useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {URL_METRICS_PG} from "../config/apiPath.js";
import {cpuPercent, formatBytes, namespaceCgroupMetrics, namespaceTotals} from "../utils/cgroupMetrics";
import {Table, HeaderRow, HeaderCell, Row, Cell, EmptyRow} from "../ui/components/Table";
import {Alert} from "../ui/components/Alert";
import {Spinner} from "../ui/components/Spinner";
import logger from "../utils/logger.js";

export const REFRESH_INTERVAL_MS = 5000;

const formatCpu = (percent) => (percent === null ? "-" : `${percent.toFixed(1)} %`);

/** A figure of the namespace as a whole, over the per object table. */
const TotalTile = ({label, value}) => (
    <div className="rounded-(--radius-panel) border border-line bg-surface-sunken px-3 py-2">
        <dt className="text-ink-muted">{label}</dt>
        <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
);

/**
 * The CPU and memory used by the cgroups of the objects of a namespace,
 * and by the namespace as a whole, refreshed while shown. The CPU is the
 * rate between two readings, so it shows on the second one.
 *
 * The daemon serves these at /metrics/pg for the node it runs on only, so
 * this is the usage on the node the webapp is served from.
 */
const NamespaceMetrics = ({namespace}) => {
    const {t} = useTranslation();
    const [rows, setRows] = useState(null);
    const [error, setError] = useState(null);
    const previous = useRef(null);

    useEffect(() => {
        previous.current = null;
        setRows(null);
        setError(null);
        const controller = new AbortController();

        const read = async () => {
            try {
                const response = await fetch(URL_METRICS_PG, {signal: controller.signal});
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const byPath = namespaceCgroupMetrics(await response.text(), namespace);
                const now = Date.now();
                const last = previous.current;
                setRows(Object.entries(byPath).map(([path, metrics]) => ({
                    path,
                    ...metrics,
                    cpu: last ? cpuPercent(last.byPath[path]?.cpuUsageUsec, metrics.cpuUsageUsec, now - last.at) : null,
                })));
                previous.current = {at: now, byPath};
                setError(null);
            } catch (err) {
                if (err.name === "AbortError") return;
                logger.error("Failed to fetch namespace metrics:", err);
                setError(err.message);
            }
        };

        void read();
        const timer = setInterval(read, REFRESH_INTERVAL_MS);
        return () => {
            clearInterval(timer);
            controller.abort();
        };
    }, [namespace]);

    const sortedRows = useMemo(
        () => (rows || []).slice().sort((a, b) => a.path.localeCompare(b.path)),
        [rows]
    );
    const totals = useMemo(() => namespaceTotals(sortedRows), [sortedRows]);

    return (
        <div className="flex flex-col gap-3">
            {error && <Alert>{t("metrics.fetchError", {error})}</Alert>}
            {rows === null && !error ? (
                <div className="flex justify-center">
                    <Spinner label={t("metrics.loading")}/>
                </div>
            ) : (
                <>
                {sortedRows.length > 0 && (
                    <section aria-label={t("metrics.totals.label")}>
                        <dl className="grid grid-cols-2 gap-3">
                            <TotalTile label={t("metrics.totals.cpu")} value={formatCpu(totals.cpu)}/>
                            <TotalTile label={t("metrics.totals.memory")} value={formatBytes(totals.memoryCurrent)}/>
                        </dl>
                    </section>
                )}
                <Table>
                    <thead>
                        <HeaderRow>
                            <HeaderCell>{t("metrics.columns.object")}</HeaderCell>
                            <HeaderCell>{t("metrics.columns.cpu")}</HeaderCell>
                            <HeaderCell>{t("metrics.columns.memory")}</HeaderCell>
                            <HeaderCell>{t("metrics.columns.limit")}</HeaderCell>
                        </HeaderRow>
                    </thead>
                    <tbody>
                        {sortedRows.length > 0 ? sortedRows.map((row) => (
                            <Row key={row.path}>
                                <Cell className="font-medium">{row.path}</Cell>
                                <Cell numeric>{formatCpu(row.cpu)}</Cell>
                                <Cell numeric>{formatBytes(row.memoryCurrent)}</Cell>
                                <Cell numeric>{formatBytes(row.memoryMax)}</Cell>
                            </Row>
                        )) : (
                            <EmptyRow colSpan={4}>{t("metrics.empty", {namespace})}</EmptyRow>
                        )}
                    </tbody>
                </Table>
                </>
            )}
            <p className="text-ink-muted">
                {t("metrics.footer", {seconds: REFRESH_INTERVAL_MS / 1000})}
            </p>
        </div>
    );
};

export default NamespaceMetrics;
