import React, {useEffect, useId, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {DIRECTION_OFFSET, meshLayout, meshLinks, meshNodes} from "../app/heartbeat-mesh";
import {RelativeTime} from "../ui/components/RelativeTime";
import {CARD as CARD_SURFACE} from "./HeartbeatSummary";
import {RING_INK, StateRing} from "./StateRing";
import {Dialog} from "../ui/components/Dialog";
import {useRoomWidth} from "../ui/lib/room-width";

/** The tint of a line: the state of its links, in the oc3 state colours. */
const STROKE = {up: "stroke-state-up", warn: "stroke-state-warn", down: "stroke-state-down", none: "stroke-line"};
const FILL = {up: "fill-state-up", warn: "fill-state-warn", down: "fill-state-down", none: "fill-line"};

/** The box of a node, its routines all running, some stopped, all of them. */
const NODE_BOX = {
    up: "fill-surface-raised stroke-line",
    warn: "fill-state-warn/15 stroke-state-warn",
    down: "fill-state-down/15 stroke-state-down",
};

/**
 * The routines of a node, the daemon threads of its streams: how many are not
 * running out of all, and the state they make, up when all run, down when none does.
 */
function routinesOf(status) {
    const streams = status?.streams ?? [];
    const stopped = streams.filter((stream) => stream.state !== "running");
    const state = stopped.length === 0 ? "up" : stopped.length === streams.length ? "down" : "warn";
    return {stopped, total: streams.length, state};
}

const ZERO_TIME = "0001-01-01T00:00:00Z";

/**
 * The ring of the streams in the colours of the gauges of the heartbeats and the
 * routines: those beating, those failing, those of a stopped stream, on the grey of
 * their cards; its word in the tint of their counts.
 */
const ARC = {up: "stroke-state-up", down: "stroke-state-down", stopped: "stroke-line"};

/**
 * All the streams of the cluster at a glance, nothing hovered nor kept: a ring, a gauge
 * gone round, its arcs the links beating, failing, of a stopped stream, in that order,
 * and in it their figures, how many beat out of all, and a word for it, optimal when
 * all do.
 */
export function Overall({links, hint}) {
    const {t} = useTranslation();
    const total = links.length;
    const beating = links.filter((l) => l.state === "up").length;
    const stopped = links.filter((l) => l.streamState !== undefined && l.streamState !== "running").length;
    const state = beating === total ? "up" : beating === 0 ? "down" : "warn";
    const parts = [["up", beating], ["down", total - beating - stopped], ["stopped", stopped]]
        .map(([part, count]) => [part, count, ARC[part], {word: t(`heartbeats.mesh.arcs.${part}`)}]);
    return (
        <div data-overall={state} className="flex flex-col items-center gap-2 py-1">
            <StateRing parts={parts} total={total}>
                <span className="text-2xl font-semibold tabular-nums">{beating}/{total}</span>
                <span className="text-ink-muted">{t("heartbeats.mesh.overall.operational")}</span>
                <span className={`font-semibold ${RING_INK[state]}`}>{t(`heartbeats.mesh.overall.${state}`)}</span>
            </StateRing>
            {hint && <p className="text-center text-ink-muted">{hint}</p>}
        </div>
    );
}

/** The cards of the details, as many a row as the box holds, each grey on the box. */
const CARDS = "grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2";
const CARD = `flex min-w-0 flex-col gap-0.5 px-2 py-1.5 ${CARD_SURFACE}`;

/**
 * The heartbeat mesh of the cluster: its nodes, and between two nodes two parallel
 * lines, one each way, from the sender to the receiver, holding every link of that
 * direction (each stream of each node toward its peer). A line is cut in two
 * halves, a gap between them: from the sender, an arrow toward the receiver, its
 * tx streams; into the receiver, an arrow to it, its rx streams. A half is green when
 * all its links beat, orange for a mix, red when none does, grey and dashed when its
 * end reports none. A node is orange when some of its routines, the daemon threads
 * of its streams, are stopped, red when all of them are. The gap reacts to nothing:
 * on a large cluster, the lines crossing there are too many.
 *
 * No text on the lines: their details in a box of their own, beside the mesh in the
 * boxes of the page. A half hovered,
 * its links, each with its heartbeat, side, type, description, state and last beat;
 * a line focused, all of its links; a node hovered, its routines stopped. A half
 * clicked, or a line by Enter or Space, is handed to `onSelect`, the page showing its
 * links, and its details stay, the half bold, until another is clicked or the
 * ground of the mesh is, handing `onSelect` null. `selected`, the key of the line the
 * page shows ("n1 n2"): its details stay with it.
 */
export function HeartbeatMesh({heartbeatStatus, onSelect, selected}) {
    const {t, i18n} = useTranslation();
    const id = useId();
    const links = useMemo(() => meshLinks(heartbeatStatus ?? {}), [heartbeatStatus]);
    const nodes = useMemo(() => meshNodes(heartbeatStatus ?? {}, links), [heartbeatStatus, links]);
    // Laid out for the width it is drawn in: narrow, its circle tighter, its names read.
    const [square, room] = useRoomWidth();
    const layout = useMemo(() => meshLayout(nodes, links, room), [nodes, links, room]);
    // What is hovered or focused, a half, a whole line or a node; what was clicked, a half or a line.
    const [hovered, setHovered] = useState(null);
    const [pinned, setPinned] = useState(null);
    // The line the page shows changed elsewhere, a chip removed, a link in the URL: the
    // details follow it.
    useEffect(() => {
        if (selected === undefined) return;
        setPinned((pin) => (selected ? (pin?.key === selected ? pin : {key: selected, side: null}) : null));
    }, [selected]);
    const hover = (shown) => () => setHovered(shown);
    const leave = () => setHovered(null);
    const pick = (g, side) => {
        setPinned({key: g.key, side});
        onSelect?.(g);
    };

    if (nodes.length === 0) return null;
    // The streams of what was clicked, in a dialog over the page; hovered, the drawing alone marks it.
    const shown = pinned;
    const close = () => {
        if (pinned?.key) onSelect?.(null);
        setPinned(null);
    };
    const group = shown?.key ? layout.groups.find((g) => g.key === shown.key) : undefined;
    const nodeShown = shown?.node ? {name: shown.node, ...routinesOf(heartbeatStatus?.[shown.node])} : undefined;
    // The links the details list: those of the half, or all of the line.
    const listed = group ? (shown.side ? group[shown.side].links : group.links) : [];
    // A half outlined: hovered, or kept.
    const bold = (g, side) => [hovered, pinned].some((s) => s?.key === g.key && (s.side === null || s.side === side));
    const marker = (state) => `${id.replace(/:/g, "")}-arrow-${state}`;
    const beating = (g) => g.links.filter((l) => l.state === "up").length;
    const describe = (g) => t("heartbeats.mesh.groupLabel", {
        from: g.from, to: g.to, count: g.links.length, beating: beating(g),
    });
    const stateOf = (l) => t(l.state === "up" ? "heartbeats.marks.beating" : "heartbeats.marks.stale")
        + (l.streamState && l.streamState !== "running" ? ` (${l.streamState})` : "");

    return (
        <>
        {/* A square as wide as its column of the boxes of the page. */}
        <section aria-labelledby={`${id}-title`} className="min-w-0 space-y-2" data-mesh="">
            <h2 id={`${id}-title`} className="font-semibold">{t("heartbeats.mesh.title")}</h2>
            {/* On the ground of the tables, as the other boxes: the drawing, what its lines say
                under it. */}
            <div className="overflow-hidden rounded-(--radius-panel) border border-line bg-surface-raised">
            {/* The ground of the drawing clicked, no line kept. */}
            <div
                ref={square}
                className="relative aspect-square w-full"
                onClick={(event) => {
                    if (event.target.closest?.("[data-group]")) return;
                    setPinned(null);
                    if (selected) onSelect?.(null);
                }}
            >
                <svg
                    role="group"
                    aria-labelledby={`${id}-title`}
                    width={layout.width}
                    height={layout.height}
                    viewBox={`0 0 ${layout.width} ${layout.height}`}
                    // Fitted to the square, its drawing a square too.
                    className="block h-full w-full text-data"
                >
                    <defs>
                        {["up", "warn", "down", "none"].map((state) => (
                            <marker
                                key={state}
                                id={marker(state)}
                                viewBox="0 0 10 10"
                                refX="9"
                                refY="5"
                                markerWidth="7"
                                markerHeight="7"
                                orient="auto-start-reverse"
                            >
                                <path d="M 0 0 L 10 5 L 0 10 z" className={FILL[state]}/>
                            </marker>
                        ))}
                        {/* The head of an outline: the arrow's shape, larger, sized in the units of the
                            drawing (the arrow's head 14 of them wide, its tip 1.4 past the line), its tip
                            a little further out, the arrow's head ringed by it. */}
                        <marker
                            id={marker("outline")}
                            viewBox="0 0 10 10"
                            refX="8"
                            refY="5"
                            markerWidth="20"
                            markerHeight="20"
                            markerUnits="userSpaceOnUse"
                            orient="auto-start-reverse"
                        >
                            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-accent"/>
                        </marker>
                    </defs>
                    {layout.groups.map((g) => (
                        <g
                            key={g.key}
                            data-group={g.key}
                            data-state={g.state}
                            data-pinned={pinned?.key === g.key || undefined}
                            tabIndex={0}
                            aria-label={describe(g)}
                            onFocus={hover({key: g.key, side: null})}
                            onBlur={leave}
                            // Pressed by the pointer, not focused: the details of the half hovered
                            // stay, those of the whole line are for the keyboard.
                            onMouseDown={(event) => event.preventDefault()}
                            // Enter or Space on a line: its links, wherever the page shows them.
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    pick(g, null);
                                }
                            }}
                            role="button"
                            className="cursor-pointer outline-none"
                        >
                            {/* The half hovered or kept outlined: a wide soft stroke under its arrow,
                                its head too, the arrow itself as it is. */}
                            {["tx", "rx"].filter((side) => bold(g, side)).map((side) => (
                                // One shade for the band and its head, faded together: where they meet, no darker.
                                <g key={`outline-${side}`} data-outline={side} className="opacity-35">
                                    {/* The band, cut square at the base of the head, the head alone past it. */}
                                    <path
                                        d={g[side].outline}
                                        fill="none"
                                        strokeWidth={9}
                                        strokeLinecap="butt"
                                        className="stroke-accent"
                                    />
                                    {/* The head, at the very end of the line, as the arrow's: the line itself unseen. */}
                                    <path d={g[side].path} fill="none" stroke="none" markerEnd={`url(#${marker("outline")})`}/>
                                </g>
                            ))}
                            {/* The tx of the sender, then the rx of the receiver, each its arrow. */}
                            {["tx", "rx"].map((side) => (
                                <path
                                    key={side}
                                    data-half={side}
                                    data-state={g[side].state}
                                    d={g[side].path}
                                    fill="none"
                                    strokeWidth={2}
                                    strokeDasharray={g[side].state === "none" ? "4 3" : undefined}
                                    markerEnd={`url(#${marker(g[side].state)})`}
                                    className={STROKE[g[side].state]}
                                />
                            ))}
                            {/* Wider invisible strokes over each half, the pointer finds a thin line,
                                its details shown, kept when clicked; narrower than the room between
                                the two lines, each keeps its own. */}
                            {["tx", "rx"].map((side) => (
                                <path
                                    key={side}
                                    d={g[side].path}
                                    fill="none"
                                    stroke="transparent"
                                    strokeWidth={DIRECTION_OFFSET - 2}
                                    data-hover={side}
                                    onMouseEnter={hover({key: g.key, side})}
                                    onMouseLeave={leave}
                                    onClick={() => pick(g, side)}
                                />
                            ))}
                        </g>
                    ))}
                    {/* The relays the heartbeats go through, in the centre the lines keep clear. */}
                    {layout.relays.map((r) => (
                        <g key={r.name} data-relay={r.name} data-state={r.state}>
                            <rect
                                x={r.x - r.width / 2}
                                y={r.y - r.height / 2}
                                width={r.width}
                                height={r.height}
                                rx={r.height / 2}
                                className={NODE_BOX[r.state]}
                                strokeWidth={r.state === "up" ? 1.5 : 2}
                                strokeDasharray="4 3"
                            />
                            <text x={r.x} y={r.y} dy="0.35em" textAnchor="middle" className="fill-ink-muted">{r.label}</text>
                        </g>
                    ))}
                    {nodes.map((name) => {
                        const p = layout.nodes[name];
                        const routines = routinesOf(heartbeatStatus?.[name]);
                        return (
                            <g
                                key={name}
                                data-node={name}
                                data-state={routines.state}
                                // Some routines stopped: which, in a dialog when clicked.
                                {...(routines.stopped.length > 0 ? {
                                    role: "button",
                                    tabIndex: 0,
                                    "aria-label": t("heartbeats.mesh.nodeStopped", {node: name, count: routines.stopped.length}),
                                    className: "cursor-pointer outline-none",
                                    onMouseEnter: hover({node: name}),
                                    onMouseLeave: leave,
                                    onClick: (event) => {
                                        event.stopPropagation();
                                        setPinned({node: name});
                                    },
                                    onKeyDown: (event) => {
                                        if (event.key !== "Enter" && event.key !== " ") return;
                                        event.preventDefault();
                                        setPinned({node: name});
                                    },
                                } : {})}
                            >
                                {/* A pill as wide as the name: a node name can be long, a circle would not hold it. */}
                                <rect
                                    x={p.x - p.width / 2}
                                    y={p.y - p.height / 2}
                                    width={p.width}
                                    height={p.height}
                                    rx={p.height / 2}
                                    className={NODE_BOX[routines.state]}
                                    strokeWidth={routines.state === "up" ? 1.5 : 2}
                                />
                                <text x={p.x} y={p.y} dy="0.35em" textAnchor="middle" className="fill-ink font-semibold">{p.label}</text>
                            </g>
                        );
                    })}
                </svg>
            </div>
            {/* What the lines say, in the box under the drawing; no line, nothing to say. */}
            {layout.groups.length > 0 && (
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pb-2 text-data text-ink-muted" data-legend="">
                    <span>{t("heartbeats.mesh.legend.direction")}</span>
                    {["up", "warn", "down"].map((state) => (
                        <span key={state} className="inline-flex items-center gap-1.5" data-legend-state={state}>
                            <svg aria-hidden="true" width="18" height="4" className="shrink-0">
                                <line x1="0" y1="2" x2="18" y2="2" strokeWidth="2.5" className={STROKE[state]}/>
                            </svg>
                            {t(`heartbeats.mesh.legend.${state}`)}
                        </span>
                    ))}
                </p>
            )}
            </div>
        </section>
        {/* All the streams at a glance, a box of its own, kept as it is whatever is hovered or clicked. */}
        <section aria-labelledby={`${id}-details`} className="min-w-0 space-y-2" data-details="">
            <h2 id={`${id}-details`} className="font-semibold">{t("heartbeats.mesh.details")}</h2>
            <div className="rounded-(--radius-panel) border border-line bg-surface-raised p-2 text-data">
                <Overall links={links}/>
            </div>
        </section>
        {/* The streams of what was clicked: a card a link, or a card a routine stopped. */}
        <Dialog
            open={Boolean(group || nodeShown)}
            onClose={close}
            size="lg"
            title={group
                ? (shown.side
                    ? (shown.side === "tx"
                        ? t("heartbeats.mesh.half.tx", {node: group.from, peer: group.to})
                        : t("heartbeats.mesh.half.rx", {node: group.to, peer: group.from}))
                    : `${group.from} → ${group.to}`)
                : nodeShown?.name ?? ""}
        >
            <div className="text-data" data-streams={group ? "line" : nodeShown ? "node" : ""}>
                {group && (
                    <>
                        {/* The half or the line in the title; here how many of its links beat. */}
                        <p className="mb-1.5 text-ink-muted" data-card-side={shown.side ?? undefined}>
                            {t("heartbeats.mesh.beatingOf", {beating: listed.filter((l) => l.state === "up").length, count: listed.length})}
                        </p>
                        {listed.length === 0 && <p className="text-ink-muted">{t("heartbeats.mesh.noLink")}</p>}
                        {/* A card a link: its heartbeat, its side and node unless the title says
                            them, its state; its type, its description, its last beat. */}
                        <ul className={CARDS}>
                            {listed.map((l) => (
                                <li key={l.key} data-link={l.key} className={CARD}>
                                    <span className="flex items-baseline justify-between gap-2">
                                        <span className="truncate font-medium">
                                            <span data-field="hb">{l.hb}</span>
                                            {!shown.side && <span data-field="side" className="ml-2 font-normal text-ink-muted">{`${l.dir} · ${l.node}`}</span>}
                                        </span>
                                        <span data-field="status" className={`shrink-0 ${l.state === "up" ? "text-state-up" : "text-state-down"}`}>{stateOf(l)}</span>
                                    </span>
                                    <span className="flex items-baseline justify-between gap-2 text-ink-muted">
                                        {/* Cut short in a narrow card: the whole of it hovered. */}
                                        <span className="min-w-0 truncate">
                                            <span data-field="type">{l.type}</span>
                                            {" · "}
                                            <span data-field="desc" className="font-mono">{l.desc || "–"}</span>
                                        </span>
                                        <span data-field="beat" className="shrink-0">
                                            {l.lastBeatingAt && l.lastBeatingAt !== ZERO_TIME
                                                ? <RelativeTime value={l.lastBeatingAt} locale={i18n.language}/>
                                                : "–"}
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
                {nodeShown && (
                    <>
                        <p className="mb-1.5 text-ink-muted">
                            {t("heartbeats.mesh.routinesStopped", {stopped: nodeShown.stopped.length, count: nodeShown.total})}
                        </p>
                        {/* A card a routine stopped: its stream, its type, its state. */}
                        <ul className={CARDS}>
                            {nodeShown.stopped.map((stream) => (
                                <li key={stream.id} data-stream={stream.id} className={CARD}>
                                    <span className="flex items-baseline justify-between gap-2">
                                        <span data-field="id" className="truncate font-medium">{stream.id}</span>
                                        <span data-field="state" className="shrink-0 text-state-down">{stream.state || t("common.unknown")}</span>
                                    </span>
                                    <span data-field="type" className="text-ink-muted">{stream.type}</span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </div>
        </Dialog>
        </>
    );
}
