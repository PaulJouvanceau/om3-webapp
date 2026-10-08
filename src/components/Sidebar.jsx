import {useState, useCallback} from "react";
import {Link, NavLink} from "react-router-dom";
import {cn} from "../ui/cn";
import {ObjectIcon} from "../ui/components/ObjectIcon";
import useSidebarAlerts from "../hooks/useSidebarAlerts";

// Icons of the oc3 menu, glyph and tint (ObjectIcon): nodes, networks, pools as
// disks, objects as services, and the om3 kinds drawn from the same set.
// The cluster overview and the user page are reached from the top bar: the logo
// and the user button. Entries in alphabetical order.
// Kinds and namespaces group the objects: they sit under the Objects entry.
export const NAV_ROUTES = [
    {path: "/heartbeats", name: "Heartbeats", kind: "heartbeat"},
    {path: "/network", name: "Networks", kind: "network"},
    {path: "/nodes", name: "Nodes", kind: "node"},
    {
        path: "/objects", name: "Objects", kind: "service",
        children: [
            {path: "/kinds", name: "Kinds", kind: "kind"},
            {path: "/namespaces", name: "Namespaces", kind: "namespace"},
        ],
    },
    {path: "/pools", name: "Pools", kind: "pool"},
];

// Pill colours: the oc3 state colours, and the oc3 frozen tint (FrozenMark).
// `label` says what a count of this state is, unless the entry says otherwise.
export const PILLS = {
    up: {className: "bg-state-up", label: "up"},
    warn: {className: "bg-state-warn", label: "warn"},
    down: {className: "bg-state-down", label: "down"},
    unknown: {className: "bg-state-unknown", label: "n/a"},
    frozen: {className: "bg-icon-network", label: "frozen"},
};

/** Labels of the counts whose state alone does not say what they are. */
const COUNT_LABELS = {
    "/heartbeats": {up: "beating", down: "stale or stopped"},
    "/pools": {down: "full"},
    "/network": {down: "full"},
};

/** Objects page filter value of each pill state, for the pills of the Objects entry. */
const OBJECTS_FILTER = {up: "up", warn: "warn", down: "down", unknown: "n/a"};

// A segment of the pill: the pill itself rounds the ends of the first and last ones.
const SEGMENT =
    "inline-flex h-4 min-w-5 items-center justify-center px-1 text-[0.6875rem] leading-none font-semibold text-surface-raised tabular-nums";

/**
 * Pill numbering the items of an entry by state, one coloured segment per state. The text takes the
 * raised surface colour, light on the state colours in light mode and dark on
 * their lightened dark mode versions, as the oc3 confirm button does.
 *
 * The pill sits over the right end of the menu link rather than inside it: the
 * segments of the Objects entry are links of their own, to the Objects page
 * filtered on their state, and a link cannot hold another one. The other segments
 * let the clicks through to the menu link under them.
 */
function CountPills({path, counts}) {
    return (
        <span
            data-testid={`counts-${path.slice(1)}`}
            className="pointer-events-none absolute top-1/2 right-2 flex -translate-y-1/2 overflow-hidden rounded-full"
        >
            {counts.map(({state, count}) => {
                const label = COUNT_LABELS[path]?.[state] ?? PILLS[state].label;
                const className = cn(SEGMENT, PILLS[state].className);
                const filter = path === "/objects" ? OBJECTS_FILTER[state] : undefined;
                if (filter) {
                    return (
                        <Link
                            key={state}
                            to={`/objects?globalState=${encodeURIComponent(filter)}`}
                            data-state={state}
                            title={`Show the ${label} objects`}
                            className={cn(className, "pointer-events-auto hover:brightness-110")}
                        >
                            {count}
                            <span className="sr-only"> {label}, show them</span>
                        </Link>
                    );
                }
                return (
                    <span key={state} data-state={state} title={`${count} ${label}`} className={className}>
                        {count}
                        <span className="sr-only"> {label}</span>
                    </span>
                );
            })}
        </span>
    );
}

const SIDEBAR_KEY = "om3.sidebar";

/** Folding the menu is a display comfort, specific to the browser: it does not go in the URL. */
function readSidebarOpen() {
    try {
        return localStorage.getItem(SIDEBAR_KEY) !== "closed";
    } catch {
        // Private browsing or storage refused: the menu opens, as by default.
        return true;
    }
}

/** Open state of the sidebar, remembered in local storage. */
export function useSidebarOpen() {
    const [open, setOpen] = useState(readSidebarOpen);
    const toggle = useCallback(() => {
        setOpen((previous) => {
            const next = !previous;
            try {
                localStorage.setItem(SIDEBAR_KEY, next ? "open" : "closed");
            } catch {
                // Preference not remembered: without consequence for the current session.
            }
            return next;
        });
    }, []);
    return [open, toggle];
}

const LINK = "flex items-center gap-2 rounded-(--radius-control) px-2 py-1 text-ink-muted hover:text-ink";

/**
 * Entries of the menu; the children of an entry are listed under it, indented
 * along a line that ties them to it.
 */
function NavList({routes, alerts, nested = false}) {
    return (
        <ul className={cn(nested && "ml-4 border-l border-line pl-1")}>
            {routes.map(({path, name, kind, children}) => (
                <li key={path}>
                    <div className="relative">
                        <NavLink
                            to={path}
                            // Mouseover details of the entries that have some.
                            title={alerts[path]?.details?.join("\n")}
                            className={({isActive}) => cn(LINK, isActive && "bg-accent-soft text-ink")}
                        >
                            {/* The icon keeps its tint in every state: it identifies the view,
                                the background and the label mark the selection. */}
                            <ObjectIcon kind={kind} className="h-4 w-4"/>
                            {name}
                        </NavLink>
                        {alerts[path]?.counts?.length > 0 && (
                            <CountPills path={path} counts={alerts[path].counts}/>
                        )}
                    </div>
                    {children && <NavList routes={children} alerts={alerts} nested/>}
                </li>
            ))}
        </ul>
    );
}

/**
 * Side menu, after the oc3 one. Foldable from the button at the top left of the
 * header: folded, it keeps its place in the layout but not its width, and `inert`
 * takes it out of the keyboard path.
 */
export function Sidebar({open}) {
    const alerts = useSidebarAlerts();
    return (
        <aside
            id="app-sidebar"
            inert={!open}
            className={cn(
                "shrink-0 overflow-x-hidden overflow-y-auto border-r border-line bg-surface-raised transition-[width] duration-200 ease-out",
                open ? "w-60" : "w-0 border-r-0"
            )}
        >
            <nav aria-label="Main" className="w-60 p-2">
                <NavList routes={NAV_ROUTES} alerts={alerts}/>
            </nav>
        </aside>
    );
}
