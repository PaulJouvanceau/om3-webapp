/*
 * A typed section of the cluster configuration, `[<section>#<name>]`, a network or a
 * pool, as the wizards and the configuration tabs write it: its types and fields, read
 * from the keywords the daemon declares (GET /api/cluster/config/keywords), the
 * operations writing it (PATCH /api/cluster/config), the section they write.
 */

import { continued as continuedValue, isContinuationLine, lineValue } from "./ini";

/** A keyword as the daemon describes it; the fields the wizard reads. */
export interface Keyword {
  section?: string;
  option: string;
  types?: string[] | null;
  text?: string;
  default?: string;
  defaultText?: string;
  example?: string;
  candidates?: string[] | null;
  converter?: string;
  required?: boolean;
  scopable?: boolean;
}

/**
 * A field of the wizard, a keyword of the section. `perNode`, one a node, scoped
 * (`subnet@n1`): a value the same on every node would not do. `kind`, its control.
 */
export interface SectionField {
  key: string;
  keyword: Keyword;
  kind: "text" | "number" | "bool" | "choice" | "choices" | "list";
  perNode: boolean;
  required: boolean;
}

/** The keys of the section, `key` or `key@node`, and their values; empty when not set. */
export type SectionValues = Record<string, string>;

/**
 * What a section asks beyond its keywords: `perNode`, the keywords of a type taken on
 * each node apart; `order`, those asked first, in this order, the others after them by
 * name; `required`, those required though the daemon does not say so.
 */
export interface SectionRules {
  perNode?: Record<string, string[]>;
  order?: string[];
  required?: string[];
}

/** A name of a section: `<section>#<name>`, its keys `<section>#<name>.<key>`, so no dot. */
export const SECTION_NAME = /^[A-Za-z0-9_-]+$/;

/** The keywords of a section. */
export function sectionKeywords(keywords: Keyword[], section: string): Keyword[] {
  return keywords.filter((k) => k.section === section);
}

/** The types of a section, as its `type` keyword lists them; its default given. */
export function sectionTypes(keywords: Keyword[], section: string): { types: string[]; default?: string } {
  const type = sectionKeywords(keywords, section).find((k) => k.option === "type");
  return { types: type?.candidates ?? [], default: type?.default || undefined };
}

/**
 * What each type is, as the `type` keyword says it in its list, a type an item:
 * "* `lan`: ranges of a segment…", its continuation lines indented.
 */
export function typeDescriptions(keywords: Keyword[], section: string): Record<string, string> {
  const text = sectionKeywords(keywords, section).find((k) => k.option === "type")?.text ?? "";
  const out: Record<string, string> = {};
  let current: string | null = null;
  for (const line of text.split("\n")) {
    const item = /^\*\s+`([^`]+)`:\s*(.*)$/.exec(line);
    if (item) {
      current = item[1];
      out[current] = item[2].trim();
    } else if (current && /^\s+\S/.test(line)) {
      out[current] += ` ${line.trim()}`;
    } else {
      current = null;
    }
  }
  return out;
}

/** The words om reads as true in a boolean keyword. */
const TRUE_WORDS = new Set(["true", "yes", "y", "on", "1", "t"]);

/** Whether a boolean keyword is on: its value written, else its default. */
export const boolOn = (value: string | undefined, fallback?: unknown): boolean =>
  TRUE_WORDS.has(String(value?.trim() ? value : (fallback ?? "")).trim().toLowerCase());

/**
 * What a boolean field writes, checked or not: nothing where it is the default, the
 * keyword unset back to it; "true" or "false" where it is not, a "false" kept where
 * the default is true.
 */
export const boolWrite = (checked: boolean, fallback?: unknown): string =>
  checked === boolOn("", fallback) ? "" : String(checked);

/** The first paragraph of a help text: a hint under a field, the rest in the keyword reference. */
export const firstParagraph = (text?: string) => (text ?? "").split(/\n\s*\n/)[0].replace(/\s*\n\s*/g, " ").trim();

const kindOf = (k: Keyword): SectionField["kind"] => {
  const list = k.converter === "list" || k.converter === "converters.List";
  if (k.candidates && k.candidates.length > 0) return list ? "choices" : "choice";
  if (k.converter === "bool" || k.converter === "converters.Bool") return "bool";
  if (k.converter === "int" || k.converter === "converters.Int") return "number";
  return list ? "list" : "text";
};

/**
 * The fields of a type: the keywords of the section it has (`types` naming it, or
 * none, those of every type), the type itself left out, asked by the first step.
 */
export function sectionFields(keywords: Keyword[], section: string, type: string, rules: SectionRules = {}): SectionField[] {
  const order = rules.order ?? [];
  const rank = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length);
  return sectionKeywords(keywords, section)
    .filter((k) => k.option !== "type" && (!k.types || k.types.length === 0 || k.types.includes(type)))
    .map((k) => ({
      key: k.option,
      keyword: k,
      kind: kindOf(k),
      perNode: (rules.perNode?.[type] ?? []).includes(k.option),
      required: Boolean(k.required) || (rules.required ?? []).includes(k.option),
    }))
    // The required first, then in the order asked, then by name.
    .sort((a, b) => Number(b.required) - Number(a.required) || rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
}

/** The fields required and left empty: a per-node one, on any of the nodes. */
export function missingFields(fields: SectionField[], values: SectionValues, nodes: string[]): string[] {
  const empty = (key: string) => !(values[key] ?? "").trim();
  return fields
    .filter((f) => f.required && (f.perNode ? nodes.some((n) => empty(`${f.key}@${n}`)) : empty(f.key)))
    .map((f) => f.key);
}

/** The keys set, the type first, then by name, a key before its scoped values. */
function entries(type: string, values: SectionValues): [string, string][] {
  return [
    ["type", type] as [string, string],
    ...Object.entries(values)
      .filter(([key, value]) => key !== "type" && value.trim() !== "")
      .map(([key, value]) => [key, value.trim()] as [string, string])
      .sort(([a], [b]) => a.localeCompare(b)),
  ];
}

/** The operations writing a new section: its keys set, the type first, the driver read before them. */
export function sectionOps(section: string, name: string, type: string, values: SectionValues): string[] {
  return entries(type, values).map(([key, value]) => `${section}#${name}.${key}=${value}`);
}

/** The section as it will read once written. */
export function sectionPreview(section: string, name: string, type: string, values: SectionValues): string {
  return [`[${section}#${name}]`, ...entries(type, values).map(([key, value]) => `${key} = ${value}`)].join("\n");
}

/** A line of a section: `key = value`, the key scoped to a node or not (`subnet@n1`). */
const BODY_LINE = /^\s*([A-Za-z0-9_]+(?:@[A-Za-z0-9_.-]+)?)\s*=(.*)$/;
const IGNORED_LINE = /^\s*([#;].*)?$/;

/** The body of a section as written: its lines but its header. */
export function sectionBody(section: string | null): string {
  return (section ?? "")
    .split("\n")
    .filter((line) => !/^\s*\[[^\]]+\]\s*$/.test(line))
    .join("\n")
    .trim();
}

/**
 * The keys of a body and their values, as om3 reads them (lineValue): an inline
 * comment not in the value; the lines that are none, blank and comments aside. A value
 * continued on the lines under its key holds them, one a line.
 */
export function parseBody(body: string): { values: SectionValues; invalid: string[] } {
  const values: SectionValues = {};
  const invalid: string[] = [];
  let continued: string | null = null;
  for (const line of body.split("\n")) {
    if (continued !== null && isContinuationLine(line)) {
      values[continued] = continuedValue(values[continued], line);
      continue;
    }
    const match = BODY_LINE.exec(line);
    continued = match ? match[1] : null;
    if (match) values[match[1]] = lineValue(match[2]);
    else if (!IGNORED_LINE.test(line)) invalid.push(line.trim());
  }
  return { values, invalid };
}

/**
 * The operations an edit of a section makes (PATCH /api/cluster/config): the keys
 * changed or added set, the type first, those gone unset; the others, and the comments
 * of the file, left alone.
 */
export function bodyOps(section: string, name: string, before: string, after: string): { set: string[]; unset: string[]; invalid: string[] } {
  const old = parseBody(before).values;
  const { values, invalid } = parseBody(after);
  const set = Object.entries(values)
    .filter(([key, value]) => old[key] !== value)
    .sort(([a], [b]) => Number(a !== "type") - Number(b !== "type") || a.localeCompare(b))
    .map(([key, value]) => `${section}#${name}.${key}=${value}`);
  const unset = Object.keys(old)
    .filter((key) => !(key in values))
    .sort()
    .map((key) => `${section}#${name}.${key}`);
  return { set, unset, invalid };
}

/**
 * The operations a modification of a section by the wizard makes: from the keys it had
 * (`original`) to those the wizard gives (`values`), on the fields of its type
 * (`fields`). The same type: the fields changed set, those emptied unset, the other
 * keys of the section left alone. Another type, the keys of the former meaning nothing
 * to it: the section deleted first (`rewrite`), then the keys of the new one set.
 */
export function editOps(
  section: string,
  name: string,
  type: string,
  original: SectionValues,
  values: SectionValues,
  fields: string[],
): { rewrite: boolean; set: string[]; unset: string[] } {
  const isField = (key: string) => fields.includes(key.split("@")[0]);
  const own = Object.fromEntries(Object.entries(values).filter(([key]) => isField(key)));
  const rewrite = Boolean(original.type) && original.type !== type;
  if (rewrite) return { rewrite, set: sectionOps(section, name, type, own), unset: [] };
  const set: string[] = [];
  const unset: string[] = [];
  if (!original.type) set.push(`${section}#${name}.type=${type}`);
  for (const [key, raw] of Object.entries(own).sort(([a], [b]) => a.localeCompare(b))) {
    const value = raw.trim();
    if (value === "") {
      if (key in original) unset.push(`${section}#${name}.${key}`);
    } else if (original[key] !== value) {
      set.push(`${section}#${name}.${key}=${value}`);
    }
  }
  return { rewrite, set, unset };
}

/** A section as it will read once modified. */
export function editPreview(section: string, name: string, type: string, original: SectionValues, values: SectionValues, fields: string[]): string {
  const { rewrite } = editOps(section, name, type, original, values, fields);
  const isField = (key: string) => fields.includes(key.split("@")[0]);
  const result: SectionValues = rewrite ? {} : { ...original };
  delete result.type;
  for (const [key, raw] of Object.entries(values)) {
    if (!isField(key)) continue;
    if (raw.trim() === "") delete result[key];
    else result[key] = raw.trim();
  }
  return sectionPreview(section, name, type, result);
}
