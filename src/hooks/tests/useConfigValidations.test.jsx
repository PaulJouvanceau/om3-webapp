import {afterEach, describe, expect, test, vi} from "vitest";
import {renderHook, waitFor} from "@testing-library/react";
import {useConfigValidations, validationLevel} from "../useConfigValidations.js";

// The pacing itself tested of its own (paced-fetch): here, sent through it, in the background.
const {paced} = vi.hoisted(() => ({paced: []}));
vi.mock("../../services/paced-fetch.js", () => ({
    pacedFetch: (url, init, options) => {
        paced.push(options);
        return global.fetch(url, init);
    },
}));

const alerts = (...levels) => ({ok: true, json: async () => ({items: levels.map((level) => ({level}))})});

describe("validationLevel", () => {
    test("an error first, then a warning, else valid; no answer, none", () => {
        expect(validationLevel([{level: "warning"}, {level: "error"}])).toBe("error");
        expect(validationLevel([{level: "warning"}])).toBe("warning");
        expect(validationLevel([])).toBe("valid");
        expect(validationLevel(undefined)).toBeUndefined();
    });
});

describe("useConfigValidations", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        paced.length = 0;
    });

    const instances = {"ns/svc/a": {n2: {}, n1: {}}, "ns/svc/b": {n1: {}}};

    test("each object validated on its first node, a request each; its result by its name", async () => {
        const fetch = vi.spyOn(global, "fetch").mockImplementation(async (url) => (url.includes("/svc/a/") ? alerts("warning") : alerts()));
        const {result} = renderHook(() => useConfigValidations(["ns/svc/a", "ns/svc/b"], {instances, configs: {}}));
        await waitFor(() => expect(result.current).toEqual(new Map([["ns/svc/a", "warning"], ["ns/svc/b", "valid"]])));
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch.mock.calls.map(([url]) => url)).toContain("/api/node/name/n1/instance/path/ns/svc/a/config/validate");
        // Paced, after the requests of the page and the actions: not using up the throttle of the daemon.
        expect(paced).toEqual([{background: true}, {background: true}]);
    });

    test("still refused for asking too often: not taken for failed, validated again at the next turn", async () => {
        const fetch = vi.spyOn(global, "fetch").mockResolvedValue({ok: false, status: 429});
        const configs = {"ns/svc/b": {n1: {csum: "one"}}};
        const {result, rerender} = renderHook(({names}) => useConfigValidations(names, {instances, configs}),
            {initialProps: {names: ["ns/svc/b"]}});
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
        expect(result.current.has("ns/svc/b")).toBe(false);
        // Its configuration the same, the list asked again: asked again, not taken as done.
        fetch.mockResolvedValue(alerts("warning"));
        rerender({names: ["ns/svc/b"]});
        await waitFor(() => expect(result.current.get("ns/svc/b")).toBe("warning"));
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    test("validated again once its configuration changed, not before; none when disabled or failed", async () => {
        const fetch = vi.spyOn(global, "fetch").mockResolvedValue(alerts());
        const names = ["ns/svc/b"];
        const {result, rerender} = renderHook(({configs, enabled}) => useConfigValidations(names, {instances, configs, enabled}),
            {initialProps: {configs: {"ns/svc/b": {n1: {csum: "one"}}}, enabled: true}});
        await waitFor(() => expect(result.current.get("ns/svc/b")).toBe("valid"));
        rerender({configs: {"ns/svc/b": {n1: {csum: "one"}}}, enabled: true});
        expect(fetch).toHaveBeenCalledTimes(1);
        fetch.mockResolvedValue(alerts("error"));
        rerender({configs: {"ns/svc/b": {n1: {csum: "two"}}}, enabled: true});
        await waitFor(() => expect(result.current.get("ns/svc/b")).toBe("error"));
        fetch.mockResolvedValue({ok: false, status: 500});
        rerender({configs: {"ns/svc/b": {n1: {csum: "three"}}}, enabled: true});
        await waitFor(() => expect(result.current.has("ns/svc/b")).toBe(false));
        rerender({configs: {"ns/svc/b": {n1: {csum: "four"}}}, enabled: false});
        expect(fetch).toHaveBeenCalledTimes(3);
    });
});
