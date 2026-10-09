import {useEffect, useMemo, useState} from "react";
import axios from "axios";
import {EventSourcePolyfill} from "event-source-polyfill";
import {useTranslation} from "react-i18next";
import i18n from "../i18n";
import {URL_NETWORK, URL_NODE_EVENT, URL_POOL} from "../config/apiPath.js";
import logger from "../utils/logger.js";
import {parseObjectPath} from "../utils/objectUtils.jsx";

/** Pools and networks have no events: their usage is polled at this period. */
export const SIDEBAR_USAGE_REFRESH_MS = 15000;

/** Delay before the sidebar event stream reconnects after an error. */
export const SIDEBAR_RECONNECT_MS = 5000;

/** Delay grouping the bursts of events into one render. */
export const SIDEBAR_FLUSH_MS = 300;

/**
 * Events of the sidebar stream. With `cache=true` the daemon first replays the
 * last event of each object, node and heartbeat, which gives the current state,
 * then sends the changes as they happen.
 */
const SIDEBAR_EVENTS = [
    "ObjectStatusUpdated",
    "ObjectDeleted",
    "NodeStatusUpdated",
    "DaemonHeartbeatUpdated",
];

export const SIDEBAR_EVENTS_URL =
    `${URL_NODE_EVENT}?cache=true&${SIDEBAR_EVENTS.map((event) => `filter=${event}`).join("&")}`;

const ZERO_TIME = "0001-01-01T00:00:00Z";

/**
 * Pill of a set of objects: down wins over warn, warn over up. Grey when there is
 * no object, or none with an up, warn or down availability (n/a, or no
 * availability at all, as for cfg, sec and usr objects).
 */
export function objectsPill(objects) {
    let up = false;
    let warn = false;
    for (const status of Object.values(objects || {})) {
        const avail = status?.avail;
        if (avail === "down") return "down";
        if (avail === "warn") warn = true;
        if (avail === "up") up = true;
    }
    if (warn) return "warn";
    return up ? "up" : "unknown";
}

/** A single pill numbering the items in an alarming state; none when there is none. */
export function alertPills(state, count) {
    return count > 0 ? [{state, count}] : [];
}

/** Pools or networks used to their full size. */
export function fullCount(items) {
    return (items || []).filter(
        (item) => typeof item?.size === "number" && item.size > 0 && item.used >= item.size
    ).length;
}

/** Frozen nodes. */
export function frozenCount(nodeStatus) {
    return Object.values(nodeStatus || {}).filter(
        (status) => !!status?.frozen_at && status.frozen_at !== ZERO_TIME
    ).length;
}

const emptyState = () => ({objects: {}, nodeStatus: {}, heartbeatStatus: {}});

/** Applies one event of the sidebar stream to the state maps, in place. */
export function applySidebarEvent(state, type, data) {
    const path = data?.path || data?.labels?.path;
    const node = data?.node || data?.labels?.node;
    switch (type) {
        case "ObjectStatusUpdated":
            if (path && data.object_status) state.objects[path] = data.object_status;
            break;
        case "ObjectDeleted":
            if (path) delete state.objects[path];
            break;
        case "NodeStatusUpdated":
            if (node && data.node_status) state.nodeStatus[node] = data.node_status;
            break;
        case "DaemonHeartbeatUpdated":
            if (node && data.heartbeat) state.heartbeatStatus[node] = data.heartbeat;
            break;
        default:
            break;
    }
}

/**
 * Keeps the object, node and heartbeat state the pills are computed from, fed by
 * an event stream of its own: the views open and close the shared one with their
 * own filters, the sidebar stays live whatever the view.
 */
function useSidebarEventState() {
    const [state, setState] = useState(emptyState);

    useEffect(() => {
        let source = null;
        let reconnectTimer = null;
        let flushTimer = null;
        let closed = false;
        // Built from scratch on every connection: the cache replays the whole
        // state, which drops the objects deleted while disconnected.
        let working = emptyState();
        let replaced = false;

        const flush = () => {
            flushTimer = null;
            const snapshot = {
                objects: {...working.objects},
                nodeStatus: {...working.nodeStatus},
                heartbeatStatus: {...working.heartbeatStatus},
            };
            setState(snapshot);
        };

        const onEvent = (type) => (event) => {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch {
                return;
            }
            if (!replaced) {
                working = emptyState();
                replaced = true;
            }
            applySidebarEvent(working, type, data);
            if (flushTimer === null) flushTimer = setTimeout(flush, SIDEBAR_FLUSH_MS);
        };

        const scheduleReconnect = () => {
            if (closed || reconnectTimer !== null) return;
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                connect();
            }, SIDEBAR_RECONNECT_MS);
        };

        function connect() {
            if (closed) return;
            // Read on every connection: a refreshed token is picked up on reconnect.
            const token = localStorage.getItem("authToken");
            if (!token) {
                scheduleReconnect();
                return;
            }
            replaced = false;
            source = new EventSourcePolyfill(SIDEBAR_EVENTS_URL, {
                headers: {Authorization: `Bearer ${token}`},
                withCredentials: true,
            });
            for (const type of SIDEBAR_EVENTS) {
                source.addEventListener(type, onEvent(type));
            }
            source.onerror = (error) => {
                logger.warn("Sidebar event stream error, reconnecting", error?.status ?? "");
                source?.close();
                source = null;
                scheduleReconnect();
            };
        }

        connect();
        return () => {
            closed = true;
            clearTimeout(reconnectTimer);
            clearTimeout(flushTimer);
            source?.close();
        };
    }, []);

    return state;
}

/** Pool and network lists, polled; a failed request keeps the last known lists. */
function useUsageLists() {
    const [pools, setPools] = useState([]);
    const [networks, setNetworks] = useState([]);

    useEffect(() => {
        let cancelled = false;
        const refresh = async () => {
            const token = localStorage.getItem("authToken");
            if (!token) return;
            const headers = {Authorization: `Bearer ${token}`};
            const [pool, network] = await Promise.allSettled([
                axios.get(URL_POOL, {headers}),
                axios.get(URL_NETWORK, {headers}),
            ]);
            if (cancelled) return;
            if (pool.status === "fulfilled") setPools(pool.value?.data?.items || []);
            if (network.status === "fulfilled") setNetworks(network.value?.data?.items || []);
        };
        void refresh();
        const timer = setInterval(refresh, SIDEBAR_USAGE_REFRESH_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, []);

    return {pools, networks};
}

/** Order of the count pills, from left to right. */
const COUNT_ORDER = ["up", "warn", "down", "unknown"];

/**
 * Count pills of a tally by state: one pill per state with a non-zero count, in
 * `COUNT_ORDER`. A single grey 0 when there is nothing to count.
 */
export function countPills(tally) {
    const pills = COUNT_ORDER
        .filter((state) => (tally[state] || 0) > 0)
        .map((state) => ({state, count: tally[state]}));
    return pills.length > 0 ? pills : [{state: "unknown", count: 0}];
}

/** Objects by availability: up, warn, down, and unknown for n/a or none. */
export function objectCounts(objects) {
    const tally = {};
    for (const status of Object.values(objects || {})) {
        const state = objectsPill({x: status});
        tally[state] = (tally[state] || 0) + 1;
    }
    return countPills(tally);
}

/**
 * Groups of objects, namespaces or kinds, by their worst object: a group with a
 * down object counts as down, else with a warn one as warn, else with an up one
 * as up, else as unknown.
 */
export function groupCounts(objects, groupOf) {
    const groups = {};
    for (const [path, status] of Object.entries(objects || {})) {
        const key = groupOf(parseObjectPath(path));
        (groups[key] ??= {})[path] = status;
    }
    const tally = {};
    for (const members of Object.values(groups)) {
        const state = objectsPill(members);
        tally[state] = (tally[state] || 0) + 1;
    }
    return countPills(tally);
}

/** Heartbeat streams: up when running with every peer beating, down when stopped or with a stale peer. */
export function heartbeatCounts(heartbeatStatus) {
    const tally = {};
    for (const node of Object.values(heartbeatStatus || {})) {
        for (const stream of node?.streams || []) {
            const failing = stream?.state === "stopped" ||
                Object.values(stream?.peers || {}).some((peer) => peer?.is_beating === false);
            const state = failing ? "down" : "up";
            tally[state] = (tally[state] || 0) + 1;
        }
    }
    return countPills(tally);
}

/** Lines of the mouseover of the Nodes entry: count and frozen ones, in the current language. */
export function nodesDetails(nodeStatus) {
    return [
        i18n.t("alerts.details.node", {count: Object.keys(nodeStatus || {}).length}),
        i18n.t("alerts.details.frozen", {count: frozenCount(nodeStatus)}),
    ];
}

/**
 * Lines of the mouseover of the Pools and Networks entries: count, full ones, top
 * usage, in the current language. `word` is the item kind: "pool" or "network".
 */
export function usageDetails(items, word) {
    const list = items || [];
    const sized = list.filter((item) => typeof item?.size === "number" && item.size > 0);
    const lines = [
        i18n.t(`alerts.details.${word}`, {count: list.length}),
        i18n.t("alerts.details.full", {count: fullCount(list)}),
    ];
    if (sized.length > 0) {
        const top = sized.reduce((max, item) => (item.used / item.size > max.used / max.size ? item : max));
        lines.push(i18n.t("alerts.details.highestUsage", {
            name: top.name ?? "?",
            percent: Math.round((top.used / top.size) * 100),
        }));
    }
    return lines;
}

/**
 * State of the sidebar entries, kept up to date without any user action. For each
 * entry path, `counts`: the pills numbering its items by state (empty for no pill),
 * and for some entries the `details` lines of their mouseover.
 */
export default function useSidebarAlerts() {
    const {objects, nodeStatus, heartbeatStatus} = useSidebarEventState();
    const {pools, networks} = useUsageLists();
    // The details are text: computed again when the language changes.
    const {i18n: {language}} = useTranslation();

    return useMemo(() => ({
        "/objects": {counts: objectCounts(objects)},
        "/namespaces": {counts: groupCounts(objects, ({namespace}) => namespace)},
        "/kinds": {counts: groupCounts(objects, ({kind}) => kind)},
        "/heartbeats": {counts: heartbeatCounts(heartbeatStatus)},
        "/pools": {counts: alertPills("down", fullCount(pools)), details: usageDetails(pools, "pool")},
        "/network": {counts: alertPills("down", fullCount(networks)), details: usageDetails(networks, "network")},
        "/nodes": {counts: alertPills("frozen", frozenCount(nodeStatus)), details: nodesDetails(nodeStatus)},
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [objects, nodeStatus, heartbeatStatus, pools, networks, language]);
}
