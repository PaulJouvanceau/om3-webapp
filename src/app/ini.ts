/*
 * What the configuration files read as om3 reads them (util/ini, with
 * AllowPythonMultilineValues), for the parsers of their sections here.
 */

/**
 * Whether a line continues the value of the key above it: one starting with a
 * space, a tab or a form feed, kept whole in the value, its indent too. A blank
 * line, or one at the margin, a comment there included, ends the value.
 */
export const isContinuationLine = (line: string): boolean => /^[ \t\f]/.test(line);

/** A value with a line continuing it: the lines joined as om3 joins them. */
export const continued = (value: string, line: string): string => `${value}\n${line}`;

/** What `unicode.IsSpace` strips, as om3 trims a value: the Unicode spaces, U+0085 and U+00A0 too. */
const trimStart = (s: string): string => s.replace(/^[\s\u0085]+/, "");
const trimEnd = (s: string): string => s.replace(/[\s\u0085]+$/, "");

/** Whether a value is a pair of `quote` around what holds no other. */
const surrounded = (s: string, quote: string): boolean =>
  s.length >= 2 && s.startsWith(quote) && s.endsWith(quote) && s.indexOf(quote, 1) === s.length - 1;

/**
 * The value of a key line, what follows its `=`, as om3 reads it (readValue, with
 * SpaceBeforeInlineComment): quoted by "\"\"\"" or a backquote, what they enclose;
 * else up to an inline comment, a `#` or a `;` after a space, the comment left out;
 * then a pair of single or double quotes around it stripped. A value continued by a
 * backslash, or a quote not closed on its line, as written: none read here.
 */
export function lineValue(raw: string): string {
  const line = trimStart(raw);
  for (const quote of ['"""', "`"]) {
    if (line.startsWith(quote) && (quote === "`" || line.length > 3)) {
      const end = line.lastIndexOf(quote);
      return end >= quote.length ? line.slice(quote.length, end) : trimEnd(line);
    }
  }
  let value = trimEnd(line);
  if (value.endsWith("\\")) return value;
  // " #" first, " ;" only when there is none, as om3 looks for them.
  let comment = value.indexOf(" #");
  if (comment < 0) comment = value.indexOf(" ;");
  if (comment >= 0) value = trimEnd(value.slice(0, comment));
  return surrounded(value, "'") || surrounded(value, '"') ? value.slice(1, -1) : value;
}
