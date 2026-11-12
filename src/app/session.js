import {clearEditDrafts} from "./edit-drafts";
import {useActionTracker} from "./action-tracker";
import {clearConfigStamps} from "./config-stamps";
import {clearEventBuffers, closeEventSource, closeLoggerEventSource} from "../eventSourceManager";
import {clearObjectCache} from "../hooks/useEventStore.js";
import {resetClusterStatus} from "../hooks/clusterStatusOnce.js";
import {clearKeyStats} from "../hooks/useKeyStats.js";
import useEventLogStore from "../hooks/useEventLogStore.js";
import {endSession} from "./session-end";

/** The channel the tabs of the webapp tell each other of a session renewed or ended on. */
export const AUTH_CHANNEL = "auth-channel";

/**
 * Forgets what a session held, however it ended (logged out, its token refused or
 * expired, another tab logging out): nothing of it left to the next user of the
 * browser, nor to run on with their token.
 *
 * - The streams closed first, their buffered events dropped: nothing then writes
 *   the objects back to localStorage once forgotten.
 * - The objects, in memory and in localStorage.
 * - The actions in the tray, their polling ending with them.
 * - The configuration edits in progress, holding the files in clear.
 * - The configuration last written here of each object, the cluster status read
 *   once, the keys counted.
 * - The events logged, their payloads with them.
 * - The menu's own stream closed, its state emptied, the next session's read anew
 *   (onSessionEnd): the objects, nodes and pools the menu and the overview show.
 */
export function forgetSession() {
    closeEventSource();
    closeLoggerEventSource();
    clearEventBuffers();
    clearObjectCache();
    useActionTracker.setState({tracked: []});
    clearEditDrafts();
    clearConfigStamps();
    resetClusterStatus();
    clearKeyStats();
    useEventLogStore.getState().clearLogs();
    endSession();
}

/** Tells the other tabs the session ended here: each forgets it in turn (AuthProvider). */
export function broadcastLogout() {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(AUTH_CHANNEL);
    channel.postMessage({type: "logout"});
    channel.close();
}
