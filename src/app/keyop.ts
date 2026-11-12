/*
 * The keyword operations of a configuration (`set=` of PATCH .../config, POST
 * .../config/file, the cap action) as om3 reads them (core/keyop Parse).
 */

import { surrounded } from "./ini";

/**
 * A value as written in a `set` operation for om3 to read it back as is. Ending with
 * ":", the operation read as a test of the keyword (`key:`, Exist), refused; between a
 * pair of quotes, the pair stripped (ini.Unquote). Those quoted: by double quotes, by
 * single ones when it holds a double one; the others as they are. Holding both, none
 * read back as is: as it is, om3 refusing it or reading it otherwise.
 */
export function opValue(value: string): string {
  const misread = value.endsWith(":") || surrounded(value, "'") || surrounded(value, '"');
  if (!misread) return value;
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  return value;
}

/** The operation setting a keyword to a value: `keyword=value`, the value read back as is. */
export const setOp = (keyword: string, value: string): string => `${keyword}=${opValue(value)}`;
