import React, {useMemo} from "react";
import {useTranslation} from "react-i18next";
import {usePeek} from "../app/panel-search";
import {sectionValues} from "../app/heartbeat-config";
import {CHAR_WIDTH, sketchLayout} from "../app/network-sketch";
import {TOUCH_QUERY, useMediaQuery} from "../ui/lib/media";
import {Sketch} from "./Sketch";

/**
 * The sketch of a network (`network-sketch.ts`): its range in a band over the nodes,
 * what it is on each node in a box under it, routed between them for a routed bridge,
 * and the objects holding its addresses under the boxes, each opening its panel.
 * `network`, as the network list gives it; `section`, its section of the cluster
 * configuration; `addresses`, those it handed out.
 */
export function NetworkSketch({network, section, nodes, addresses}) {
    const {t} = useTranslation();
    const peek = usePeek();
    const touch = useMediaQuery(TOUCH_QUERY);
    const computed = t("networks.sketch.computed");
    // The routes of a routed bridge: through a mesh of tunnels, unless never, its policy and mode said when set.
    const values = useMemo(() => sectionValues(section ?? null), [section]);
    const routeLabel = values.tunnel === "never"
        ? t("networks.sketch.routedLabel")
        : [t("networks.sketch.tunnelMesh"), values.tunnel, values.tunnel_mode].filter(Boolean).join(" · ");
    const layout = useMemo(() => sketchLayout({
        name: network.name,
        type: network.type,
        network: network.network,
        values,
        nodes,
        addresses,
        touch,
    }, computed.length * CHAR_WIDTH, routeLabel.length * CHAR_WIDTH), [network, values, nodes, addresses, touch, computed, routeLabel]);

    return (
        <Sketch
            layout={layout}
            title={`${network.name} · ${network.type}`}
            caption={t("networks.sketch.label", {name: network.name, count: nodes.length})}
            computed={computed}
            route={{label: routeLabel}}
            texts={{
                count: (count) => t("networks.sketch.addresses", {count}),
                shared: (count) => t("networks.sketch.sharedOn", {count}),
                group: (block) => t("networks.sketch.shared", {count: block.count}),
                object: (o) => t("networks.sketch.object", {path: o.path, node: o.node, count: o.count}),
                sharedObject: (o) => t("networks.sketch.sharedObject", {path: o.path, count: o.count, nodes: o.nodes.join(", ")}),
                more: (count) => t("networks.sketch.more", {count}),
            }}
            onOpen={(path) => peek("object", path)}
        />
    );
}
