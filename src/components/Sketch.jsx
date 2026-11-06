import React, {useId} from "react";
import {LINE, PADDING} from "../app/sketch-layout";

/** A fact of a box: its keyword muted, its value; one the daemon decides said so. */
function Fact({fact, x, y, computed}) {
    return (
        <text x={x} y={y} className="fill-ink">
            <tspan className="fill-ink-muted">{fact.key}</tspan>
            {" "}
            {fact.computed
                ? <tspan className="fill-ink-muted italic">{computed}</tspan>
                : <tspan className="font-mono">{fact.value}</tspan>}
        </text>
    );
}

/** Enter or Space on a drawn button: as a click. */
const onKey = (open) => (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    open();
};

/** Half the width of a tunnel: its two lines that far each side of its middle. */
const TUNNEL_HALF = 3;

/** An object holding items on one node, a chip: its path, its detail or count; opening its panel. */
function ObjectChip({o, h, label, onOpen}) {
    return (
        <g data-object={o.path} role="button" tabIndex={0} aria-label={label} onClick={onOpen} onKeyDown={onKey(onOpen)}
           className="group cursor-pointer outline-none">
            <rect x={o.x} y={o.y} width={o.width} height={h} rx={h / 2}
                  className="fill-surface stroke-line group-hover:fill-surface-sunken group-focus-visible:stroke-accent"/>
            <text x={o.x + PADDING} y={o.y + h / 2 + 4} className="fill-ink">{o.path}</text>
            <text x={o.x + o.width - PADDING} y={o.y + h / 2 + 4} textAnchor="end" className="fill-ink-muted tabular-nums">
                {o.detail ?? o.count}
            </text>
        </g>
    );
}

/**
 * An object of items reported by several nodes, or none: a pill across the columns of
 * the nodes, each stretch over a column drawn as a chip of an object held on one node
 * where the node reports them, no more marked than it, dashed and empty where it does
 * not; its ends rounded, as its first and last stretch.
 */
function SharedPill({o, h, label, onOpen}) {
    const r = h / 2;
    const {y} = o;
    const lastIndex = o.segments.length - 1;
    return (
        <g data-object={o.path} data-nodes={o.nodes.join(" ")} role="button" tabIndex={0} aria-label={label}
           onClick={onOpen} onKeyDown={onKey(onOpen)} className="group cursor-pointer outline-none">
            {o.segments.map((seg, i) => {
                const a = i === 0 ? seg.x1 + r : seg.x1;
                const b = i === lastIndex ? seg.x2 - r : seg.x2;
                // Its area: straight sides between stretches, half circles at the ends.
                const area = [
                    `M ${a} ${y} L ${b} ${y}`,
                    i === lastIndex ? `A ${r} ${r} 0 0 1 ${b} ${y + h}` : `L ${b} ${y + h}`,
                    `L ${a} ${y + h}`,
                    i === 0 ? `A ${r} ${r} 0 0 1 ${a} ${y}` : `L ${a} ${y}`,
                    "Z",
                ].join(" ");
                // Its outline: top and bottom, and its end, no line between two stretches.
                const outline = [
                    `M ${a} ${y} L ${b} ${y}`,
                    `M ${a} ${y + h} L ${b} ${y + h}`,
                    i === 0 ? `M ${a} ${y} A ${r} ${r} 0 0 0 ${a} ${y + h}` : "",
                    i === lastIndex ? `M ${b} ${y} A ${r} ${r} 0 0 1 ${b} ${y + h}` : "",
                ].join(" ");
                return (
                    <g key={seg.node} data-segment={seg.node} data-present={seg.present || undefined}>
                        <path d={area} className={seg.present ? "fill-surface group-hover:fill-surface-sunken" : "fill-transparent"}/>
                        <path d={outline} fill="none" strokeDasharray={seg.present ? undefined : "4 3"}
                              className="stroke-line group-focus-visible:stroke-accent"/>
                    </g>
                );
            })}
            <text x={o.x + PADDING} y={y + h / 2 + 4} className="fill-ink">{o.path}</text>
            <text x={o.x + o.width - PADDING} y={y + h / 2 + 4} textAnchor="end" className="fill-ink-muted tabular-nums">{o.detail ?? o.count}</text>
        </g>
    );
}

/**
 * A sketch (`sketch-layout.ts`) drawn: its band over the nodes, a box a node, the routes
 * between them, the objects of the items under the boxes, each opening its panel
 * (`onOpen(path)`). `title`, of the band; `caption`, said of the whole; `computed`, the
 * words of a value the daemon decides; `route`, the label and title of the routes;
 * `texts`, the words of the counts and of the objects: `count(n)` and `shared(n)` in a
 * box, `group(block)` of the pills, `object(o)` and `sharedObject(o)` their names,
 * `more(n)` those left out.
 */
export function Sketch({layout, title, caption, computed, route, texts, onOpen}) {
    const id = useId();
    const {band} = layout;
    return (
        <figure className="space-y-1">
            <figcaption id={`${id}-caption`} className="sr-only">{caption}</figcaption>
            <svg
                role="group"
                aria-labelledby={`${id}-caption`}
                width={layout.width}
                height={layout.height}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                // Its own size, smaller in a narrow panel.
                className="block h-auto max-w-full text-data"
            >
                {/* What it is, over all the nodes. */}
                <g data-band="">
                    <rect x={band.x} y={band.y} width={band.width} height={band.height} rx="6"
                          className="fill-surface-sunken stroke-line"/>
                    <text x={band.x + PADDING} y={band.y + PADDING + LINE - 4} className="fill-ink font-semibold">{title}</text>
                    {band.facts.map((fact, i) => (
                        <Fact key={fact.key} fact={fact} computed={computed}
                              x={band.x + PADDING} y={band.y + PADDING + LINE * (i + 2) - 4}/>
                    ))}
                </g>

                {layout.nodes.map((node) => (
                    <line key={`drop-${node.name}`} x1={node.drop.x} y1={node.drop.y1} x2={node.drop.x} y2={node.drop.y2}
                          strokeWidth="1.5" className="stroke-line-strong"/>
                ))}
                {/* Routes between the nodes, under their boxes, past the first and the last;
                    through tunnels, a pipe of two lines. */}
                {layout.route && (
                    <g data-route={layout.route.tunnel ? "tunnel" : "routed"}>
                        {(layout.route.tunnel ? [-TUNNEL_HALF, TUNNEL_HALF] : [0]).map((dy) => (
                            <line key={dy} x1={layout.route.x1} y1={layout.route.y + dy} x2={layout.route.x2} y2={layout.route.y + dy}
                                  strokeWidth="1.5" className="stroke-accent"/>
                        ))}
                        <text x={layout.route.labelX} y={layout.route.y + 4} className="fill-accent">{route?.label}</text>
                    </g>
                )}

                {layout.nodes.map((node) => (
                    <g key={node.name} data-node={node.name}>
                        <rect x={node.x} y={node.y} width={node.width} height={node.height} rx="6"
                              className="fill-surface-raised stroke-line-strong"/>
                        <text x={node.x + PADDING} y={node.y + PADDING + LINE - 4} className="fill-ink font-semibold">{node.name}</text>
                        {node.facts.map((fact, i) => (
                            <Fact key={fact.key} fact={fact} computed={computed}
                                  x={node.x + PADDING} y={node.y + PADDING + LINE * (i + 2) - 4}/>
                        ))}
                        <text x={node.x + PADDING} y={node.y + node.height - PADDING - 2 - (node.shared > 0 ? LINE : 0)} className="fill-ink-muted">
                            {texts.count(node.count)}
                        </text>
                        {node.shared > 0 && (
                            <text x={node.x + PADDING} y={node.y + node.height - PADDING - 2} className="fill-ink-muted">
                                {texts.shared(node.shared)}
                            </text>
                        )}
                    </g>
                ))}

                {/* The items reported by several nodes, or none: once, a pill across the columns, solid over the nodes reporting them. */}
                {layout.shared && (
                    <g data-shared="" aria-label={texts.group(layout.shared)} role="group">
                        {layout.shared.rows.map((o) => (
                            <SharedPill key={o.path} o={o} h={layout.chip} label={texts.sharedObject(o)} onOpen={() => onOpen(o.path)}/>
                        ))}
                        {layout.shared.more && (
                            <text x={layout.shared.more.x} y={layout.shared.more.y} textAnchor="middle" className="fill-ink-muted">
                                {texts.more(layout.shared.more.count)}
                            </text>
                        )}
                    </g>
                )}
                {/* The objects each node holds alone, under its box. */}
                {layout.objects.map((o) => (
                    <ObjectChip key={`${o.node}/${o.path}`} o={o} h={layout.chip} label={texts.object(o)} onOpen={() => onOpen(o.path)}/>
                ))}
                {layout.more.map((m) => (
                    <text key={`more-${m.node}`} x={m.x} y={m.y} textAnchor="middle" className="fill-ink-muted">
                        {texts.more(m.count)}
                    </text>
                ))}
            </svg>
        </figure>
    );
}
