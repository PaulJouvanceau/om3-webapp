/*
 * What a configuration write asks of the daemon besides the configuration, as
 * om config update --wait --force does:
 *
 * - wait, always: the answer held until the configuration has reached every live
 *   node of the object, the nodes down getting it when they come back. A wait
 *   that expires is answered 408: the configuration is written all the same, the
 *   nodes it has not reached named. Not to be written again.
 * - force: root writes what the daemon refuses otherwise: a change a resource up
 *   would leak by, as a new mount point or the removal of its section (403), a
 *   value another object's resources hold on the same node (409, "Held by
 *   another object"). A creation forced replaces an object that exists (409).
 * - unmodified since, of an edit: the write made on the configuration read at that
 *   time (OM-Last-Modified), refused (412) if someone wrote it since, the read and
 *   the write one step for the daemon.
 */

/** How long a write waits for the configuration to reach the nodes, the request held meanwhile. */
export const CONFIG_WAIT = "30s";

/** The header the daemon tells the time of a configuration read in. */
export const LAST_MODIFIED_HEADER = "OM-Last-Modified";

/** The status of a write refused, the configuration written since the one read (if_unmodified_since). */
export const STATUS_MODIFIED = 412;

/** The title of the refusal of a value another object's resources hold (api.ProblemTitleHeld). */
export const PROBLEM_TITLE_HELD = "Held by another object";

/** A refusal as the daemon describes it. */
export interface Problem {
  status: number;
  title?: string;
  detail?: string;
}

/** Reads the problem of a refused write, the response left to read again. */
export async function readProblem(response: Response): Promise<Problem> {
  try {
    const problem = (await response.clone().json()) as { title?: string; detail?: string } | null;
    return { status: response.status, title: problem?.title, detail: problem?.detail };
  } catch {
    return { status: response.status };
  }
}

/**
 * Who force lets write what the daemon refused: "root" for a change a resource up
 * would leak by or a value held by another object, "anyone" for a creation over
 * an object that exists, null when force changes nothing of it (a configuration
 * invalid, changed meanwhile, a grant missing).
 */
export function forceLifts(problem: Problem, { creating = false } = {}): "root" | "anyone" | null {
  const detail = problem.detail ?? "";
  if (problem.status === 409 && problem.title === PROBLEM_TITLE_HELD) return "root";
  if (problem.status === 409 && creating && problem.title === "Conflict") return "anyone";
  if (problem.status === 403 && detail !== "" && !detail.startsWith("Config validation") && !detail.includes("grant")) {
    return "root";
  }
  return null;
}

/** What a write asks besides its wait: force, and the time of the configuration it was made on. */
export interface WriteOptions {
  force?: boolean;
  unmodifiedSince?: string | null;
}

/** The query parameters of a write: its wait, always, its force, and the time of its read. */
export function writeParams({ force, unmodifiedSince }: WriteOptions = {}): URLSearchParams {
  const params = new URLSearchParams();
  params.append("wait", CONFIG_WAIT);
  if (force) params.append("force", "true");
  if (unmodifiedSince) params.append("if_unmodified_since", unmodifiedSince);
  return params;
}

/** `url` with the parameters of the write appended to its own. */
export function withWriteParams(url: string, write: WriteOptions = {}): string {
  const extra = writeParams(write).toString();
  return `${url}${url.includes("?") ? "&" : "?"}${extra}`;
}
