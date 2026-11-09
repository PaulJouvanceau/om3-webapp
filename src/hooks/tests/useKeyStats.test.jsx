import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import {act, renderHook, waitFor} from "@testing-library/react";
import {clearKeyStats, useKeyStats} from "../useKeyStats.js";

const keys = (items) => ({ok: true, json: async () => ({items})});

describe("useKeyStats", () => {
    beforeEach(() => clearKeyStats());
    afterEach(() => vi.restoreAllMocks());

    test("one read for the object, kept for the next rows showing it", async () => {
        const fetch = vi.spyOn(global, "fetch").mockResolvedValue(keys([{size: 3}, {size: 4}]));
        const first = renderHook(() => useKeyStats("root/cfg/a"));
        await waitFor(() => expect(first.result.current).toEqual({count: 2, size: 7}));
        const second = renderHook(() => useKeyStats("root/cfg/a"));
        expect(second.result.current).toEqual({count: 2, size: 7});
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    test("a read ending after the session ended is kept for no one", async () => {
        let answer;
        const fetch = vi.spyOn(global, "fetch").mockImplementation(() => new Promise((resolve) => {
            answer = resolve;
        }));
        const first = renderHook(() => useKeyStats("root/cfg/a"));
        clearKeyStats();
        await act(async () => answer(keys([{size: 3}])));
        first.unmount();
        fetch.mockResolvedValue(keys([]));
        const next = renderHook(() => useKeyStats("root/cfg/a"));
        await waitFor(() => expect(next.result.current).toEqual({count: 0, size: 0}));
        expect(fetch).toHaveBeenCalledTimes(2);
    });
});
