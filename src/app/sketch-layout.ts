/*
 * The sketch of a resource of the cluster handed out on its nodes, a network or a
 * pool: what it is in a band over the nodes, a box for each node saying what it is on
 * it, and what it handed out, its items (the addresses of a network, the volumes of a
 * pool), under the boxes, by their object (`path`).
 *
 * An item is one whatever the nodes reporting it: those of an object reported by
 * several nodes are drawn once, a pill across the columns of all the nodes, solid over
 * those reporting them, dashed over the others, dashed all along for one reported by
 * none; the others under the box of the one node holding them.
 *
 * The layout is made here, without a browser: the width of a text is estimated.
 */

/** A fact of a box: a keyword, its value; `computed`, the daemon deciding it, none set. */
export interface SketchFact {
  key: string;
  value: string;
  computed?: boolean;
}

/** An item handed out: `key`, what it is; `path`, its object; `node`, the node reporting it, none for none. */
export interface SketchItem {
  key: string;
  path: string;
  node?: string;
}

export interface SketchInput {
  /** The title of the band. */
  title: string;
  bandFacts: SketchFact[];
  nodes: string[];
  nodeFacts: Record<string, SketchFact[]>;
  items: SketchItem[];
  /** Routes between the nodes, a line across their row; `tunnel`, a pipe of two. */
  route?: { tunnel: boolean } | null;
  /** What a chip of an object says at its right end, its count of items unless given. */
  details?: Record<string, string>;
  /** A finger as the pointer: the chips taller, further apart, each a tap of its own. */
  touch?: boolean;
}

export interface SketchNode {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  facts: SketchFact[];
  /** The items held on the node alone. */
  count: number;
  /** The items the node reports with others. */
  shared: number;
  /** The line from the band down to the box. */
  drop: { x: number; y1: number; y2: number };
}

export interface SketchObject {
  node: string;
  path: string;
  count: number;
  detail?: string;
  x: number;
  y: number;
  width: number;
}

/** A stretch of a shared pill over the column of a node: solid where the node reports the items. */
export interface SketchSegment {
  node: string;
  x1: number;
  x2: number;
  present: boolean;
}

/** An object of items reported by several nodes, or none, a pill across the columns; `nodes`, those reporting them. */
export interface SketchShared {
  path: string;
  count: number;
  detail?: string;
  nodes: string[];
  x: number;
  y: number;
  width: number;
  segments: SketchSegment[];
}

export interface SketchLayout {
  width: number;
  height: number;
  /** The height of a chip, of a pill: taller on a touch screen. */
  chip: number;
  band: {
    x: number;
    y: number;
    width: number;
    height: number;
    facts: SketchFact[];
  };
  nodes: SketchNode[];
  /**
   * The routes between the nodes: a line across the row of the boxes, under them, past
   * the first and the last, its label after the last; a pipe of two lines, `tunnel`.
   */
  route: { x1: number; x2: number; y: number; tunnel: boolean; labelX: number } | null;
  objects: SketchObject[];
  /** The objects left out under a node, too many to show. */
  more: { node: string; count: number; x: number; y: number }[];
  /**
   * The items reported by several nodes (`count`) or by none (`unplaced`): their
   * objects as pills, those left out.
   */
  shared: { count: number; unplaced: number; rows: SketchShared[]; more: { count: number; x: number; y: number } | null } | null;
}

/** The width of a character, estimated: of a label, of a value in the monospaced font, of a bold title. */
export const CHAR_WIDTH = 6.6;
export const MONO_WIDTH = 8;
const BOLD_WIDTH = 7.6;
export const LINE = 16;
export const PADDING = 12;
export const CHIP_HEIGHT = 22;
const CHIP_GAP = 6;
/**
 * On a touch screen: the sketch shrunk to a phone, about a sixth, a chip still a
 * finger's height, the next a gap apart.
 */
export const TOUCH_CHIP_HEIGHT = 40;
const TOUCH_CHIP_GAP = 10;
const MARGIN = 8;
const GAP = 32;
const DROP = 36;
const MIN_NODE_WIDTH = 180;
/** How far the route runs past the first and the last box; its label after it. */
const ROUTE_STUB = 20;
const ROUTE_LABEL_GAP = 6;
/** The objects shown under a node; the others counted. */
export const MAX_OBJECTS = 5;
/** The objects of shared items shown as pills; the others counted. */
export const MAX_SHARED = 12;

const factWidth = (f: SketchFact, computedText: number) =>
  (f.key.length + 1) * CHAR_WIDTH + (f.computed ? computedText : f.value.length * MONO_WIDTH);

/** The width of a chip's text: its object, then its detail or its count. */
const chipText = (path: string, right: string) => Math.round((path.length + right.length + 4) * CHAR_WIDTH + 2 * PADDING);

/**
 * The layout of a sketch. `computedText`, the width of the words saying a value is
 * the daemon's, `routeText`, of the label of the routes, both translated by the page.
 */
export function layoutSketch(input: SketchInput, computedText = 120, routeText = 90): SketchLayout {
  const { nodes, items, nodeFacts: facts } = input;
  const detailOf = (path: string) => input.details?.[path];
  const chip = input.touch === true ? TOUCH_CHIP_HEIGHT : CHIP_HEIGHT;
  const chipGap = input.touch === true ? TOUCH_CHIP_GAP : CHIP_GAP;

  // An item by what it is, and the nodes reporting it; one of a node no more of the cluster left out.
  const reported = new Map<string, { path: string; nodes: Set<string> }>();
  for (const item of items) {
    if (item.node !== undefined && !nodes.includes(item.node)) continue;
    const one = reported.get(item.key) ?? { path: item.path, nodes: new Set<string>() };
    if (item.node !== undefined) one.nodes.add(item.node);
    reported.set(item.key, one);
  }
  // Held on one node, under its box; on several, or none, a pill, once.
  const byNode: Record<string, Map<string, number>> = {};
  const sharedByPath = new Map<string, { count: number; nodes: Set<string> }>();
  const sharedOn: Record<string, number> = {};
  let sharedCount = 0;
  let unplaced = 0;
  for (const { path, nodes: on } of reported.values()) {
    if (on.size === 1) {
      const [node] = on;
      const paths = (byNode[node] ??= new Map());
      paths.set(path, (paths.get(path) ?? 0) + 1);
      continue;
    }
    if (on.size === 0) unplaced += 1;
    else sharedCount += 1;
    const one = sharedByPath.get(path) ?? { count: 0, nodes: new Set<string>() };
    one.count += 1;
    on.forEach((n) => {
      one.nodes.add(n);
      sharedOn[n] = (sharedOn[n] ?? 0) + 1;
    });
    sharedByPath.set(path, one);
  }
  const busiest = (a: { path: string; count: number }, b: { path: string; count: number }) =>
    b.count - a.count || a.path.localeCompare(b.path);
  const objectsOf = (node: string) =>
    [...(byNode[node]?.entries() ?? [])].map(([path, count]) => ({ path, count, detail: detailOf(path) })).sort(busiest);
  // The pills of the shared first, those of none after them.
  const shared = [...sharedByPath.entries()]
    .map(([path, one]) => ({ path, count: one.count, detail: detailOf(path), nodes: nodes.filter((n) => one.nodes.has(n)) }))
    .sort((a, b) => Number(b.nodes.length > 0) - Number(a.nodes.length > 0) || busiest(a, b));

  const widthOf = (node: string) =>
    Math.max(
      MIN_NODE_WIDTH,
      Math.round(node.length * BOLD_WIDTH + 2 * PADDING),
      ...(facts[node] ?? []).map((f) => Math.round(factWidth(f, computedText) + 2 * PADDING)),
      ...objectsOf(node).slice(0, MAX_OBJECTS).map((o) => chipText(o.path, o.detail ?? String(o.count))),
    );
  const widths = nodes.map(widthOf);
  const rowWidth = widths.reduce((sum, w) => sum + w, 0) + GAP * Math.max(0, nodes.length - 1);

  const band = input.bandFacts;
  const title = input.title.length * BOLD_WIDTH;
  const bandText = Math.max(title, ...band.map((f) => factWidth(f, computedText))) + 2 * PADDING;
  // A pill as long as its label at least: the row of the nodes widened for the longest.
  const shownShared = shared.slice(0, MAX_SHARED);
  const pillText = Math.max(0, ...shownShared.map((o) => chipText(o.path, o.detail ?? String(o.count)) + 2 * CHAR_WIDTH));
  const extra = Math.max(0, pillText - rowWidth);
  const fullRow = rowWidth + extra;
  // Routes between nodes: the line past the boxes, its label after them.
  const routed = Boolean(input.route) && nodes.length > 1;
  const routeLeft = routed ? ROUTE_STUB : 0;
  const routeRight = routed ? ROUTE_STUB + ROUTE_LABEL_GAP + routeText : 0;
  const width = Math.round(Math.max(fullRow + routeLeft + routeRight, bandText, MIN_NODE_WIDTH) + 2 * MARGIN);
  const bandHeight = PADDING * 2 + LINE * (band.length + 1);
  const bandBox = { x: MARGIN, y: MARGIN, width: width - 2 * MARGIN, height: bandHeight, facts: band };

  // The boxes as high as the fullest: the name, its facts, its count of items, its count of shared ones.
  const lines = Math.max(0, ...nodes.map((n) => (facts[n] ?? []).length)) + (sharedCount > 0 ? 1 : 0);
  const boxHeight = PADDING * 2 + LINE * (lines + 2);
  const top = bandBox.y + bandHeight + DROP;
  // The boxes widened evenly when a pill asks for more room than they take.
  const grow = nodes.length > 0 ? extra / nodes.length : 0;
  let x = MARGIN + routeLeft + (width - 2 * MARGIN - fullRow - routeLeft - routeRight) / 2;
  const sketchNodes: SketchNode[] = [];
  nodes.forEach((node, i) => {
    const w = widths[i] + grow;
    const own = objectsOf(node);
    sketchNodes.push({
      name: node,
      x,
      y: top,
      width: w,
      height: boxHeight,
      facts: facts[node] ?? [],
      count: own.reduce((sum, o) => sum + o.count, 0),
      shared: sharedOn[node] ?? 0,
      drop: { x: x + w / 2, y1: bandBox.y + bandHeight, y2: top },
    });
    x += w + GAP;
  });

  // Under the boxes, the shared items first, a pill an object across all the columns,
  // its stretch over a column changing halfway into the gap to the next.
  let y = top + boxHeight + chipGap * 2;
  let sharedBlock: SketchLayout["shared"] = null;
  if (shared.length > 0 && sketchNodes.length > 0) {
    const first = sketchNodes[0];
    const last = sketchNodes[sketchNodes.length - 1];
    const bounds = sketchNodes.map((n, i) => [
      i === 0 ? n.x : (sketchNodes[i - 1].x + sketchNodes[i - 1].width + n.x) / 2,
      i === sketchNodes.length - 1 ? n.x + n.width : (n.x + n.width + sketchNodes[i + 1].x) / 2,
    ]);
    const rows = shownShared.map((o) => {
      const row = {
        ...o,
        x: first.x,
        y,
        width: last.x + last.width - first.x,
        segments: sketchNodes.map((n, i) => ({ node: n.name, x1: bounds[i][0], x2: bounds[i][1], present: o.nodes.includes(n.name) })),
      };
      y += chip + chipGap;
      return row;
    });
    const left = shared.length - shownShared.length;
    sharedBlock = {
      count: sharedCount,
      unplaced,
      rows,
      more: left > 0 ? { count: left, x: first.x + (last.x + last.width - first.x) / 2, y: y + LINE / 2 } : null,
    };
    // The objects held on one node after the pills, as far from the last as two pills are apart.
    if (left > 0) y += LINE;
  }

  // Then the objects each node holds alone, under its box.
  const objects: SketchObject[] = [];
  const more: SketchLayout["more"] = [];
  let bottom = Math.max(y, top + (nodes.length > 0 ? boxHeight : 0));
  for (const n of sketchNodes) {
    let yy = y;
    const own = objectsOf(n.name);
    for (const o of own.slice(0, MAX_OBJECTS)) {
      objects.push({ node: n.name, path: o.path, count: o.count, ...(o.detail !== undefined ? { detail: o.detail } : {}), x: n.x, y: yy, width: n.width });
      yy += chip + chipGap;
    }
    if (own.length > MAX_OBJECTS) {
      more.push({ node: n.name, count: own.length - MAX_OBJECTS, x: n.x + n.width / 2, y: yy + LINE / 2 });
      yy += LINE;
    }
    bottom = Math.max(bottom, yy);
  }

  let route: SketchLayout["route"] = null;
  if (routed) {
    const first = sketchNodes[0];
    const last = sketchNodes[sketchNodes.length - 1];
    const x2 = last.x + last.width + ROUTE_STUB;
    route = { x1: first.x - ROUTE_STUB, x2, y: top + boxHeight / 2, tunnel: Boolean(input.route?.tunnel), labelX: x2 + ROUTE_LABEL_GAP };
  }

  return { width, height: Math.round(bottom + MARGIN), chip, band: bandBox, nodes: sketchNodes, route, objects, more, shared: sharedBlock };
}
