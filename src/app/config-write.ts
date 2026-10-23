import { useCallback, useState } from "react";

/*
 * What a configuration write asks of the daemon besides the configuration, as
 * om config update --wait --force does:
 *
 * - wait: the answer held until the configuration has reached every live node
 *   of the object, the nodes down getting it when they come back. A wait that
 *   expires is answered 408: the configuration is written all the same, the
 *   nodes it has not reached named. Not to be written again.
 * - force: root writes what the daemon refuses otherwise: a change a resource up
 *   would leak by, as a new mount point or the removal of its section (403), a
 *   value another object's resources hold on the same node (409, "Held by
 *   another object"). A creation forced replaces an object that exists (409).
 */

/** How long a write waits for the configuration to reach the nodes, the request held meanwhile. */
export const CONFIG_WAIT = "30s";

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

/** The query parameters of a write: its wait, its force. */
export function writeParams({ wait, force }: { wait: boolean; force?: boolean }): URLSearchParams {
  const params = new URLSearchParams();
  if (wait) params.append("wait", CONFIG_WAIT);
  if (force) params.append("force", "true");
  return params;
}

/** `url` with the parameters of the write appended to its own. */
export function withWriteParams(url: string, write: { wait: boolean; force?: boolean }): string {
  const extra = writeParams(write).toString();
  if (extra === "") return url;
  return `${url}${url.includes("?") ? "&" : "?"}${extra}`;
}

const WAIT_KEY = "om3.config.wait";

/** Whether the writes wait for the configuration to reach the nodes: yes unless said otherwise, kept for this browser. */
export function useConfigWait(): [boolean, (wait: boolean) => void] {
  const [wait, setWaitState] = useState(() => {
    try {
      return localStorage.getItem(WAIT_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const setWait = useCallback((value: boolean) => {
    setWaitState(value);
    try {
      localStorage.setItem(WAIT_KEY, String(value));
    } catch {
      // Not kept: asked again next time.
    }
  }, []);
  return [wait, setWait];
}
