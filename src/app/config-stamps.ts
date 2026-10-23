/*
 * The time of the last configuration this webapp wrote of each object, as the
 * daemon answered it in the OM-Last-Modified header of the write (a config file
 * put or posted, a keyword patched, a key written).
 *
 * A write is acknowledged by the node that received it and reaches the peers a
 * moment later: an instance action asked right after would run on the
 * configuration being replaced, on every node but one. Given the time as
 * config_updated_at, the action is refused (409) by an instance holding an older
 * configuration instead, saying so. An older time asks nothing more of it than
 * what it holds: the last one written is kept, for the session.
 */

export const LAST_MODIFIED_HEADER = "OM-Last-Modified";

const stamps = new Map<string, string>();

/** Keeps the time the daemon gave a write of the configuration of `path`, if it gave one. */
export function recordConfigWrite(path: string | undefined, response: Response | undefined) {
  const value = response?.headers?.get?.(LAST_MODIFIED_HEADER);
  if (!path || !value) return;
  const previous = stamps.get(path);
  if (previous === undefined || Date.parse(value) >= Date.parse(previous)) stamps.set(path, value);
}

/** The time of the last configuration of `path` written here, undefined when none was. */
export const configStamp = (path: string) => stamps.get(path);

/** Forgets the times kept (tests, a sign-out). */
export const clearConfigStamps = () => stamps.clear();
