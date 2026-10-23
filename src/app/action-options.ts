/*
 * The options of an action, as the om flags of the command set them and the api
 * reads them (daemon/api/api.yaml): `om <path> switch --to n2 --live` is the body
 * {destination: ["n2"], live: true} of the object switch, `om <path> instance start
 * --force --subset db` the query force=true&subset=db of the instance start.
 *
 * An option is
 *
 * - a flag: sent only when set, the daemon defaulting it off;
 * - a node: one of the nodes of the object, none picked leaving the choice to the
 *   daemon (the next preferred node of a switch);
 * - a text: an expression the daemon parses (a subset or tag selector, a resource
 *   id or driver group), or names comma separated;
 * - a list: values the api takes repeated (the sync targets, comma separated as
 *   om takes them; the task env, one per line).
 *
 * `in` says where it goes: the query (the default), or the json body of the
 * actions that read one (the object switch and restart).
 */

export type OptionKind = "flag" | "node" | "text" | "list" | "lines";

export interface ActionOption {
  /** The name the api reads, the label and hint keys of actionOptions too. */
  name: string;
  kind: OptionKind;
  in?: "query" | "body";
}

/** What an action runs on: the object (orchestrated), instances, resources of instances. */
export type ActionScope = "object" | "instance" | "resource";

/** The values set in the form, by option name: a flag true, a text, a node. */
export type OptionValues = Record<string, boolean | string>;

const flag = (name: string, where: "query" | "body" = "query"): ActionOption => ({ name, kind: "flag", in: where });
const text = (name: string): ActionOption => ({ name, kind: "text" });

const FORCE = flag("force");
const DISABLE_ROLLBACK = flag("disable_rollback");
/** Until which resource or driver group the action goes, then the resources it acts on. */
const SELECTORS = [text("to"), text("subset"), text("tag")];

const OBJECT_OPTIONS: Record<string, ActionOption[]> = {
  switch: [
    { name: "destination", kind: "node", in: "body" },
    flag("live", "body"),
    flag("interrupt_syncs", "body"),
  ],
  stop: [flag("interrupt_syncs")],
  restart: [flag("force", "body")],
  provision: [flag("adopt")],
};

// The instance actions by their name in the webapp (constants/actions), as the api
// declares their parameters.
const INSTANCE_OPTIONS: Record<string, ActionOption[]> = {
  start: [FORCE, DISABLE_ROLLBACK, flag("force_affinity"), ...SELECTORS],
  stop: [
    FORCE,
    flag("interrupt_syncs"),
    { name: "move-to", kind: "node" },
    text("sync-to"),
    ...SELECTORS,
  ],
  restart: [FORCE, DISABLE_ROLLBACK, ...SELECTORS],
  shutdown: [FORCE, ...SELECTORS],
  "start standby": [FORCE, DISABLE_ROLLBACK, ...SELECTORS],
  boot: SELECTORS,
  install: [text("subset"), text("tag")],
  prstart: [FORCE, DISABLE_ROLLBACK, ...SELECTORS],
  prstop: [FORCE, DISABLE_ROLLBACK, ...SELECTORS],
  run: [FORCE, flag("confirm"), flag("cron"), { name: "env", kind: "lines" }, ...SELECTORS],
  provision: [FORCE, flag("leader"), DISABLE_ROLLBACK, flag("state_only"), flag("adopt"), flag("preflight"), ...SELECTORS],
  unprovision: [FORCE, flag("leader"), flag("state_only"), ...SELECTORS],
  "pg update": [text("subset"), text("tag")],
  "pg reset": [text("subset"), text("tag")],
  "sync update": [FORCE, { name: "target", kind: "list" }, text("subset"), text("tag")],
  "sync full": [FORCE, { name: "target", kind: "list" }, text("subset"), text("tag")],
  "sync resync": [FORCE, text("subset"), text("tag")],
  "sync split": [FORCE, text("subset"), text("tag")],
  "sync ingest": [text("subset"), text("tag")],
};

/** The selectors a resource action leaves out: its resources are named already. */
const RESOURCE_LEAVES_OUT = ["to", "subset", "tag"];

/** The options of `action` run on `scope`, none for an action that takes none. */
export function actionOptions(action: string, scope: ActionScope): ActionOption[] {
  if (scope === "object") return OBJECT_OPTIONS[action] ?? [];
  const options = INSTANCE_OPTIONS[action] ?? [];
  return scope === "resource" ? options.filter((o) => !RESOURCE_LEAVES_OUT.includes(o.name)) : options;
}

/** The values of a text the user typed, split as the option takes them, the blanks dropped. */
const items = (option: ActionOption, value: string) =>
  value
    .split(option.kind === "lines" ? /\n/ : /,/)
    .map((s) => s.trim())
    .filter((s) => s !== "");

/** Whether an option holds a value to send: a flag set, a text not blank. */
export const isSet = (value: boolean | string | undefined) =>
  value === true || (typeof value === "string" && value.trim() !== "");

/**
 * The query and the body of an action with the options `values` set, as the api
 * reads them: `query` the parameters to append ("" when none), `body` the json
 * body (undefined when none, the action posted without one as before).
 */
export function optionsRequest(
  action: string,
  scope: ActionScope,
  values: OptionValues = {},
): { query: string; body?: Record<string, unknown> } {
  const params = new URLSearchParams();
  const body: Record<string, unknown> = {};
  for (const option of actionOptions(action, scope)) {
    const value = values[option.name];
    if (!isSet(value)) continue;
    if (option.in === "body") {
      // A switch destination is a list of nodes, om switch --to naming one.
      body[option.name] = option.kind === "node" ? [String(value).trim()] : value === true ? true : String(value).trim();
      continue;
    }
    if (value === true) params.append(option.name, "true");
    else if (option.kind === "list" || option.kind === "lines") items(option, String(value)).forEach((v) => params.append(option.name, v));
    else params.append(option.name, String(value).trim());
  }
  // The object switch reads live as required: said off when the body is sent without it.
  if (Object.keys(body).length > 0 && action === "switch" && scope === "object") body.live = body.live === true;
  return { query: params.toString(), ...(Object.keys(body).length > 0 ? { body } : {}) };
}
