import React from "react";
import {useHref, useNavigate} from "react-router-dom";
import {useRoomWidth} from "../ui/lib/room-width";

const RING_RADIUS = 52;
const ROUND = 2 * Math.PI * RING_RADIUS;
/** The tint of the word in a ring, by the state its parts make. */
export const RING_INK = {up: "text-state-up", warn: "text-state-warn", down: "text-state-down"};

/** The room of the labels: on each side of the ring, its width; and their least gap, one above the other. */
const LABEL_ROOM = 64;
const LABEL_GAP = 11;
/**
 * The size of the labels in the drawing, and the least they are read at, in pixels:
 * the drawing shrunk to a phone, its labels larger in it, not smaller than that.
 */
const LABEL_SIZE = 8;
const LABEL_READ = 11.5;
/** How far to a side the middle of an arc stands for its label to leave from it (the sine of its angle). */
const SIDEWAYS = 0.6;
/** Where a label's line leaves the ring, outside its stroke, and where it turns along the label. */
const LEAD_FROM = RING_RADIUS + 5;
const LEAD_TO = RING_RADIUS + 12;

/**
 * The labels of the arcs, each `\_ word count` from the middle of its arc out: on the
 * side of the ring the middle stands, one above the other with room between them, kept
 * in the drawing.
 */
function placeLabels(arcs, cx, cy, height, gap = LABEL_GAP) {
    const placed = arcs.map((arc) => {
        // From its middle; near the top or the bottom of the ring, from the point of the arc
        // farthest to a side, its label beside the ring rather than under or over it.
        const at = (length) => ((arc.start + length) / ROUND) * 2 * Math.PI;
        let angle = at(arc.length / 2);
        if (Math.abs(Math.sin(angle)) < SIDEWAYS) {
            for (let i = 0; i <= 48; i += 1) {
                const candidate = at((arc.length * i) / 48);
                if (Math.abs(Math.sin(candidate)) > Math.abs(Math.sin(angle)) + 0.001) angle = candidate;
            }
        }
        const point = (r, at_ = angle) => [cx + r * Math.sin(at_), cy - r * Math.cos(at_)];
        const [x1, y1] = point(LEAD_FROM);
        // Still near the top or the bottom, a short arc there: its line out to a turn beside
        // the ring, on its side, the label clear of the ring.
        const right = Math.sin(angle) >= 0;
        let turn = angle;
        if (Math.abs(Math.sin(angle)) < SIDEWAYS) {
            const side = Math.asin(SIDEWAYS);
            turn = (Math.cos(angle) >= 0 ? side : Math.PI - side) * (right ? 1 : -1);
        }
        const [x2, y2] = point(LEAD_TO, turn);
        return {...arc, right, x1, y1, x2, y: y2};
    });
    for (const right of [true, false]) {
        const side = placed.filter((l) => l.right === right).sort((a, b) => a.y - b.y);
        for (let i = 1; i < side.length; i += 1) side[i].y = Math.max(side[i].y, side[i - 1].y + gap);
        // Pushed past the bottom: back up, the gaps kept.
        const over = (side.at(-1)?.y ?? 0) - (height - 4);
        if (over > 0) for (const l of side) l.y -= over;
        // Its text in the drawing, however large: its line under its top.
        for (const l of side) l.y = Math.max(l.y, gap - 1);
    }
    return placed;
}

/** A label opening a page: a link of the drawing, the page of the app opened in place. */
function LabelLink({to, title, children}) {
    const href = useHref(to);
    const navigate = useNavigate();
    return (
        <a
            href={href}
            aria-label={title}
            onClick={(e) => {
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                navigate(to);
            }}
            className="outline-none focus-visible:[&_text]:underline"
        >
            {children}
        </a>
    );
}

/**
 * A gauge gone round: its arcs the parts of a whole one after the other from the top,
 * `parts` as [name, count, stroke class, label?], those of none left out, on a grey
 * track; in it, `children`, its figures and words. `total`, the whole, the sum of the
 * parts unless said. A part's `label` ({word, to, title}): `\_ word count` drawn from
 * its arc out, beside the ring, a link to `to` when given.
 */
export function StateRing({parts, total = parts.reduce((sum, [, count]) => sum + count, 0), children}) {
    let start = 0;
    const arcs = parts
        .filter(([, count]) => count > 0)
        .map(([part, count, stroke, label]) => {
            const length = (ROUND * count) / total;
            const arc = {part, count, length, start, stroke, label};
            start += length;
            return arc;
        });
    const labelled = parts.some(([, , , label]) => label);
    const width = labelled ? 120 + 2 * LABEL_ROOM : 120;
    const cx = width / 2;
    // Its labels read on a phone: as large in the drawing as its shrinking asks.
    const [box, room] = useRoomWidth();
    const size = room ? Math.max(LABEL_SIZE, (LABEL_READ * width) / room) : LABEL_SIZE;
    const labels = labelled ? placeLabels(arcs.filter((a) => a.label), cx, 60, 120, Math.max(LABEL_GAP, size + 3)) : [];
    return (
        <div ref={box} className={labelled ? "relative aspect-[248/120] w-full max-w-[23rem]" : "relative size-44"}>
            <svg viewBox={`0 0 ${width} 120`} className="size-full overflow-visible">
                <g aria-hidden="true" transform={`rotate(-90 ${cx} 60)`}>
                    <circle cx={cx} cy="60" r={RING_RADIUS} fill="none" strokeWidth="8" className="stroke-surface-sunken"/>
                    {arcs.map(({part, length, start: from, stroke}) => (
                        <circle
                            key={part}
                            data-arc={part}
                            cx={cx}
                            cy="60"
                            r={RING_RADIUS}
                            fill="none"
                            strokeWidth="8"
                            strokeDasharray={`${length} ${ROUND}`}
                            strokeDashoffset={-from}
                            className={stroke}
                        />
                    ))}
                </g>
                {labels.length > 0 && (
                    <g data-ring-labels="" style={{fontSize: `${size}px`}}>
                        {labels.map((l) => {
                            const end = l.right ? width - 2 : 2;
                            const drawn = (
                                <g data-label={l.part}>
                                    <polyline points={`${l.x1},${l.y1} ${l.x2},${l.y} ${end},${l.y}`} fill="none" strokeWidth="0.75" className="stroke-line-strong"/>
                                    {/* The label at the outer end of its line, those of a side aligned. */}
                                    <text
                                        x={end}
                                        y={l.y - 2}
                                        textAnchor={l.right ? "end" : "start"}
                                        className="fill-current"
                                    >
                                        <tspan className="fill-ink-muted">{l.label.word}</tspan>
                                        <tspan className="font-semibold tabular-nums">{` ${l.count}`}</tspan>
                                    </text>
                                </g>
                            );
                            return l.label.to
                                ? <LabelLink key={l.part} to={l.label.to} title={l.label.title}>{drawn}</LabelLink>
                                : <React.Fragment key={l.part}>{drawn}</React.Fragment>;
                        })}
                    </g>
                )}
            </svg>
            {/* Its figures and words inside the ring, a long label on two lines, not under its arcs. */}
            <div
                className={`absolute inset-y-0 flex flex-col items-center justify-center text-center leading-tight text-balance ${
                    labelled ? "right-[31%] left-[31%]" : "inset-x-0 px-6"
                }`}
            >
                {children}
            </div>
        </div>
    );
}
