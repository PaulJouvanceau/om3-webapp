import { describe, expect, test } from "vitest";
import { CENTRE_CLEAR, DIRECTION_OFFSET, MAX_LABEL, MIN_BEND, SMALL_GAP, groupState, meshLayout, meshLinks, meshNodes, nodeLabel, nodeWidth } from "../heartbeat-mesh";

/** The circle of a line of the mesh, "M x y A r r 0 large sweep x y": its centre, radius, start angle and sweep. */
const arcOf = (path: string) => {
  const [x1, y1, r, , , large, sweep, x2, y2] = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const m = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  const d = Math.hypot(x2 - x1, y2 - y1);
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
  const perp = { x: -(y2 - y1) / d, y: (x2 - x1) / d };
  for (const k of [1, -1]) {
    const c = { x: m.x + perp.x * h * k, y: m.y + perp.y * h * k };
    const a1 = Math.atan2(y1 - c.y, x1 - c.x);
    let delta = Math.atan2(y2 - c.y, x2 - c.x) - a1;
    if (sweep === 1) while (delta <= 0) delta += 2 * Math.PI;
    else while (delta >= 0) delta -= 2 * Math.PI;
    if ((Math.abs(delta) > Math.PI) === (large === 1)) return { c, r, a1, delta, start: { x: x1, y: y1 }, end: { x: x2, y: y2 } };
  }
  throw new Error(`no circle for ${path}`);
};
/** A point of a line of the mesh at t. */
const at = (path: string, t: number) => {
  const { c, r, a1, delta } = arcOf(path);
  return { x: c.x + r * Math.cos(a1 + delta * t), y: c.y + r * Math.sin(a1 + delta * t) };
};
/** The length of a line of the mesh. */
const lengthOf = (path: string) => {
  const { r, delta } = arcOf(path);
  return r * Math.abs(delta);
};

/** Two nodes beating each other on hb#1, n2 receiving nothing from n1 on hb#2. */
const STATUS = {
  n1: {
    streams: [
      { id: "hb#1.rx", type: "unicast", state: "running", peers: { n2: { is_beating: true, desc: ":10011 ← n2" } } },
      { id: "hb#1.tx", type: "unicast", state: "running", peers: { n2: { is_beating: true, desc: "→ n2:10011" } } },
    ],
  },
  n2: {
    streams: [
      { id: "hb#1.rx", type: "unicast", state: "running", peers: { n1: { is_beating: true } } },
      { id: "hb#1.tx", type: "unicast", state: "running", peers: { n1: { is_beating: true } } },
      { id: "hb#2.rx", type: "multicast", state: "running", peers: { n1: { is_beating: false } } },
      { id: "hb#relay.tx", type: "relay", state: "stopped", peers: { n1: { is_beating: true } } },
    ],
  },
};

describe("meshLinks", () => {
  test("a link per stream of each node toward each peer, from the sender to the receiver", () => {
    const links = meshLinks(STATUS);
    expect(links.map((l) => [l.node, l.hb, l.dir, l.from, l.to])).toEqual([
      ["n1", "hb#1", "rx", "n2", "n1"],
      ["n1", "hb#1", "tx", "n1", "n2"],
      ["n2", "hb#1", "rx", "n1", "n2"],
      ["n2", "hb#1", "tx", "n2", "n1"],
      ["n2", "hb#2", "rx", "n1", "n2"],
      ["n2", "hb#relay", "tx", "n2", "n1"],
    ]);
    expect(links[0]).toMatchObject({ type: "unicast", desc: ":10011 ← n2", state: "up" });
  });

  test("down when the peer does not beat, or the stream does not run", () => {
    const links = meshLinks(STATUS);
    expect(links.find((l) => l.hb === "hb#2")?.state).toBe("down");
    expect(links.find((l) => l.hb === "hb#relay")).toMatchObject({ state: "down", streamState: "stopped" });
  });

  test("a stream reporting no peer, as a stopped one, is down toward the peers of its heartbeat on its node", () => {
    const links = meshLinks({
      n1: { streams: [{ id: "hb#1.rx", state: "running", peers: { n2: { is_beating: true }, n3: { is_beating: true } } }] },
      n2: { streams: [] },
      n3: {
        streams: [
          { id: "hb#1.rx", state: "running", peers: { n1: { is_beating: true }, n2: { is_beating: true } } },
          { id: "hb#1.tx", type: "unicast", state: "stopped", peers: {} },
        ],
      },
    });
    expect(links.filter((l) => l.node === "n3" && l.dir === "tx").map((l) => [l.from, l.to, l.state, l.streamState])).toEqual([
      ["n3", "n1", "down", "stopped"],
      ["n3", "n2", "down", "stopped"],
    ]);
  });

  test("a stream reporting no peer, its heartbeat knowing none on its node, is toward every other node", () => {
    const links = meshLinks({ n1: { streams: [{ id: "hb#1.tx", state: "stopped" }] }, n2: { streams: [] } });
    expect(links.map((l) => [l.from, l.to, l.state])).toEqual([["n1", "n2", "down"]]);
  });

  test("the nodes: those reporting and their peers", () => {
    const links = meshLinks({ n1: { streams: [{ id: "hb#1.tx", state: "running", peers: { n3: { is_beating: true } } }] } });
    expect(meshNodes({ n1: {} }, links)).toEqual(["n1", "n3"]);
  });
});

describe("meshLayout", () => {
  test("two nodes face each other, one over the other in a square, a line each way holding the links of its direction", () => {
    const links = meshLinks(STATUS);
    const layout = meshLayout(["n1", "n2"], links);
    expect(layout.width).toBe(layout.height);
    expect(layout.nodes.n1.x).toBeCloseTo(layout.nodes.n2.x);
    expect(layout.nodes.n1.y).toBeLessThan(layout.nodes.n2.y);
    expect(layout.groups.map((g) => [g.from, g.to, g.links.map((l) => `${l.hb}.${l.dir}@${l.node}`)])).toEqual([
      // By heartbeat, the sender's tx before the receiver's rx.
      ["n1", "n2", ["hb#1.tx@n1", "hb#1.rx@n2", "hb#2.rx@n2"]],
      ["n2", "n1", ["hb#1.tx@n2", "hb#1.rx@n1", "hb#relay.tx@n2"]],
    ]);
  });

  test("two nodes across the centre: their two directions arc apart around it, each from its sender, its middle out of the room kept clear", () => {
    const layout = meshLayout(["n1", "n2"], meshLinks(STATUS));
    const [forward, backward] = layout.groups;
    const f = arcOf(forward.path);
    const b = arcOf(backward.path);
    // Bulging apart: their middles one each side of the line of the nodes.
    const x = layout.nodes.n1.x;
    expect(Math.sign(at(forward.path, 0.5).x - x)).toBe(-Math.sign(at(backward.path, 0.5).x - x));
    // Each from its sender: n1 to n2 downwards, n2 to n1 upwards.
    expect(f.start.y).toBeLessThan(f.end.y);
    expect(b.start.y).toBeGreaterThan(b.end.y);
    const centre = { x: layout.width / 2, y: layout.height / 2 };
    const radius = Math.abs(layout.nodes.n1.y - centre.y);
    for (const g of layout.groups) {
      const middle = at(g.path, 0.5);
      expect(Math.hypot(middle.x - centre.x, middle.y - centre.y)).toBeGreaterThan(radius * CENTRE_CLEAR - DIRECTION_OFFSET);
    }
  });

  test("the four arrows of a pair on one arc: its two directions concentric, side by side, each its halves on its circle", () => {
    const names = ["a", "b", "c", "d", "e", "f"];
    const status = Object.fromEntries(names.map((n) => [n, { streams: [
      { id: "hb#1.tx", state: "running", peers: Object.fromEntries(names.filter((m) => m !== n).map((m) => [m, { is_beating: true }])) },
      { id: "hb#1.rx", state: "running", peers: Object.fromEntries(names.filter((m) => m !== n).map((m) => [m, { is_beating: true }])) },
    ] }]));
    const layout = meshLayout(names, meshLinks(status));
    const byKey = Object.fromEntries(layout.groups.map((g) => [g.key, g]));
    // Neighbours on the ring, and one between: concentric, DIRECTION_OFFSET apart.
    for (const [x, y] of [["a", "b"], ["a", "c"]]) {
      const one = arcOf(byKey[`${x} ${y}`].path);
      const other = arcOf(byKey[`${y} ${x}`].path);
      expect(Math.hypot(one.c.x - other.c.x, one.c.y - other.c.y)).toBeLessThan(0.5);
      expect(Math.abs(one.r - other.r)).toBeCloseTo(DIRECTION_OFFSET, 0);
    }
    // Each half on the circle of its line.
    for (const g of layout.groups) {
      const whole = arcOf(g.path);
      for (const half of [g.tx.path, g.rx.path]) {
        const piece = arcOf(half);
        expect(Math.hypot(piece.c.x - whole.c.x, piece.c.y - whole.c.y)).toBeLessThan(0.5);
        expect(Math.abs(piece.r - whole.r)).toBeLessThan(0.2);
      }
    }
  });

  test("every pair an arc, neighbours on the ring too: bent at the least by a part of its length", () => {
    const names = ["a", "b", "c"];
    const status = Object.fromEntries(names.map((n) => [n, { streams: [{ id: "hb#1.tx", state: "running", peers: Object.fromEntries(names.filter((m) => m !== n).map((m) => [m, { is_beating: true }])) }] }]));
    const layout = meshLayout(names, meshLinks(status));
    for (const g of layout.groups) {
      const { start, end } = arcOf(g.path);
      const middle = at(g.path, 0.5);
      const chord = Math.hypot(end.x - start.x, end.y - start.y);
      const off = Math.abs((end.x - start.x) * (middle.y - start.y) - (end.y - start.y) * (middle.x - start.x)) / chord;
      expect(off).toBeGreaterThan(chord * MIN_BEND * 0.5);
    }
  });

  test("a line in two halves on it, a short gap between them: the tx of the sender, the rx of the receiver", () => {
    const check = (layout: ReturnType<typeof meshLayout>) => {
      for (const g of layout.groups) {
        const whole = arcOf(g.path);
        const tx = arcOf(g.tx.path);
        const rx = arcOf(g.rx.path);
        // From the sender's edge, to the receiver's edge, on the line.
        expect(tx.start).toEqual(whole.start);
        expect(rx.end).toEqual(whole.end);
        // The halves as long, the short gap between them.
        expect(Math.abs(lengthOf(g.tx.path) - lengthOf(g.rx.path))).toBeLessThan(1);
        expect(Math.hypot(rx.start.x - tx.end.x, rx.start.y - tx.end.y)).toBeCloseTo(SMALL_GAP, 0);
        // The band of its outline: the same arc, ending short of the head.
        expect(lengthOf(g.tx.outline)).toBeLessThan(lengthOf(g.tx.path));
        expect(arcOf(g.tx.outline).start).toEqual(tx.start);
      }
    };
    const two = meshLayout(["n1", "n2"], meshLinks(STATUS));
    check(two);
    const [forward] = two.groups;
    expect(forward.tx.links.map((l) => `${l.hb}.${l.dir}@${l.node}`)).toEqual(["hb#1.tx@n1"]);
    expect(forward.rx.links.map((l) => `${l.hb}.${l.dir}@${l.node}`)).toEqual(["hb#1.rx@n2", "hb#2.rx@n2"]);
    expect([forward.tx.state, forward.rx.state]).toEqual(["up", "warn"]);
    const names = ["a", "b", "c", "d", "e", "f"];
    const ring = Object.fromEntries(names.map((n) => [n, {
      streams: [
        { id: "hb#1.tx", state: "running", peers: Object.fromEntries(names.filter((m) => m !== n).map((m) => [m, { is_beating: true }])) },
        { id: "hb#1.rx", state: "running", peers: Object.fromEntries(names.filter((m) => m !== n).map((m) => [m, { is_beating: true }])) },
      ],
    }]));
    check(meshLayout(names, meshLinks(ring)));
  });

  test("a line green when all its links beat, orange for a mix, red when none does", () => {
    const [forward, backward] = meshLayout(["n1", "n2"], meshLinks(STATUS)).groups;
    // n1 to n2: hb#1 from both ends beating, hb#2 rx on n2 not; n2 to n1: the relay stopped.
    expect([forward.state, backward.state]).toEqual(["warn", "warn"]);
    const up = { state: "up" } as ReturnType<typeof meshLinks>[number];
    const down = { state: "down" } as ReturnType<typeof meshLinks>[number];
    expect(groupState([up, up])).toBe("up");
    expect(groupState([up, down])).toBe("warn");
    expect(groupState([down, down])).toBe("down");
  });

  test("a node is a box as wide as its name, a long name cut, its end an ellipsis", () => {
    expect(nodeWidth("n1")).toBeLessThan(nodeWidth("a-node-with-a-much-longer-name"));
    const long = "node.with.a.very.long.fully.qualified.domain.name.example.com";
    expect(nodeLabel(long)).toHaveLength(MAX_LABEL);
    expect(nodeLabel(long).endsWith("…")).toBe(true);
    expect(nodeLabel("dev2n1")).toBe("dev2n1");
    expect(nodeWidth(long)).toBe(nodeWidth(nodeLabel(long)));
  });

  test("a line runs from the edge of the box of its sender to the edge of the box of its receiver", () => {
    const left = "a-rather-long-node-name-1";
    const right = "b";
    const status = {
      [left]: { streams: [{ id: "hb#1.tx", state: "running", peers: { [right]: { is_beating: true } } }] },
      [right]: { streams: [] },
    };
    const layout = meshLayout([left, right], meshLinks(status));
    const { start: { y: y1 }, end: { y: y2 } } = arcOf(layout.groups[0].path);
    const l = layout.nodes[left];
    const r = layout.nodes[right];
    // One over the other: from the bottom of the box of the sender to the top of the receiver's.
    expect(y1).toBeCloseTo(l.y + l.height / 2, 0);
    expect(y2).toBeCloseTo(r.y - r.height / 2, 0);
  });

  test("boxes of long names on the circle do not overlap", () => {
    const names = ["a", "b", "c", "d", "e"].map((c) => `${c}-node.long.domain.example`);
    const layout = meshLayout(names, []);
    const boxes = Object.values(layout.nodes);
    for (const [i, p] of boxes.entries()) {
      for (const q of boxes.slice(i + 1)) {
        const apart = Math.abs(p.x - q.x) >= (p.width + q.width) / 2 || Math.abs(p.y - q.y) >= (p.height + q.height) / 2;
        expect(apart).toBe(true);
      }
      expect(p.x - p.width / 2).toBeGreaterThanOrEqual(0);
      expect(p.x + p.width / 2).toBeLessThanOrEqual(layout.width);
    }
  });

  test("more nodes stand on a circle", () => {
    const layout = meshLayout(["a", "b", "c"], []);
    const centre = { x: layout.width / 2, y: layout.height / 2 };
    const distances = Object.values(layout.nodes).map((p) => Math.hypot(p.x - centre.x, p.y - centre.y));
    distances.forEach((d) => expect(d).toBeCloseTo(distances[0]));
  });
});

describe("the relays in the centre", () => {
  test("a stream of type relay: its relay from its description; a pill each in the centre, the colour of its streams", () => {
    const status = {
      n1: { streams: [{ id: "hb#2.tx", type: "relay", state: "running", peers: { n2: { is_beating: true, desc: "→ c1@relay3.example.com:3333" } } }] },
      n2: { streams: [{ id: "hb#2.rx", type: "relay", state: "running", peers: { n1: { is_beating: false, desc: "← c1@relay3.example.com:3333" } } }] },
    };
    const layout = meshLayout(["n1", "n2"], meshLinks(status));
    expect(layout.relays.map((r) => [r.name, r.hbs, r.state])).toEqual([["relay3.example.com:3333", ["hb#2"], "warn"]]);
    expect(layout.relays[0].x).toBeCloseTo(layout.width / 2);
    expect(layout.relays[0].y).toBeCloseTo(layout.height / 2);
    // The lines kept off it: the middle of each curve outside its box.
    const r = layout.relays[0];
    for (const g of layout.groups) {
      const m = at(g.path, 0.5);
      expect(Math.abs(m.x - r.x) > r.width / 2 || Math.abs(m.y - r.y) > r.height / 2).toBe(true);
    }
  });

  test("drawn narrow, a phone: the circle tighter, the drawing shrunk less, the lines still off the relay", () => {
    const status = {
      n1: { streams: [{ id: "hb#2.tx", type: "relay", state: "running", peers: { n2: { is_beating: true, desc: "→ c1@relay3.example.com:3333" } } }] },
      n2: { streams: [{ id: "hb#2.rx", type: "relay", state: "running", peers: { n1: { is_beating: true, desc: "← c1@relay3.example.com:3333" } } }] },
    };
    const wide = meshLayout(["n1", "n2"], meshLinks(status));
    const narrow = meshLayout(["n1", "n2"], meshLinks(status), 340);
    expect(narrow.width).toBeLessThan(wide.width * 0.75);
    // As wide a room as the usual drawing, nothing changed.
    expect(meshLayout(["n1", "n2"], meshLinks(status), 1000).width).toBe(wide.width);
    const r = narrow.relays[0];
    for (const g of narrow.groups) {
      for (const t of [0.25, 0.5, 0.75]) {
        const m = at(g.path, t);
        expect(Math.abs(m.x - r.x) > r.width / 2 || Math.abs(m.y - r.y) > r.height / 2).toBe(true);
      }
    }
  });

  test("no relay heartbeat: none in the centre", () => {
    const status = { n1: { streams: [{ id: "hb#1.tx", type: "unicast", state: "running", peers: { n2: { is_beating: true, desc: "→ 10.0.0.2:10011" } } }] }, n2: { streams: [] } };
    expect(meshLayout(["n1", "n2"], meshLinks(status)).relays).toEqual([]);
  });
});
