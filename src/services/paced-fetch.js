/**
 * The daemon throttles each client address (listener.throttle_rate, 20 requests a
 * second by default, and throttle_burst, 100): a request over it is answered 429,
 * Retry-After saying when to ask again, refused before it is run. The requests the
 * webapp sends by the hundred, an action on a selection and the tray following each,
 * go through one budget under it, the rest of the page keeping its share: an action
 * on 300 objects sent at once lost those refused, and the reads of the tray refused
 * by the thousand starved the page of its own.
 *
 * A request waits its turn, the writes (an action) before the reads (the tray), and
 * those in the background (the validation of the configurations of a list, by the
 * hundred) after both, never taking the last RESERVE of the budget: the page loaded,
 * or an action sent, has it at once. A 429 holds every request until its Retry-After
 * is over, then asks again.
 */
export const PACE = {rate: 10, burst: 30};

/** The part of the budget the requests in the background leave to the others. */
export const RESERVE = 20;

/** How many times a request refused for asking too often is asked again. */
export const MAX_ATTEMPTS = 8;

let tokens = PACE.burst;
let refilledAt = Date.now();
let blockedUntil = 0;
let timer = null;
const writes = [];
const reads = [];
const background = [];
const waiting = () => writes.length + reads.length + background.length;

function refill() {
    const now = Date.now();
    tokens = Math.min(PACE.burst, tokens + ((now - refilledAt) * PACE.rate) / 1000);
    refilledAt = now;
}

function pump() {
    timer = null;
    const now = Date.now();
    if (now < blockedUntil) {
        timer = setTimeout(pump, blockedUntil - now);
        return;
    }
    refill();
    for (;;) {
        const queue = writes.length > 0 ? writes : reads.length > 0 ? reads : background;
        if (queue.length === 0 || tokens < (queue === background ? RESERVE + 1 : 1)) break;
        tokens -= 1;
        queue.shift()();
    }
    if (waiting() > 0) timer = setTimeout(pump, Math.ceil(1000 / PACE.rate));
}

/** Resolves when the request may go: at once while the budget lasts, in its order after. */
function turn(queue) {
    return new Promise((resolve) => {
        queue.push(resolve);
        // Its turn now if the budget has it, not at the next tick of those waiting in the background.
        if (timer !== null) clearTimeout(timer);
        pump();
    });
}

/** How long a refusal for asking too often says to wait (Retry-After, in seconds), `fallback` ms when it says nothing. */
export function retryAfterMs(response, fallback = 1000) {
    const seconds = Number(response?.headers?.get?.("Retry-After"));
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : fallback;
}

/**
 * `fetch`, paced within the budget, asked again while refused for asking too often
 * (up to MAX_ATTEMPTS, the last answer then given as it is). A write unless a GET;
 * a read `background`, after the others, the RESERVE of the budget left to them.
 */
export async function pacedFetch(url, init = {}, {background: inBackground = false} = {}) {
    const write = (init.method ?? "GET").toUpperCase() !== "GET";
    const queue = write ? writes : inBackground ? background : reads;
    for (let attempt = 1; ; attempt += 1) {
        await turn(queue);
        const response = await fetch(url, init);
        if (response.status !== 429 || attempt >= MAX_ATTEMPTS) return response;
        blockedUntil = Math.max(blockedUntil, Date.now() + retryAfterMs(response));
    }
}

/** The budget full again, nothing waiting: for the tests. */
export function resetPacing() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    tokens = PACE.burst;
    refilledAt = Date.now();
    blockedUntil = 0;
    writes.length = 0;
    reads.length = 0;
    background.length = 0;
}
