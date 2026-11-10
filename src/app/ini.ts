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
