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
export const surrounded = (s: string, quote: string): boolean =>
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
  const value = trimEnd(line);
  if (value.endsWith("\\")) return value;
  const bare = uncommented(value);
  return surrounded(bare, "'") || surrounded(bare, '"') ? bare.slice(1, -1) : bare;
}

/** A value trimmed, up to its inline comment: " #" first, " ;" only when there is none, as om3 looks for them. */
function uncommented(value: string): string {
  let comment = value.indexOf(" #");
  if (comment < 0) comment = value.indexOf(" ;");
  return comment >= 0 ? trimEnd(value.slice(0, comment)) : value;
}

/**
 * The lines a value read from the key line `rest` follows on, its delimiter cut, as
 * om3 reads them (readValue): "indented", those indented under it, a blank one or
 * one at the margin ending it; a quote, those up to the one holding it, the value
 * opened by it and not closed on its line; "backslash", those up to one not ending
 * with a backslash, or a blank one; "none", the value on its line alone, quoted by a
 * pair of quotes.
 */
function valueSpan(rest: string): "indented" | "backslash" | "none" | { quote: string } {
  const line = trimStart(rest);
  if (line === "") return "indented";
  for (const quote of ['"""', "`"]) {
    if (line.startsWith(quote) && (quote === "`" || line.length > 3)) {
      return line.lastIndexOf(quote) >= quote.length ? "none" : { quote };
    }
  }
  const value = trimEnd(line);
  if (value.endsWith("\\")) return "backslash";
  // Between a pair of quotes: the value on its line alone.
  const bare = uncommented(value);
  return surrounded(bare, "'") || surrounded(bare, '"') ? "none" : "indented";
}

/**
 * The section each line of a file opens, as om3 reads it (util/ini parse): a line
 * the value of a key above does not take, starting with "[", its name up to the last
 * "]" on it, trimmed; null for the others. An indented "[1, 2]" under a key, or a
 * "[ -d /srv ]" in a quoted value, is the value's: no section.
 */
export function sectionHeaders(lines: string[]): (string | null)[] {
  const headers: (string | null)[] = lines.map(() => null);
  let i = 0;
  while (i < lines.length) {
    const trimmed = trimStart(lines[i]);
    i++;
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
    if (trimmed.startsWith("[")) {
      const close = trimmed.lastIndexOf("]");
      if (close > 0) headers[i - 1] = trimmed.slice(1, close).trim();
      continue;
    }
    const delimiter = trimmed.search(/[=:]/);
    if (delimiter < 0) continue;
    const span = valueSpan(trimmed.slice(delimiter + 1));
    if (span === "indented") {
      while (i < lines.length && isContinuationLine(lines[i])) i++;
    } else if (span === "backslash") {
      while (i < lines.length) {
        const next = lines[i].trim();
        i++;
        if (next === "" || !next.endsWith("\\")) break;
      }
    } else if (span !== "none") {
      while (i < lines.length && !lines[i].includes(span.quote)) i++;
      i++;
    }
  }
  return headers;
}
