import {describe, expect, test} from "vitest";
import {isProblem, quietReason} from "../resource-lines";

const line = (status, flags = [], object = "ns1/svc/web", hostNode = "n2") => ({status, flags, object, hostNode});
const UP = {"ns1/svc/web": {avail: "up"}};

describe("quietReason", () => {
    test("down on a passive node, its object up on another; its object down, none", () => {
        expect(quietReason(line("down"), {objects: UP})).toBe("passive");
        expect(quietReason(line("down"), {objects: {"ns1/svc/web": {avail: "stdby up"}}})).toBe("passive");
        expect(quietReason(line("down"), {objects: {"ns1/svc/web": {avail: "down"}}})).toBeNull();
        expect(quietReason(line("down"), {objects: {}})).toBeNull();
    });

    test("by the report of its instance: down or stdby up, passive; up, the active one, none", () => {
        const reports = (avail) => ({"ns1/svc/web": {n2: {avail}}});
        expect(quietReason(line("down"), {objects: UP, reports: reports("down")})).toBe("passive");
        expect(quietReason(line("down"), {objects: UP, reports: reports("stdby up")})).toBe("passive");
        expect(quietReason(line("down"), {objects: UP, reports: reports("up")})).toBeNull();
        expect(quietReason(line("down"), {objects: UP, reports: reports("warn")})).toBeNull();
    });

    test("optional or disabled, its instance doing without it, whatever its object", () => {
        expect(quietReason(line("down", ["optional"]), {objects: {}})).toBe("optional");
        expect(quietReason(line("down", ["disabled"]), {objects: {}})).toBe("disabled");
        expect(quietReason(line("down", ["monitored"]), {objects: {}})).toBeNull();
    });

    test("its instance stopped on purpose, whatever its object", () => {
        const reports = {"ns1/svc/web": {n2: {avail: "down", stopped_at: "2026-11-10T10:00:00Z"}}};
        expect(quietReason(line("down"), {objects: {"ns1/svc/web": {avail: "down"}}, reports})).toBe("stopped");
        const never = {"ns1/svc/web": {n2: {avail: "down", stopped_at: "0001-01-01T00:00:00Z"}}};
        expect(quietReason(line("down"), {objects: {"ns1/svc/web": {avail: "down"}}, reports: never})).toBeNull();
    });

    test("of a vol down nothing uses: unused; a child up, or its children not reported, none", () => {
        const vol = (status) => ({status, flags: [], object: "ns1/vol/data", hostNode: "n1"});
        const objects = {"ns1/vol/data": {avail: "down"}};
        expect(quietReason(vol("down"), {objects, volChildren: {"ns1/vol/data": {n1: {"ns1/svc/web": "down"}}}})).toBe("unused");
        expect(quietReason(vol("down"), {objects, volChildren: {"ns1/vol/data": {n1: {}}}})).toBe("unused");
        expect(quietReason(vol("down"), {objects, volChildren: {"ns1/vol/data": {n1: {"ns1/svc/web": "up"}}}})).toBeNull();
        expect(quietReason(vol("down"), {objects, volChildren: {}})).toBeNull();
    });

    test("not down, no reason to tell", () => {
        for (const status of ["up", "warn", "n/a", "stdby up", ""]) expect(quietReason(line(status, ["optional"]), {objects: UP})).toBeNull();
    });
});

describe("isProblem", () => {
    test("down for no reason that is none, or in warn", () => {
        expect(isProblem({status: "down", quiet: null})).toBe(true);
        expect(isProblem({status: "down", quiet: "passive"})).toBe(false);
        expect(isProblem({status: "down", quiet: "optional"})).toBe(false);
        expect(isProblem({status: "warn", quiet: null})).toBe(true);
        for (const status of ["up", "n/a", "stdby up", ""]) expect(isProblem({status, quiet: null})).toBe(false);
    });
});
