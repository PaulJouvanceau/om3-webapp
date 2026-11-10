import {afterEach, describe, expect, test, vi} from "vitest";
import {loadSearchIndex} from "../searchIndex";

const answers = (objects) => ({
    "/api/object/path?path=**": objects,
    "/api/cluster/status?selector=cluster": {cluster: {node: {dev3n1: {status: {agent: "v3.0.0-rc61"}}}}},
    "/api/network": {kind: "NetworkList", items: [{name: "default", type: "bridge", network: "10.22.0.0/16"}]},
});

const serve = (byUrl) => {
    global.fetch = vi.fn((url) => Promise.resolve({
        ok: true,
        status: 200,
        headers: {get: (key) => (key === "content-type" ? "application/json" : null)},
        json: () => Promise.resolve(byUrl[decodeURIComponent(url)]),
        text: () => Promise.resolve(JSON.stringify(byUrl[decodeURIComponent(url)])),
    }));
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe("loadSearchIndex", () => {
    test.each([
        ["{kind, items}, as om3 answers every list since rc61", {kind: "ObjectPathList", items: ["ns1/svc/web", "system/cfg/dns"]}],
        ["a bare array, as before", ["ns1/svc/web", "system/cfg/dns"]],
    ])("the objects and their namespaces indexed, the paths read as %s", async (_label, objects) => {
        serve(answers(objects));
        const {entries, failed} = await loadSearchIndex();
        expect(failed).toEqual([]);
        expect(entries.filter((e) => e.kind === "object").map((e) => e.id)).toEqual(["ns1/svc/web", "system/cfg/dns"]);
        expect(entries.filter((e) => e.kind === "namespace").map((e) => e.id)).toEqual(["ns1", "system"]);
        expect(entries.filter((e) => e.kind === "node").map((e) => e.id)).toEqual(["dev3n1"]);
        expect(entries.filter((e) => e.kind === "network").map((e) => e.id)).toEqual(["default"]);
    });

    test("an answer that is no list, the objects said not read", async () => {
        serve(answers({kind: "Problem", detail: "no list"}));
        const {failed} = await loadSearchIndex();
        expect(failed).toEqual(["object", "namespace"]);
    });
});
