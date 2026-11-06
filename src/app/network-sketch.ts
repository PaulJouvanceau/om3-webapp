/*
 * The sketch of a network (`sketch-layout.ts`): its range in a band over the nodes of
 * the cluster, a box for each node saying what the network is on it, the objects
 * holding addresses of it under the boxes. What each type puts on a node, from its
 * section of the cluster configuration:
 *
 * - routed_bridge: a subnet of the range a node, on a bridge, routed between the
 *   nodes, through tunnels from an endpoint of each node;
 * - bridge: the same range on every node, on a bridge, masqueraded out of the node;
 * - lan: a segment the nodes share, joined through an interface of each node.
 *
 * An address is one whatever the nodes reporting it: an address of a lan an object's
 * instances share is drawn once, a pill across the nodes.
 */
import { type SketchFact, type SketchLayout, layoutSketch } from "./sketch-layout";

export {
  CHAR_WIDTH,
  CHIP_HEIGHT,
  LINE,
  MAX_OBJECTS,
  MAX_SHARED,
  MONO_WIDTH,
  PADDING,
  type SketchFact,
  type SketchLayout,
  type SketchNode,
  type SketchObject,
  type SketchSegment,
  type SketchShared,
} from "./sketch-layout";

/** The keys of the section, `key` or `key@node`, and their values. */
export type SectionValues = Record<string, string>;

export interface SketchAddress {
  ip?: string;
  node?: string;
  path?: string;
  rid?: string;
}

export interface SketchInput {
  name: string;
  type: string;
  network: string;
  values: SectionValues;
  nodes: string[];
  addresses: SketchAddress[];
  /** A finger as the pointer: the chips of the addresses taller, further apart. */
  touch?: boolean;
}

/** The value of a key on a node: scoped to it, or set for all. */
const scoped = (values: SectionValues, key: string, node: string): string | undefined =>
  values[`${key}@${node}`] ?? values[key];

/** What the network is over all the nodes, its band. */
export function bandFacts({ type, network, values }: Pick<SketchInput, "type" | "network" | "values">): SketchFact[] {
  const facts: SketchFact[] = [{ key: "network", value: network }];
  const add = (key: string) => {
    if (values[key]) facts.push({ key, value: values[key] });
  };
  if (type === "routed_bridge") ["tunnel", "tunnel_mode", "ips_per_node", "mask_per_node"].forEach(add);
  if (type === "lan") ["ranges", "gateway", "modes"].forEach(add);
  if (type === "bridge") add("public");
  add("dns");
  return facts;
}

/** What the network is on a node, its box. */
export function nodeFacts({ name, type, values }: Pick<SketchInput, "name" | "type" | "values">, node: string): SketchFact[] {
  const facts: SketchFact[] = [];
  const set = (key: string, value: string | undefined) => {
    if (value) facts.push({ key, value });
  };
  // The bridge of a node, `obr_<network>` unless named.
  const bridge = values.dev || `obr_${name}`;
  if (type === "routed_bridge") {
    const subnet = scoped(values, "subnet", node);
    facts.push(subnet ? { key: "subnet", value: subnet } : { key: "subnet", value: "", computed: true });
    set("dev", bridge);
    set("addr", scoped(values, "addr", node));
    set("gateway", values[`gateway@${node}`]);
  } else if (type === "bridge") {
    set("network", values[`network@${node}`]);
    set("dev", bridge);
  } else if (type === "lan") {
    set("dev", scoped(values, "dev", node));
    set("gateway", values[`gateway@${node}`]);
    set("vlan_tag", scoped(values, "vlan_tag", node));
  }
  return facts;
}

/**
 * The layout of the sketch of a network: an address by its object, resource and ip;
 * a routed bridge routed between its nodes, through tunnels unless `tunnel` is never.
 * `computedText`, the width of the words saying a value is the daemon's, `routeText`,
 * of the label of the routes, both translated by the page.
 */
export function sketchLayout(input: SketchInput, computedText = 120, routeText = 90): SketchLayout {
  return layoutSketch(
    {
      title: `${input.name} · ${input.type}`,
      bandFacts: bandFacts(input),
      nodes: input.nodes,
      nodeFacts: Object.fromEntries(input.nodes.map((node) => [node, nodeFacts(input, node)])),
      items: input.addresses
        .filter((a) => a.node)
        .map((a) => ({ key: `${a.path ?? ""} ${a.rid ?? ""} ${a.ip ?? ""}`, path: a.path ?? "", node: a.node })),
      route: input.type === "routed_bridge" ? { tunnel: input.values.tunnel !== "never" } : null,
      touch: input.touch,
    },
    computedText,
    routeText,
  );
}
