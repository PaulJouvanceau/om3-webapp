import { ChevronDownIcon } from "../icons";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";

/** A category of a tab made of several lists, as its chip shows it. */
export interface CategoryTab<K extends string> {
  key: K;
  label: string;
  icon?: ReactNode;
  /** What follows the name: a count (`CategoryCount`), or a mark saying a state. */
  mark?: ReactNode;
  /** The state in words, said after the name to assistive technologies. */
  description?: string;
  /** "strong" for a category worth a look, "error" when it could not load. */
  tone?: "strong" | "muted" | "error";
}

const TONES = {
  strong: "border-line-strong font-medium text-ink",
  muted: "border-line text-ink-muted",
  error: "border-line text-state-down",
};

/** How far the chips fade out on a side where more of them lie past the edge, in pixels. */
const FADE = 28;

/**
 * The strip faded out on each side `more` says chips lie past: on a phone, a strip
 * cut at its edge said to go on, not taken for all of it.
 */
export function fadeMask(more: {
  start: boolean;
  end: boolean;
}): CSSProperties | undefined {
  if (!more.start && !more.end) return undefined;
  const from = more.start ? `transparent 0, #000 ${String(FADE)}px` : "#000 0";
  const to = more.end
    ? `#000 calc(100% - ${String(FADE)}px), transparent 100%`
    : "#000 100%";
  const mask = `linear-gradient(to right, ${from}, ${to})`;
  return { maskImage: mask, WebkitMaskImage: mask };
}

/**
 * An arrow on the side of the strip more chips lie past, over its fade: said at a
 * glance, a tap scrolling to them. For the pointer: the keyboard has its arrows.
 */
function MoreArrow({
  side,
  onClick,
}: {
  side: "start" | "end";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-hidden="true"
      tabIndex={-1}
      data-more-arrow={side}
      onClick={onClick}
      className={`absolute top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-line-strong bg-surface-raised text-ink shadow ${
        side === "start" ? "left-0" : "right-0"
      }`}
    >
      <ChevronDownIcon
        className={`h-3.5 w-3.5 ${side === "start" ? "rotate-90" : "-rotate-90"}`}
      />
    </button>
  );
}

/** The count of a category, in the pill its chip carries. */
export function CategoryCount({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      className="rounded-full bg-surface-sunken px-1.5 text-data font-medium tabular-nums"
    >
      {count}
    </span>
  );
}

/**
 * A strip of chips choosing which category a tab shows, one at a time: each chip
 * carries the icon and name of its category, then a count or a mark. A tab list
 * for assistive technologies: the arrows, Home and End move the choice, and the
 * panel shown is `<idPrefix>-panel-<key>`, labelled by `<idPrefix>-tab-<key>`.
 * On one line: it scrolls sideways rather than wrap, should the chips outgrow it, faded
 * out on a side more of them lie past, an arrow there scrolling to them, the chip
 * chosen brought whole into view.
 */
export function CategoryTabs<K extends string>({
  label,
  idPrefix,
  tabs,
  active,
  onSelect,
}: {
  /** Accessible name of the strip. */
  label: string;
  idPrefix: string;
  tabs: CategoryTab<K>[];
  active: K;
  onSelect: (key: K) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  // Whether chips lie past the start or the end of the strip, as it scrolls or resizes.
  const [more, setMore] = useState({ start: false, end: false });
  const measure = useCallback(() => {
    const strip = list.current;
    if (strip === null) return;
    const start = strip.scrollLeft > 1;
    const end = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 1;
    setMore((was) =>
      was.start === start && was.end === end ? was : { start, end },
    );
  }, []);
  useLayoutEffect(() => {
    const strip = list.current;
    measure();
    if (strip === null || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return () => {
      observer.disconnect();
    };
  }, [measure, tabs.length]);
  // The chip chosen whole in view, past the fade: the strip alone scrolled, not the page.
  useLayoutEffect(() => {
    const strip = list.current;
    const chip = strip?.querySelector<HTMLElement>(
      `#${CSS.escape(`${idPrefix}-tab-${active}`)}`,
    );
    if (!strip || !chip) return;
    const left =
      chip.getBoundingClientRect().left -
      strip.getBoundingClientRect().left +
      strip.scrollLeft;
    const right = left + chip.getBoundingClientRect().width;
    if (left - FADE < strip.scrollLeft)
      strip.scrollLeft = Math.max(0, left - FADE);
    else if (right + FADE > strip.scrollLeft + strip.clientWidth)
      strip.scrollLeft = right + FADE - strip.clientWidth;
    measure();
  }, [active, idPrefix, measure]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.key === active);
    const target =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : -1;
    const next = tabs[target];
    if (next === undefined) return;
    event.preventDefault();
    onSelect(next.key);
    list.current
      ?.querySelector<HTMLElement>(
        `#${CSS.escape(`${idPrefix}-tab-${next.key}`)}`,
      )
      ?.focus();
  }

  // Scrolled by most of its width toward a side, a chip of before still seen.
  const page = (side: "start" | "end") => {
    const strip = list.current;
    if (strip === null) return;
    const by =
      Math.max(strip.clientWidth - 2 * FADE, FADE) * (side === "end" ? 1 : -1);
    if (typeof strip.scrollBy === "function")
      strip.scrollBy({ left: by, behavior: "smooth" });
    else strip.scrollLeft += by;
  };

  return (
    <div className="relative">
      {more.start && (
        <MoreArrow
          side="start"
          onClick={() => {
            page("start");
          }}
        />
      )}
      {more.end && (
        <MoreArrow
          side="end"
          onClick={() => {
            page("end");
          }}
        />
      )}
      <div
        ref={list}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        onScroll={measure}
        data-more-start={more.start ? "" : undefined}
        data-more-end={more.end ? "" : undefined}
        style={fadeMask(more)}
        className="flex gap-1.5 overflow-x-auto"
      >
        {tabs.map((tab) => {
          const selected = tab.key === active;
          return (
            <button
              key={tab.key}
              id={`${idPrefix}-tab-${tab.key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel-${tab.key}`}
              aria-label={
                tab.description === undefined
                  ? undefined
                  : `${tab.label}, ${tab.description}`
              }
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                onSelect(tab.key);
              }}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 whitespace-nowrap ${
                selected
                  ? "border-accent bg-accent-soft text-ink"
                  : `bg-surface ${TONES[tab.tone ?? "muted"]} hover:bg-surface-sunken`
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.mark}
            </button>
          );
        })}
      </div>
    </div>
  );
}
