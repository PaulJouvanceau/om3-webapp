/*
 * What holds the state of a session where `forgetSession` cannot reach it, in a
 * component of its own (the menu's event stream): told the session ended, to forget
 * it too. Apart from session.js, which imports the stores, for those to listen with
 * no import cycle.
 */

const listeners = new Set();

/** Calls `forget` each time a session ends; returns how to stop. */
export function onSessionEnd(forget) {
    listeners.add(forget);
    return () => {
        listeners.delete(forget);
    };
}

/** Tells every listener the session ended. */
export function endSession() {
    listeners.forEach((forget) => forget());
}
