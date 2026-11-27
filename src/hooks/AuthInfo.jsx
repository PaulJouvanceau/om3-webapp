import {useEffect, useSyncExternalStore} from "react";
import {URL_AUTH_INFO} from "../config/apiPath.js";
import logger from '../utils/logger.js';

/*
 * The authentication methods the cluster advertises (GET /auth/info), read once for
 * the whole page and shared by all who ask: the start of an OpenID session, the
 * sign-in choice, the return from the provider.
 *
 * A read failed (the daemon restarting, the network down, an answer not ok) is tried
 * again, a little later each time, and at once when the browser comes back online
 * or the page to the front: one failure at the load of the page no longer leaves
 * the sign-in choice spinning and the OpenID token never renewed until a reload.
 * Read once, it is not read again.
 */

/** The delays before each new read, in ms; the last one repeated. */
export const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

const initial = () => ({info: undefined, failed: false, failures: 0, loading: false, timer: null});
let state = initial();
const listeners = new Set();
// What the hooks read, a new object only when it changed.
let snapshot = {info: undefined, failed: false};

const publish = () => {
    if (snapshot.info !== state.info || snapshot.failed !== state.failed) {
        snapshot = {info: state.info, failed: state.failed};
        listeners.forEach((listener) => listener());
    }
};

async function load() {
    if (state.info !== undefined || state.loading) return;
    clearTimeout(state.timer);
    state.timer = null;
    state.loading = true;
    try {
        const res = await fetch(URL_AUTH_INFO);
        if (!res.ok) throw new Error(`${URL_AUTH_INFO}: ${res.status} ${res.statusText ?? ""}`.trim());
        const data = await res.json();
        if (data === null || typeof data !== "object") throw new Error(`${URL_AUTH_INFO}: not an object`);
        state = {...state, info: data, failed: false, failures: 0, loading: false};
    } catch (error) {
        const delay = RETRY_DELAYS[Math.min(state.failures, RETRY_DELAYS.length - 1)];
        logger.error(`Reading the authentication methods failed, again in ${delay / 1000}s:`, error);
        state = {...state, failed: true, failures: state.failures + 1, loading: false};
        // Not tried again for no one: the next asking starts it.
        if (listeners.size > 0) state.timer = setTimeout(() => void load(), delay);
    }
    publish();
}

/** Tried again at once, a failure waiting its delay: the browser online again, the page in front. */
const retryNow = () => {
    if (state.failed && document.visibilityState !== "hidden") void load();
};

const subscribe = (listener) => {
    listeners.add(listener);
    if (listeners.size === 1) {
        window.addEventListener("online", retryNow);
        document.addEventListener("visibilitychange", retryNow);
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
            window.removeEventListener("online", retryNow);
            document.removeEventListener("visibilitychange", retryNow);
            clearTimeout(state.timer);
            state.timer = null;
        }
    };
};

const getSnapshot = () => snapshot;

/** The authentication methods and whether the last read of them failed, read while asked. */
export function useAuthInfoState() {
    const current = useSyncExternalStore(subscribe, getSnapshot);
    useEffect(() => {
        // A failure waiting no timer, none asking it then: tried again now.
        if (state.info === undefined && !state.loading && state.timer === null) void load();
    }, []);
    return current;
}

/** The authentication methods the cluster advertises; undefined until read. */
function useAuthInfo() {
    return useAuthInfoState().info;
}

/** Forgotten, as at the load of the page: for the tests. */
export function resetAuthInfo() {
    clearTimeout(state.timer);
    state = initial();
    snapshot = {info: undefined, failed: false};
}

export default useAuthInfo;
