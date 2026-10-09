import { useTranslation } from "react-i18next";
import { HistoryIcon, StopIcon } from "../icons";

const ZERO_TIME = "0001-01-01T00:00:00Z";

/** Whether an om3 timestamp is set: present and not the zero time. */
export function hasTimestamp(value: string | undefined | null): value is string {
  return typeof value === "string" && value !== "" && value !== ZERO_TIME;
}

/**
 * Stopped instance: the stop square in muted ink, the stop date in the tooltip.
 * `label` names it for assistive technologies ("Instance on node n1 is stopped").
 */
export function StoppedMark({ stoppedAt, label }: { stoppedAt?: string | null; label?: string }) {
  const { t, i18n } = useTranslation();
  const title = hasTimestamp(stoppedAt)
    ? t("ui.stateMarks.stoppedAt", { date: new Date(stoppedAt).toLocaleString(i18n.language) })
    : t("ui.stateMarks.stoppedTitle");
  return (
    <span role="img" aria-label={label ?? t("ui.stateMarks.stopped")} title={title} className="inline-flex cursor-help text-ink-muted">
      <StopIcon className="h-3.5 w-3.5" />
    </span>
  );
}

/**
 * RPO breached: the replica lags behind its recovery point objective. The history
 * clock, in the warn colour.
 */
export function RpoBreachedMark({ label }: { label?: string }) {
  const { t } = useTranslation();
  const text = t("ui.stateMarks.rpoBreached");
  return (
    <span role="img" aria-label={label ?? text} title={text} className="inline-flex text-state-warn">
      <HistoryIcon className="h-3.5 w-3.5" />
    </span>
  );
}
