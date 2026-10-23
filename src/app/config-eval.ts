/*
 * A configuration evaluated, as om <path> config eval and config get --eval
 * --impersonate <node> show it: each keyword, its value as written, and what it
 * evaluates to on a node, its references dereferenced, its scope applied, its
 * value converted (GET <config>?evaluate=true[&impersonate=<node>][&kw=...]).
 *
 * The daemon answers the keywords asked in clear, the secrets the redacted file
 * masks too: the keywords the redacted file masks are the ones masked here.
 */

/** A keyword as the daemon answers it evaluated. */
export interface EvaluatedKeyword {
  keyword: string;
  value: string;
  evaluated?: unknown;
  evaluated_text?: string;
  evaluated_as?: string;
  /** Why it could not be evaluated, the whole configuration asked (a reference unresolved). */
  error?: string;
}

/** The mask of a secret in a redacted configuration file. */
export const SECRET_MASK = "********";

/** The patterns typed, split on blanks and commas: a keyword, or a pattern of keywords ("fs#1.*", "cont*.stop_*"). */
export const keywordPatterns = (text: string) =>
  text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");

/** The query of an evaluation as `node` (the node answering, when none), of the keywords `patterns` (the keywords set, when none). */
export function evalQuery(node: string, patterns: string[]): string {
  const params = new URLSearchParams({ evaluate: "true" });
  if (node !== "") params.append("impersonate", node);
  patterns.forEach((p) => params.append("kw", p));
  return params.toString();
}

/**
 * The keywords a redacted configuration file masks, named as the daemon names
 * them: the options of DEFAULT bare ("nodes"), the others by their section
 * ("data.password", "cluster.secret").
 */
export function maskedKeywords(redacted: string): Set<string> {
  const masked = new Set<string>();
  let section = "DEFAULT";
  for (const raw of redacted.split("\n")) {
    const line = raw.trim();
    const header = /^\[(.+)\]$/.exec(line);
    if (header?.[1] !== undefined) {
      section = header[1].trim();
      continue;
    }
    const kv = /^([^=#;\s][^=]*?)\s*=\s*(.*)$/.exec(line);
    if (kv?.[1] === undefined || kv[2] !== SECRET_MASK) continue;
    masked.add(section === "DEFAULT" ? kv[1] : `${section}.${kv[1]}`);
  }
  return masked;
}

/** What a keyword evaluates to, in words: the text the daemon gives, else the value converted. */
export function evaluatedText(item: EvaluatedKeyword): string {
  if (typeof item.evaluated_text === "string") return item.evaluated_text;
  if (item.evaluated === undefined || item.evaluated === null) return "";
  return typeof item.evaluated === "string" ? item.evaluated : JSON.stringify(item.evaluated);
}
