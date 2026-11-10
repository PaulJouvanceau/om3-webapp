import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import {broadcastLogout, forgetSession} from "../session";
import {useActionTracker} from "../action-tracker";
import {configStamp, recordConfigWrite} from "../config-stamps";
import useEventStore from "../../hooks/useEventStore.js";
import {readClusterStatus, resetClusterStatus} from "../../hooks/clusterStatusOnce.js";
import {clearEventBuffers, closeEventSource, closeLoggerEventSource} from "../../eventSourceManager";

vi.mock("../../eventSourceManager", () => ({
    closeEventSource: vi.fn(),
    closeLoggerEventSource: vi.fn(),
    clearEventBuffers: vi.fn(),
}));

const written = (path, at) => recordConfigWrite(path, {headers: {get: () => at}});

describe("forgetSession", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        resetClusterStatus();
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test("closes the streams before the objects are forgotten, their buffers dropped", () => {
        const order = [];
        closeEventSource.mockImplementation(() => order.push("stream"));
        closeLoggerEventSource.mockImplementation(() => order.push("logger"));
        clearEventBuffers.mockImplementation(() => order.push("buffers"));
        useEventStore.setState({objectStatus: {"root/svc/a": {avail: "up"}}});
        forgetSession();
        expect(order).toEqual(["stream", "logger", "buffers"]);
        expect(useEventStore.getState().objectStatus).toEqual({});
    });

    test("leaves no object in localStorage, none written back after", () => {
        useEventStore.setState({objectStatus: {"root/svc/a": {avail: "up"}}});
        vi.runAllTimers();
        expect(localStorage.getItem("om3-event-storage")).toContain("root/svc/a");
        forgetSession();
        vi.runAllTimers();
        expect(localStorage.getItem("om3-event-storage")).toBeNull();
    });

    test("empties the action tray, its polling ending with its entries", () => {
        useActionTracker.setState({tracked: [{id: "a", action: "start", subject: "root/svc/a", state: "running"}]});
        forgetSession();
        expect(useActionTracker.getState().tracked).toEqual([]);
    });

    test("forgets the configuration written of each object", () => {
        written("root/svc/a", "2026-11-09T10:00:00Z");
        expect(configStamp("root/svc/a")).toBe("2026-11-09T10:00:00Z");
        forgetSession();
        expect(configStamp("root/svc/a")).toBeUndefined();
    });

    test("reads the cluster status again for the next session", async () => {
        const fetch = vi.spyOn(global, "fetch").mockResolvedValue({ok: true, json: async () => ({})});
        await readClusterStatus();
        await readClusterStatus();
        expect(fetch).toHaveBeenCalledTimes(1);
        forgetSession();
        await readClusterStatus();
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});

describe("broadcastLogout", () => {
    test("tells the other tabs on the auth channel", () => {
        const posted = [];
        const original = global.BroadcastChannel;
        global.BroadcastChannel = class {
            constructor(name) {
                this.name = name;
            }
            postMessage(message) {
                posted.push([this.name, message]);
            }
            close() {}
        };
        try {
            broadcastLogout();
            expect(posted).toEqual([["auth-channel", {type: "logout"}]]);
        } finally {
            global.BroadcastChannel = original;
        }
    });
});
