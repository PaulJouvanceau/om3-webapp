/*
 * The heartbeat mesh of a cluster: its nodes, and a link for each stream of each
 * node toward each of its peers, as the daemons report them (DaemonHeartbeatUpdated).
 *
 * A tx stream of a node sends to its peer, an rx stream receives from it: the link
 * runs from the sender to the receiver. Each end reports its own stream, so the
 * hb#1 of two nodes is four links, two each way: n1 tx and n2 rx, n2 tx and n1 rx.
 */

export interface HeartbeatPeer {
  desc?: string;
  is_beating?: boolean;
  changed_at?: string;
  last_beating_at?: string;
}

export interface HeartbeatStream {
  id: string;
  type?: string;
  state?: string;
  peers?: Record<string, HeartbeatPeer>;
}

export interface MeshLink {
  /** Unique in the mesh: the stream of a node toward a peer. */
  key: string;
  /** The node reporting the stream, and the peer it is toward. */
  node: string;
  peer: string;
  /** The heartbeat, "hb#1", and the side of the stream on its node. */
  hb: string;
  dir: "rx" | "tx" | "";
  type: string;
  /** The sender and the receiver. */
  from: string;
  to: string;
  /** Up when the stream runs and the peer beats, down otherwise. */
  state: "up" | "down";
  streamState?: string;
  desc?: string;
  lastBeatingAt?: string;
}

/** The heartbeat of a stream and its side: "hb#1.tx" is hb#1, tx. */
function streamSide(id: string): { hb: string; dir: MeshLink["dir"] } {
  const match = /^(.*)\.(rx|tx)$/.exec(id ?? "");
  return match ? { hb: match[1], dir: match[2] as MeshLink["dir"] } : { hb: id, dir: "" };
}

/**
 * The peers of a stream reporting none, as a stopped one does: those of the other
 * streams of its heartbeat on its node, its other side, or else every other node.
 * It is down toward each, and it is the stream a line turning orange or red calls
 * for, so its card lists it.
 */
function impliedPeers(
  heartbeatStatus: Record<string, { streams?: HeartbeatStream[] } | undefined>,
  node: string,
  hb: string,
): string[] {
  const known = new Set<string>();
  for (const other of heartbeatStatus[node]?.streams ?? []) {
    if (streamSide(other.id).hb !== hb) continue;
    for (const peer of Object.keys(other.peers ?? {})) if (peer) known.add(peer);
  }
  if (known.size > 0) return [...known].sort();
  return Object.keys(heartbeatStatus).filter((n) => n !== node).sort();
}

/** The links of the mesh, in the order of the nodes, then of their streams. */
export function meshLinks(heartbeatStatus: Record<string, { streams?: HeartbeatStream[] } | undefined>): MeshLink[] {
  const links: MeshLink[] = [];
  for (const node of Object.keys(heartbeatStatus ?? {}).sort()) {
    for (const stream of heartbeatStatus[node]?.streams ?? []) {
      const { hb, dir } = streamSide(stream.id);
      const peers: [string, HeartbeatPeer | undefined][] = Object.keys(stream.peers ?? {}).length > 0
        ? Object.entries(stream.peers ?? {})
        : impliedPeers(heartbeatStatus, node, hb).map((peer) => [peer, undefined]);
      for (const [peer, status] of peers) {
        if (!peer) continue;
        const sends = dir !== "rx";
        links.push({
          key: `${node} ${stream.id} ${peer}`,
          node,
          peer,
          hb,
          dir,
          type: stream.type ?? "",
          from: sends ? node : peer,
          to: sends ? peer : node,
          state: stream.state === "running" && status?.is_beating === true ? "up" : "down",
          streamState: stream.state,
          desc: status?.desc,
          lastBeatingAt: status?.last_beating_at,
        });
      }
    }
  }
  return links;
}

/** The nodes of the mesh: those reporting heartbeats and their peers, sorted. */
export function meshNodes(heartbeatStatus: Record<string, unknown>, links: MeshLink[]): string[] {
  return [...new Set([...Object.keys(heartbeatStatus ?? {}), ...links.map((l) => l.peer)])].sort();
}

/** A group of links all beating, some, or none. */
export type GroupState = "up" | "warn" | "down";

/** The state of a group of links: up when all beat, down when none does, warn for a mix. */
export function groupState(links: MeshLink[]): GroupState {
  const up = links.filter((l) => l.state === "up").length;
  return up === links.length ? "up" : up === 0 ? "down" : "warn";
}

export interface Point {
  x: number;
  y: number;
}

/**
 * A half of the line of a direction: the side of one end, its links only. Tinted
 * by them, "none" when that end reports none.
 */
export interface MeshHalf {
  path: string;
  /** The same arc ending short of the head of its arrow: the band of its outline. */
  outline: string;
  links: MeshLink[];
  state: GroupState | "none";
}

/**
 * A direction between two nodes: the links from one to the other, drawn as one
 * straight line cut in two halves, a gap between them: from the sender, its tx
 * streams, their arrow toward the receiver; into the receiver, its rx streams. Its
 * card lists each link.
 */
export interface MeshGroup {
  key: string;
  from: string;
  to: string;
  links: MeshLink[];
  state: GroupState;
  /** The line, from the edge of the sender to the edge of the receiver, gap included. */
  path: string;
  /** The half of the sender, its tx; the half of the receiver, its rx. */
  tx: MeshHalf;
  rx: MeshHalf;
  /** The middle of the line, where its card shows. */
  label: Point;
}

/** A node of the mesh: where it stands, its box, and the name it shows. */
export interface MeshNode extends Point {
  width: number;
  height: number;
  /** The name, cut short past MAX_LABEL characters. */
  label: string;
}

/** A relay the heartbeats of the cluster go through, in the centre of the mesh. */
export interface MeshRelay extends MeshNode {
  name: string;
  /** The heartbeats through it. */
  hbs: string[];
  state: GroupState;
}

export interface MeshLayout {
  width: number;
  height: number;
  nodes: Record<string, MeshNode>;
  groups: MeshGroup[];
  relays: MeshRelay[];
}

/** The height of a node box, a pill holding its name on one line. */
export const NODE_HEIGHT = 32;
/** The width of a character of a name, an estimate the layout can make without a browser. */
const CHAR_WIDTH = 7.5;
/** The room on each side of the name in its box. */
const NODE_PADDING = 14;
/** The narrowest box, a short name still a pill. */
const MIN_NODE_WIDTH = 64;
/** The longest name shown whole; a longer one is cut, its end an ellipsis. */
export const MAX_LABEL = 28;
/** The room between the two parallel lines of a pair of nodes, one each way. */
export const DIRECTION_OFFSET = 12;
/** The gap between the two halves of a line, along it: the lines kept off the centre, a short one. */
export const SMALL_GAP = 14;
/** How far a line bends at the least, a part of the length of its pair: every pair an arc. */
export const MIN_BEND = 0.1;
/** How far back from the end of a line the head of an outline starts: the band stops there. */
export const OUTLINE_HEAD_BASE = 15;

/**
 * The centre of the mesh kept clear, the lines curved around it: as wide as this part
 * of the radius of the ring of the nodes, wider for the relays shown in it, never wider
 * than CENTRE_MAX of the radius.
 */
export const CENTRE_CLEAR = 0.35;
const CENTRE_MAX = 0.6;
/** The room kept between the boxes of the relays, one over the other, and around them. */
const RELAY_GAP = 8;

const round = (n: number) => Math.round(n * 10) / 10;

/** The relay a stream of type relay goes through, as its description says it: "→ user@host:port". */
export function relayOf(link: MeshLink): string | undefined {
  if (link.type !== "relay" || !link.desc) return undefined;
  const at = link.desc.lastIndexOf("@");
  return at >= 0 ? link.desc.slice(at + 1).trim() || undefined : undefined;
}

/** The relays of the links, by name: the heartbeats through each, its state as its links make it. */
export function meshRelays(links: MeshLink[]): { name: string; hbs: string[]; state: GroupState }[] {
  const by = new Map<string, MeshLink[]>();
  for (const link of links) {
    const relay = relayOf(link);
    if (relay) by.set(relay, [...(by.get(relay) ?? []), link]);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, of]) => ({ name, hbs: [...new Set(of.map((l) => l.hb))].sort(), state: groupState(of) }));
}

/** An arc of a circle: its centre, its radius, from the angle `from` sweeping `sweep` radians (y down). */
interface Arc {
  centre: Point;
  radius: number;
  from: number;
  sweep: number;
}

/** A point of an arc at t, its start at 0, its end at 1. */
const arcPoint = (arc: Arc, t: number): Point => {
  const angle = arc.from + arc.sweep * t;
  return { x: arc.centre.x + arc.radius * Math.cos(angle), y: arc.centre.y + arc.radius * Math.sin(angle) };
};

/** The piece of an arc from t0 to t1, as a path ("M x y A r r 0 large sweep x y"). */
function arcPath(arc: Arc, t0: number, t1: number): string {
  const p = arcPoint(arc, t0);
  const q = arcPoint(arc, t1);
  const turn = arc.sweep * (t1 - t0);
  const r = round(arc.radius);
  return `M ${round(p.x)} ${round(p.y)} A ${r} ${r} 0 ${Math.abs(turn) > Math.PI ? 1 : 0} ${turn > 0 ? 1 : 0} ${round(q.x)} ${round(q.y)}`;
}

/** An angle brought within (-π, π]. */
const wrap = (angle: number) => {
  let a = angle % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  return a;
};

/** Whether a point is within the box of a node. */
const inBox = (box: MeshNode, p: Point) => Math.abs(p.x - box.x) <= box.width / 2 && Math.abs(p.y - box.y) <= box.height / 2;

/**
 * Where an arc leaves a box from its start (`from` 0), or enters one at its end (from
 * 1): the t of the first point out of the box, found on the way then refined.
 */
function boxExit(arc: Arc, box: MeshNode, start: boolean): number {
  const at = (k: number) => (start ? k : 1 - k);
  let inside = 0;
  let outside = 1;
  for (let k = 0; k <= 200; k += 1) {
    if (!inBox(box, arcPoint(arc, at(k / 200)))) {
      outside = k / 200;
      inside = Math.max(0, (k - 1) / 200);
      break;
    }
  }
  for (let n = 0; n < 24; n += 1) {
    const mid = (inside + outside) / 2;
    if (inBox(box, arcPoint(arc, at(mid)))) inside = mid;
    else outside = mid;
  }
  return at(outside);
}

/** The radius of the circle of the nodes at the least: the usual one. */
const RADIUS = 200;
/** The least on a phone: the lines still curved between two nodes, the relays clear. */
const MIN_RADIUS = 90;

/**
 * The radius the circle of the nodes needs at the least, for the square to fit `room`
 * unshrunk; RADIUS when it is not known, or as wide. Never under the room the relays
 * take, one over the other, between two nodes facing each other.
 */
function fittedRadius(room: number | undefined, side: number, links: MeshLink[]): number {
  if (room === undefined) return RADIUS;
  const relays = meshRelays(links).length;
  const stack = relays * NODE_HEIGHT + Math.max(0, relays - 1) * RELAY_GAP;
  return Math.min(RADIUS, Math.max(MIN_RADIUS, room / 2 - side, stack / 2 + NODE_HEIGHT + RELAY_GAP * 2));
}

/** The name a node box shows: whole, or cut to MAX_LABEL characters, the last an ellipsis. */
export function nodeLabel(name: string): string {
  return name.length > MAX_LABEL ? `${name.slice(0, MAX_LABEL - 1)}…` : name;
}

/** The width of the box of a node, its name and its padding. */
export function nodeWidth(name: string): number {
  return Math.max(MIN_NODE_WIDTH, Math.round(nodeLabel(name).length * CHAR_WIDTH + 2 * NODE_PADDING));
}

/**
 * Where the nodes and the lines go, in a square. The nodes stand on a circle wide
 * enough for their boxes, two of them one over the other; the relays the heartbeats go
 * through in its centre. Between two nodes, a line each way, side by side on one arc of
 * a circle through the two, bulging away from the centre as far as the room kept clear
 * there asks, and a little at the least: the two directions the same arc a little
 * wider and a little narrower, so they never overlap; across the centre, the two
 * bulging apart around it. Each line holds all the links of its direction, and runs
 * from the edge of the box of the sender to the edge of the box of the receiver, in
 * two halves a short gap apart.
 *
 * `room`, the width the square is drawn in, in pixels: narrower than the drawing, a
 * phone, the circle of the nodes as small as their boxes and the relays allow rather
 * than of its usual size, for the drawing to be shrunk the least, its names still read.
 */
export function meshLayout(nodes: string[], links: MeshLink[], room?: number): MeshLayout {
  let width: number;
  let height: number;
  const boxes: Record<string, MeshNode> = {};
  const widths: Record<string, number> = Object.fromEntries(nodes.map((name) => [name, nodeWidth(name)]));
  const widest = Math.max(MIN_NODE_WIDTH, ...Object.values(widths));
  const place = (name: string, x: number, y: number) => {
    boxes[name] = { x, y, width: widths[name], height: NODE_HEIGHT, label: nodeLabel(name) };
  };
  // A square, whatever the nodes: the mesh as high as wide beside the summary, which
  // takes the rest of the width.
  if (nodes.length <= 1) {
    // A node alone at the size of the nodes of a ring: the room of two of them.
    width = Math.max(480, widest + 80);
    height = width;
    if (nodes.length === 1) place(nodes[0], width / 2, height / 2);
  } else {
    // The circle long enough for the boxes side by side, and room for the lines; two
    // nodes on it face each other, one over the other.
    const side = Math.max(widest / 2 + 40, NODE_HEIGHT / 2 + 60);
    const radius = Math.max(fittedRadius(room, side, links), nodes.length * 50, (nodes.length * (widest + 60)) / (2 * Math.PI));
    width = 2 * (radius + side);
    height = width;
    nodes.forEach((name, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / nodes.length;
      place(name, width / 2 + radius * Math.cos(angle), height / 2 + radius * Math.sin(angle));
    });
  }

  // The relays in the centre, one over the other; the centre kept clear for them, and
  // for the look of it when there is none.
  const centre = { x: width / 2, y: height / 2 };
  const ringRadius = nodes.length > 1 ? Math.hypot(boxes[nodes[0]].x - centre.x, boxes[nodes[0]].y - centre.y) : 0;
  const found = meshRelays(links);
  const relayBoxes = found.map((r) => ({ ...r, width: nodeWidth(r.name), height: NODE_HEIGHT, label: nodeLabel(r.name) }));
  const stack = relayBoxes.length * NODE_HEIGHT + Math.max(0, relayBoxes.length - 1) * RELAY_GAP;
  const relays: MeshRelay[] = relayBoxes.map((r, i) => ({
    ...r,
    x: centre.x,
    y: centre.y - stack / 2 + NODE_HEIGHT / 2 + i * (NODE_HEIGHT + RELAY_GAP),
  }));
  // The room the relays take from the centre along a way: the half of their stack that
  // way, a line bent sideways passing their width, one bent up or down their height.
  const relayHalf = relays.length === 0 ? { x: 0, y: 0 } : {
    x: Math.max(...relays.map((r) => r.width)) / 2 + RELAY_GAP * 2,
    y: stack / 2 + RELAY_GAP * 2,
  };
  // Never across the relays, the circle small on a phone.
  const clearAlong = (way: Point) => {
    const relaysAlong = Math.abs(way.x) * relayHalf.x + Math.abs(way.y) * relayHalf.y;
    return Math.max(
      Math.min(ringRadius * CENTRE_MAX, Math.max(ringRadius * CENTRE_CLEAR, relaysAlong)),
      room === undefined ? 0 : relaysAlong,
    );
  };

  const byDirection = new Map<string, MeshLink[]>();
  for (const link of links) {
    const key = `${link.from} ${link.to}`;
    byDirection.set(key, [...(byDirection.get(key) ?? []), link]);
  }

  const groups: MeshGroup[] = [];
  for (const [key, members] of [...byDirection].sort(([k], [l]) => k.localeCompare(l))) {
    const [from, to] = key.split(" ");
    const pf = boxes[from];
    const pt = boxes[to];
    if (!pf || !pt) continue;
    // The normal of the pair from its first node in name order: the direction
    // from that node runs on one side, the other way on the other.
    const [a, b] = [from, to].sort();
    const pa = boxes[a];
    const pb = boxes[b];
    const length = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
    const normal = { x: -(pb.y - pa.y) / length, y: (pb.x - pa.x) / length };
    // Half the room between the two lines of the pair, one each side of its arc.
    const offset = from === a ? -DIRECTION_OFFSET / 2 : DIRECTION_OFFSET / 2;
    // An arc of a circle through the two nodes, bulging away from the centre: the more as
    // the pair passes near it, its apex as far from it as the room kept clear, and at the
    // least by MIN_BEND of its length. The two directions on it side by side, the same
    // arc a little wider and a little narrower; a pair across the centre, its two
    // directions bulging apart, a lens around it.
    const middle = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    const away = { x: middle.x - centre.x, y: middle.y - centre.y };
    const distance = Math.hypot(away.x, away.y);
    const across = distance <= 1;
    const side = across ? Math.sign(offset) : Math.sign(normal.x * away.x + normal.y * away.y) || 1;
    const bulge = { x: normal.x * side, y: normal.y * side };
    const sagitta = Math.max(length * MIN_BEND, clearAlong(bulge) - (across ? 0 : distance));
    const radius = (length * length / 4 + sagitta * sagitta) / (2 * sagitta);
    const circle = { x: middle.x + bulge.x * (sagitta - radius), y: middle.y + bulge.y * (sagitta - radius) };
    const apex = { x: middle.x + bulge.x * sagitta, y: middle.y + bulge.y * sagitta };
    // From the sender to the receiver, the way through the apex.
    const angleOf = (p: Point) => Math.atan2(p.y - circle.y, p.x - circle.x);
    const fromAngle = angleOf(pf);
    let sweep = wrap(angleOf(pt) - fromAngle);
    const toApex = wrap(angleOf(apex) - fromAngle);
    if (!(toApex * sweep > 0 && Math.abs(toApex) < Math.abs(sweep))) sweep -= 2 * Math.PI * Math.sign(sweep);
    const arc: Arc = { centre: circle, radius: radius + (across ? 0 : offset), from: fromAngle, sweep };
    // From where it leaves the box of the sender to where it enters the box of the receiver.
    const t0 = boxExit(arc, pf, true);
    const t1 = boxExit(arc, pt, false);
    const perT = Math.abs(sweep) * arc.radius;
    const visible = (t1 - t0) * perT;
    // The two halves, a short gap between them in the middle of the line.
    const tm = (t0 + t1) / 2;
    const gap = Math.min(visible / 2, SMALL_GAP) / perT / 2;
    const head = OUTLINE_HEAD_BASE / perT;
    const label = arcPoint(arc, tm);
    // By heartbeat, the sender's tx before the receiver's rx.
    const sorted = [...members].sort((l, m) => l.hb.localeCompare(m.hb) || (l.dir === "tx" ? -1 : 0) - (m.dir === "tx" ? -1 : 0));
    const half = (of: MeshLink[], ta: number, tb: number): MeshHalf => ({
      path: arcPath(arc, ta, tb),
      outline: arcPath(arc, ta, Math.max(ta, tb - head)),
      links: of,
      state: of.length > 0 ? groupState(of) : "none",
    });
    groups.push({
      key,
      from,
      to,
      links: sorted,
      state: groupState(members),
      path: arcPath(arc, t0, t1),
      // A stream of no side sends, as meshLinks reads it.
      tx: half(sorted.filter((l) => l.dir !== "rx"), t0, tm - gap),
      rx: half(sorted.filter((l) => l.dir === "rx"), tm + gap, t1),
      label: { x: round(label.x), y: round(label.y) },
    });
  }
  return { width, height, nodes: boxes, groups, relays };
}
