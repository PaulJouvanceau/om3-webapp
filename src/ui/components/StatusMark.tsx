import { useTranslation } from "react-i18next";
import { cn } from "../cn";
import { STATE_LABEL_KEYS, type ObjectState } from "./StatusBadge";
import { StateGlyph } from "./StateGlyph";

/** The tints of `StatusBadge`; the shape (`StateGlyph`) tells the state without colour. */
const MARKS: Record<ObjectState, { ink: string }> = {
  up: { ink: "text-state-up" },
  warn: { ink: "text-state-warn" },
  down: { ink: "text-state-down" },
  unknown: { ink: "text-state-unknown" },
};

/**
 * The glyph of a state without its label, where the column or the row already says
 * what it is about: a status column, a count beside it. The label stays for screen
 * readers and as a tooltip; `label` replaces it when the value is more precise
 * ("running", "stale", "stdby up").
 */
export function StatusMark({
  state,
  label,
  className,
}: {
  state: ObjectState;
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const mark = MARKS[state];
  const text = label ?? t(STATE_LABEL_KEYS[state]);
  return (
    <span
      title={text}
      data-state={state}
      className={cn("inline-flex w-4 shrink-0 items-center justify-center", mark.ink, className)}
    >
      <StateGlyph state={state} />
      <span className="sr-only">{text}</span>
    </span>
  );
}
