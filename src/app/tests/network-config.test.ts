import { describe, expect, test } from "vitest";
import {
  type Keyword,
  bodyOps,
  parseBody,
  sectionBody,
  firstParagraph,
  isCidr,
  missingFields,
  networkEditOps,
  networkEditPreview,
  networkFields,
  networkOps,
  networkPreview,
  networkTypes,
  overlapping,
  typeDescriptions,
} from "../network-config";
// The network keywords as the daemon declares them (GET /api/cluster/config/keywords).
import KEYWORDS from "./network-keywords.fixture.json";

const keywords = KEYWORDS as Keyword[];

describe("network config", () => {
  test("the types, as the type keyword lists them, its default given; each described", () => {
    expect(networkTypes(keywords)).toEqual({ types: ["bridge", "routed_bridge", "lan"], default: "bridge" });
    const descriptions = typeDescriptions(keywords);
    expect(Object.keys(descriptions)).toEqual(["bridge", "routed_bridge", "lan"]);
    expect(descriptions.routed_bridge).toBe("a subnet cut into one range per node, routed between the nodes.");
    expect(descriptions.lan).toMatch(/^ranges of a segment the nodes share, .* failover service\.$/);
  });

  test("the fields of a type: its keywords and those of every type, the network first and required", () => {
    const bridge = networkFields(keywords, "bridge");
    expect(bridge.map((f) => f.key)).toEqual(["network", "dev", "dns", "mask_per_node", "public"]);
    expect(bridge[0]).toMatchObject({ required: true, perNode: false, kind: "text" });
    expect(bridge.find((f) => f.key === "public")?.kind).toBe("bool");
    expect(bridge.find((f) => f.key === "dns")?.kind).toBe("list");

    const lan = networkFields(keywords, "lan");
    expect(lan.map((f) => f.key).slice(0, 5)).toEqual(["network", "ranges", "dev", "gateway", "modes"]);
    expect(lan.find((f) => f.key === "modes")?.kind).toBe("choices");
    expect(lan.find((f) => f.key === "vlan_mode")?.kind).toBe("choice");
    // The keyword of the type, not that of another of the same name.
    expect(lan.find((f) => f.key === "dev")?.keyword.example).toBe("eth1");

    const routed = networkFields(keywords, "routed_bridge");
    expect(routed.filter((f) => f.perNode).map((f) => f.key)).toEqual(["subnet", "gateway", "addr"]);
    expect(routed.find((f) => f.key === "ips_per_node")?.kind).toBe("number");
    expect(routed.find((f) => f.key === "tunnel")).toMatchObject({ kind: "choice", keyword: { default: "auto" } });
  });

  test("the fields required left empty, a per-node one on any node", () => {
    const routed = networkFields(keywords, "routed_bridge");
    expect(missingFields(routed, {}, ["n1", "n2"])).toEqual(["network"]);
    expect(missingFields(routed, { network: " " }, ["n1"])).toEqual(["network"]);
    expect(missingFields(routed, { network: "10.40.0.0/16" }, ["n1"])).toEqual([]);
  });

  test("an address range, v4 or v6", () => {
    expect(isCidr("10.30.0.0/16")).toBe(true);
    expect(isCidr(" fd00::/64 ")).toBe(true);
    expect(isCidr("10.30.0.0")).toBe(false);
    expect(isCidr("eth0/1")).toBe(false);
  });

  test("the networks whose IPv4 range overlaps", () => {
    const networks = [
      { name: "lo", network: "127.0.0.1/32" },
      { name: "default", network: "10.22.0.0/16" },
      { name: "lan1", network: "192.168.10.0/24" },
      { name: "v6", network: "fd00::/64" },
      { name: "none" },
    ];
    expect(overlapping("10.22.128.0/17", networks)).toEqual(["default"]);
    expect(overlapping("10.0.0.0/8", networks)).toEqual(["default"]);
    expect(overlapping("192.168.11.0/24", networks)).toEqual([]);
    expect(overlapping("fd00::/48", networks)).toEqual([]);
  });

  test("the keys written, the type first, empty ones left out; the section as it will read", () => {
    const values = { network: " 10.40.0.0/16 ", "subnet@n2": "10.40.1.0/24", "subnet@n1": "10.40.0.0/24", dns: "" };
    expect(networkOps("back", "routed_bridge", values)).toEqual([
      "network#back.type=routed_bridge",
      "network#back.network=10.40.0.0/16",
      "network#back.subnet@n1=10.40.0.0/24",
      "network#back.subnet@n2=10.40.1.0/24",
    ]);
    expect(networkPreview("back", "routed_bridge", values)).toBe(
      "[network#back]\ntype = routed_bridge\nnetwork = 10.40.0.0/16\nsubnet@n1 = 10.40.0.0/24\nsubnet@n2 = 10.40.1.0/24",
    );
  });

  test("the body of a section, its header out; its keys, scoped ones too, comments and blank lines aside, other lines said", () => {
    expect(sectionBody("[network#b]\ntype = lan\nnetwork = 10.0.0.0/24\n")).toBe("type = lan\nnetwork = 10.0.0.0/24");
    expect(sectionBody(null)).toBe("");
    expect(parseBody("type = lan\n# a comment\n\ndev@n1=eth1\noops\n")).toEqual({
      values: { type: "lan", "dev@n1": "eth1" },
      invalid: ["oops"],
    });
  });

  test("an edit written as the keys changed or added set, the type first, those gone unset", () => {
    const before = "type = lan\nnetwork = 10.0.0.0/24\ndev = eth1\nvlan_tag = 44";
    const after = "network = 10.0.0.0/24\ndev = eth1\ndev@n2 = bond0\ntype = routed_bridge";
    expect(bodyOps("seg", before, after)).toEqual({
      set: ["network#seg.type=routed_bridge", "network#seg.dev@n2=bond0"],
      unset: ["network#seg.vlan_tag"],
      invalid: [],
    });
    expect(bodyOps("seg", before, before)).toEqual({ set: [], unset: [], invalid: [] });
    expect(bodyOps("seg", "", "x y").invalid).toEqual(["x y"]);
  });

  test("a value continued on the lines under its key, as om3 reads one: its lines, their indent kept", () => {
    const body = "type = lan\ndns = 10.0.0.1\n  10.0.0.2\n\t10.0.0.3 = x\nnetwork = 10.0.0.0/24\n# a comment\n  not continued\n";
    // An indented line under a key continues it, an "=" in it or not; under a comment, it is none.
    expect(parseBody(body)).toEqual({
      values: { type: "lan", dns: "10.0.0.1\n  10.0.0.2\n\t10.0.0.3 = x", network: "10.0.0.0/24" },
      invalid: ["not continued"],
    });
    // A blank line ends it; a key with no value on its line, continued.
    expect(parseBody("dns =\n  a\n  b\n\n  c = d").values).toEqual({ dns: "\n  a\n  b", c: "d" });
  });

  test("a section holding a value on many lines: saved untouched, the others edited; itself edited, written whole", () => {
    const before = "type = lan\ndns = 10.0.0.1\n  10.0.0.2\nnetwork = 10.0.0.0/24";
    expect(bodyOps("seg", before, before.replace("10.0.0.0/24", "10.1.0.0/24"))).toEqual({
      set: ["network#seg.network=10.1.0.0/24"],
      unset: [],
      invalid: [],
    });
    expect(bodyOps("seg", before, before.replace("  10.0.0.2", "  10.0.0.2\n  10.0.0.3"))).toEqual({
      set: ["network#seg.dns=10.0.0.1\n  10.0.0.2\n  10.0.0.3"],
      unset: [],
      invalid: [],
    });
  });

  test("a modification: the fields changed set, those emptied unset, other keys left alone", () => {
    const fields = ["network", "subnet", "tunnel", "dns"];
    const original = { type: "routed_bridge", network: "10.100.0.0/22", "subnet@n1": "10.100.0.0/24", tunnel: "auto", custom: "x" };
    const values = { network: "10.100.0.0/22", "subnet@n1": "10.100.4.0/24", tunnel: "", dns: "10.0.0.53", custom: "y" };
    expect(networkEditOps("b3", "routed_bridge", original, values, fields)).toEqual({
      rewrite: false,
      set: ["network#b3.dns=10.0.0.53", "network#b3.subnet@n1=10.100.4.0/24"],
      unset: ["network#b3.tunnel"],
    });
    expect(networkEditPreview("b3", "routed_bridge", original, values, fields)).toBe(
      "[network#b3]\ntype = routed_bridge\ncustom = x\ndns = 10.0.0.53\nnetwork = 10.100.0.0/22\nsubnet@n1 = 10.100.4.0/24",
    );
    expect(networkEditOps("b3", "routed_bridge", original, { network: "10.100.0.0/22", "subnet@n1": "10.100.0.0/24", tunnel: "auto" }, fields))
      .toEqual({ rewrite: false, set: [], unset: [] });
  });

  test("a modification to another type: the section written anew; one of no type given it", () => {
    const original = { type: "lan", network: "10.0.0.0/24", ranges: "10.0.0.128/25" };
    expect(networkEditOps("seg", "bridge", original, { network: "10.0.0.0/24", ranges: "10.0.0.128/25" }, ["network", "dev"])).toEqual({
      rewrite: true,
      set: ["network#seg.type=bridge", "network#seg.network=10.0.0.0/24"],
      unset: [],
    });
    expect(networkEditPreview("seg", "bridge", original, { network: "10.0.0.0/24", ranges: "x" }, ["network"]))
      .toBe("[network#seg]\ntype = bridge\nnetwork = 10.0.0.0/24");
    expect(networkEditOps("default", "bridge", {}, { network: "10.30.0.0/16" }, ["network"]).set)
      .toEqual(["network#default.type=bridge", "network#default.network=10.30.0.0/16"]);
  });

  test("the first paragraph of a help text, on one line", () => {
    expect(firstParagraph("The cluster backend\nnetwork.\n\nMore.")).toBe("The cluster backend network.");
    expect(firstParagraph(undefined)).toBe("");
  });
});
