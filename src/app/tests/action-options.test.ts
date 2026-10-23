import { describe, expect, test } from "vitest";
import { actionOptions, optionsRequest } from "../action-options";

describe("the options of an action", () => {
  test("by what it runs on: the object switch its destination, an instance its selectors", () => {
    expect(actionOptions("switch", "object").map((o) => o.name)).toEqual(["destination", "live", "interrupt_syncs"]);
    expect(actionOptions("start", "instance").map((o) => o.name)).toEqual([
      "force",
      "disable_rollback",
      "force_affinity",
      "to",
      "subset",
      "tag",
    ]);
  });

  test("a resource action leaves out the selectors, its resources named already", () => {
    expect(actionOptions("start", "resource").map((o) => o.name)).toEqual(["force", "disable_rollback", "force_affinity"]);
  });

  test("none for an action that takes none", () => {
    expect(actionOptions("freeze", "object")).toEqual([]);
    expect(actionOptions("status", "instance")).toEqual([]);
    expect(actionOptions("giveback", "object")).toEqual([]);
  });
});

describe("the request of the options set", () => {
  test("none set: no query, no body, the action posted as before", () => {
    expect(optionsRequest("start", "instance", {})).toEqual({ query: "" });
    expect(optionsRequest("switch", "object", { destination: "", live: false })).toEqual({ query: "" });
  });

  test("the flags set and the texts given in the query, the blanks left out", () => {
    const { query, body } = optionsRequest("start", "instance", {
      force: true,
      disable_rollback: false,
      subset: " db ",
      tag: "  ",
    });
    expect(query).toBe("force=true&subset=db");
    expect(body).toBeUndefined();
  });

  test("a list repeated, comma separated as om takes it; the env one per line", () => {
    expect(optionsRequest("sync update", "instance", { target: "n2, n3,," }).query).toBe("target=n2&target=n3");
    expect(optionsRequest("run", "instance", { env: "A=1\nB=x,y\n\n" }).query).toBe("env=A%3D1&env=B%3Dx%2Cy");
    // sync-to is one text the daemon splits.
    expect(optionsRequest("stop", "instance", { "sync-to": "n2,n3", "move-to": "n2" }).query).toBe(
      "move-to=n2&sync-to=n2%2Cn3",
    );
  });

  test("the switch in its body: the node a list of one, live said off when not set", () => {
    expect(optionsRequest("switch", "object", { destination: "n2" })).toEqual({
      query: "",
      body: { destination: ["n2"], live: false },
    });
    expect(optionsRequest("switch", "object", { destination: "n2", live: true, interrupt_syncs: true }).body).toEqual({
      destination: ["n2"],
      live: true,
      interrupt_syncs: true,
    });
    // Live alone: the daemon picks the next preferred node.
    expect(optionsRequest("switch", "object", { live: true }).body).toEqual({ live: true });
  });

  test("the object restart its force in the body, the object stop its interrupt in the query", () => {
    expect(optionsRequest("restart", "object", { force: true })).toEqual({ query: "", body: { force: true } });
    expect(optionsRequest("stop", "object", { interrupt_syncs: true })).toEqual({ query: "interrupt_syncs=true" });
  });

  test("an option the action does not take is not sent", () => {
    expect(optionsRequest("freeze", "instance", { force: true })).toEqual({ query: "" });
    expect(optionsRequest("start", "resource", { subset: "db", force: true }).query).toBe("force=true");
  });
});
