import {INSTANCE_ACTIONS, OBJECT_ACTIONS, RESOURCE_ACTIONS} from "../constants/actions";

/**
 * The menus of the actions on objects, instances and resources, as the node actions
 * menu (`node-actions.js`): each action says what it does, the destructive ones red,
 * those of objects (by the grant they ask) and instances grouped under headings, in
 * a masonry.
 */

/**
 * The groups of the actions, in the order of their menus, by the grant om3 asks for
 * them: operator to run and move, admin to change what it is made of, its
 * configuration, its existence. Those of an instance an operator asks for, by what
 * they act on: the instance, its disks, its tasks, its replication; its process
 * groups apart among the admin ones.
 */
export const ACTION_GROUPS = {
    object: ["operator", "admin"],
    instance: ["operatorInstance", "operatorDisk", "operatorTask", "operatorSync", "admin", "adminPg"],
    resource: ["operator", "operatorDisk", "operatorTask", "operatorSync", "admin"],
};

const DEFS = {object: OBJECT_ACTIONS, instance: INSTANCE_ACTIONS, resource: RESOURCE_ACTIONS};

/**
 * An action not in the lists, the clear of a failed instance monitor: its group, and
 * the action it comes after.
 */
const EXTRA = {clear: {group: "operatorInstance", after: "unfreeze"}};

/** The tint of the badge of each impact of an action. */
const IMPACT_TONE = {dataLoss: "down", downTime: "warn"};

/** The badges of what an action costs (`impacts`): data-loss, down-time. */
export function impactBadges(t, impacts = []) {
    return impacts.map((key) => ({key, label: t(`actionMenus.impacts.${key}`), tone: IMPACT_TONE[key] ?? "warn"}));
}

/**
 * The names of an action as the API and om say it, for the filter of its menu: its
 * name, and its endpoint without the "action/" of the path, its slashes spaces
 * ("startstandby", "pg reset", "push asset", "daemon restart", "update" of sync update).
 */
export function actionKeywords(action) {
    if (action === undefined) return [];
    const words = [action.name];
    if (action.endpoint) words.push(action.endpoint.replace(/(^|\/)action\//g, "$1").replace(/\//g, " "));
    if (action.cluster) words.push(action.cluster);
    return [...new Set(words.filter(Boolean))];
}

/** The key of an action in the translations: "sync update" → "syncUpdate". */
export const keyOf = (name) => name.replace(/\s+(\w)/g, (_, c) => c.toUpperCase());

/**
 * What the action `name` does, on an object, an instance or a resource (`scope`), as
 * om says it; undefined when it needs no word. `variant`, its words for what it acts
 * on when they differ ("Store", the sync of a store, a backup; `syncVariant`), its
 * plain words when it has none for it.
 */
export function actionDescription(t, scope, name, variant = "") {
    if (typeof name !== "string" || name === "") return undefined;
    const key = `actionMenus.${scope}.${keyOf(name)}`;
    return (variant && t(`${key}${variant}`, {defaultValue: ""})) || t(key, {defaultValue: ""}) || undefined;
}

/**
 * The entries of an actions menu, given as built by the menu (`key` the action
 * name): in the order of their groups, the first of each under its heading, each
 * with what it does and what it costs, the destructive ones red.
 */
export function explainedItems(t, scope, items) {
    const defs = DEFS[scope] ?? [];
    const order = ACTION_GROUPS[scope];
    const groupOf = (name) => defs.find((a) => a.name === name)?.group ?? EXTRA[name]?.group;
    const rank = (item) => {
        const at = order?.indexOf(groupOf(item.key)) ?? -1;
        return at < 0 ? Number.MAX_SAFE_INTEGER : at;
    };
    // Within a group, the order of the list; one not in it right after its anchor.
    const place = (item) => {
        const at = defs.findIndex((a) => a.name === item.key);
        if (at >= 0) return at;
        const after = defs.findIndex((a) => a.name === EXTRA[item.key]?.after);
        return after >= 0 ? after + 0.5 : Number.MAX_SAFE_INTEGER;
    };
    // Sorted by group, then by the order of the list, the order given last.
    const sorted = order === undefined ? items : items.map((item, at) => ({item, at}))
        .sort((a, b) => rank(a.item) - rank(b.item) || place(a.item) - place(b.item) || a.at - b.at)
        .map(({item}) => item);
    let last;
    return sorted.map((item) => {
        const group = groupOf(item.key);
        const def = defs.find((a) => a.name === item.key);
        const out = {
            ...item,
            description: item.description ?? actionDescription(t, scope, item.key),
            danger: item.danger ?? def?.color === "red",
            badges: item.badges ?? impactBadges(t, def?.impacts),
            keywords: item.keywords ?? actionKeywords(def ?? {name: item.key}),
        };
        if (order !== undefined && group !== undefined && group !== last) out.heading = t(`actionMenus.groups.${group}`);
        last = group;
        return out;
    });
}

/** The columns of the masonry of a menu: none for a single group, three for many. */
export function menuColumns(items) {
    const headings = items.filter((item) => item.heading !== undefined).length;
    if (headings < 2) return undefined;
    return headings > 4 ? 3 : 2;
}

/** Entries enough for a menu to be filtered rather than read through. */
const FILTER_FROM = 7;

/**
 * The filter of an actions menu (`MenuButton`), offered on a menu long enough:
 * focused on opening, typing then Down then Enter chooses an action.
 */
export function menuFilter(t, items) {
    return {
        filterable: items.length >= FILTER_FROM,
        filterLabel: t("actionMenus.filter"),
        filterEmpty: t("actionMenus.noMatch"),
    };
}

/** The props of an actions menu (`MenuButton`): its entries explained, their masonry, their filter. */
export function explainedMenu(t, scope, items) {
    const explained = explainedItems(t, scope, items);
    return {items: explained, columns: menuColumns(explained), ...menuFilter(t, explained)};
}
