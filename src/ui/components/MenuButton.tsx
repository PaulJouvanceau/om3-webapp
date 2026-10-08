import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { CaretRightIcon, ChevronDownIcon } from "../icons";

export interface MenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Separator line before this entry, to mark a group. */
  separatorBefore?: boolean;
  /** Entries of a submenu: the entry then opens it rather than being chosen. */
  items?: MenuItem[];
  onSelect?: () => void;
}

const ITEM =
  "flex w-full items-center gap-2 rounded-(--radius-control) px-2 py-1.5 text-left text-ink hover:bg-surface focus:bg-surface focus:outline-none disabled:text-ink-muted/60 disabled:hover:bg-transparent";

/**
 * Button opening an action menu, following the "menu button" pattern of the ARIA
 * APG, like the account menu whose behaviour it reuses: the button announces the
 * menu and its state, opening from the keyboard puts the focus on the first entry,
 * the arrows, Home and End walk through the entries, Escape closes and gives the
 * focus back to the button. A click outside the menu, Tab or choosing an entry close
 * it too.
 *
 * An entry with `items` opens a submenu beside it, by the mouse, Enter, Space or
 * the right arrow; within it the arrows walk its own entries, and the left arrow
 * or Escape give the focus back to the entry that opened it.
 *
 * om3 additions: `icon` makes the trigger an icon alone, `label` staying its
 * accessible name and tooltip; `compact` makes it small and borderless, for a table
 * row; `align="end"` lines the menu up with the right edge of the trigger. The menu
 * is placed against the window, so that a scrolling container (a table) cannot cut
 * it, and closes when the page scrolls or resizes rather than drift from its button.
 */
export function MenuButton({
  label,
  items,
  disabled = false,
  className = "",
  icon,
  compact = false,
  align = "start",
}: {
  label: string;
  items: MenuItem[];
  disabled?: boolean;
  className?: string;
  /** Icon alone in the trigger, instead of the label and the chevron. */
  icon?: ReactNode;
  /** Small borderless trigger, for a table row. */
  compact?: boolean;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // Entry to focus on opening: the first one from the keyboard, none with the mouse.
  const focusOnOpen = useRef<"first" | "last" | null>(null);

  // The entries of the top level only: a submenu walks its own.
  function entries(): HTMLElement[] {
    return [
      ...(menu.current?.querySelectorAll<HTMLElement>(":scope > div > [role=menuitem]") ?? []),
    ];
  }

  // Placed against the window, before the menu is painted: under the trigger, or
  // over it when the room below is short, as for the last rows of a list.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const rect = button.current?.getBoundingClientRect();
    if (rect === undefined) return;
    const horizontal =
      align === "end"
        ? { right: document.documentElement.clientWidth - rect.right }
        : { left: rect.left };
    setPosition({ ...horizontal, ...verticalPlacement(rect, menu.current?.offsetHeight ?? 0) });
    function onMove(event: Event) {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return;
      setOpen(false);
    }
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const target = focusOnOpen.current;
    focusOnOpen.current = null;
    if (target !== null) {
      const list = entries();
      (target === "first" ? list[0] : list[list.length - 1])?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node) || root.current?.contains(event.target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  }

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const target =
      event.key === "ArrowDown" || event.key === "Enter" || event.key === " "
        ? "first"
        : event.key === "ArrowUp"
          ? "last"
          : null;
    if (target === null) return;
    event.preventDefault();
    if (open) {
      const list = entries();
      (target === "first" ? list[0] : list[list.length - 1])?.focus();
      return;
    }
    focusOnOpen.current = target;
    setOpen(true);
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // A disabled entry cannot take the focus: the arrows, Home and End skip it.
    const list = entries().filter((entry) => !(entry as HTMLButtonElement).disabled);
    const index = list.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        move(index + 1);
        break;
      case "ArrowUp":
        move(index - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(list.length - 1);
        break;
      case "Escape":
        // The side panel listens for Escape at the document level: close the menu only.
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  }

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => {
          setOpen((previous) => !previous);
        }}
        onKeyDown={onButtonKeyDown}
        title={icon !== undefined ? label : undefined}
        aria-label={icon !== undefined ? label : undefined}
        className={
          compact
            ? "flex h-5 w-5 items-center justify-center rounded-(--radius-control) text-ink-muted hover:bg-surface-sunken hover:text-ink disabled:opacity-60 aria-expanded:bg-surface-sunken aria-expanded:text-ink"
            : `flex h-7 items-center gap-1.5 rounded-(--radius-control) border border-line text-ink-muted hover:border-line-strong hover:text-ink disabled:opacity-60 aria-expanded:text-ink ${
                icon !== undefined ? "w-7 justify-center" : "px-2"
              }`
        }
      >
        {icon ?? (
          <>
            {label}
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </>
        )}
      </button>

      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          style={position ?? { visibility: "hidden" }}
          className="fixed z-[1200] min-w-56 rounded-(--radius-panel) border border-line bg-surface-raised p-1 text-left text-ui font-normal shadow-lg"
        >
          {items.map((item) => (
            <MenuEntry
              key={item.key}
              item={item}
              onChosen={() => {
                close(true);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Space kept between a menu and the edges of the window. */
const WINDOW_MARGIN = 8;
/** Gap between a menu and its trigger. */
const GAP = 4;

/**
 * Vertical place of a menu of `height` opened from `trigger`: under it when it
 * fits, else over it when it fits there, else on the roomier side, cut to the room
 * left and scrolled.
 */
export function verticalPlacement(trigger: DOMRect, height: number): CSSProperties {
  const below = window.innerHeight - trigger.bottom - GAP - WINDOW_MARGIN;
  const above = trigger.top - GAP - WINDOW_MARGIN;
  if (height <= below) return { top: trigger.bottom + GAP };
  if (height <= above) return { bottom: window.innerHeight - trigger.top + GAP };
  return below >= above
    ? { top: trigger.bottom + GAP, maxHeight: below, overflowY: "auto" }
    : { bottom: window.innerHeight - trigger.top + GAP, maxHeight: above, overflowY: "auto" };
}

/**
 * Shift of a submenu laid out at `rect` that keeps it in the window: up by what
 * passes the bottom edge (never above the top one), and to the other side of its
 * entry when it passes the right edge.
 */
export function submenuShift(rect: DOMRect): { up: number; flip: boolean } {
  const overflow = rect.bottom - (window.innerHeight - WINDOW_MARGIN);
  const up = Math.max(0, Math.min(overflow, rect.top - WINDOW_MARGIN));
  const flip = rect.right > window.innerWidth - WINDOW_MARGIN;
  return { up, flip };
}

/**
 * An entry of a menu: a choice, or the opener of a submenu shown beside it.
 */
function MenuEntry({ item, onChosen }: { item: MenuItem; onChosen: () => void }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const submenu = useRef<HTMLDivElement>(null);
  const subId = useId();
  const sub = item.items;
  // Shift keeping the submenu in the window, measured before it is painted.
  const [shift, setShift] = useState<{ up: number; flip: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || submenu.current === null) {
      setShift(null);
      return;
    }
    setShift(submenuShift(submenu.current.getBoundingClientRect()));
  }, [open]);

  function subEntries(): HTMLElement[] {
    return [
      ...(submenu.current?.querySelectorAll<HTMLElement>(":scope > div > [role=menuitem]") ?? []),
    ];
  }

  function openSub(focus: boolean) {
    setOpen(true);
    if (focus) window.requestAnimationFrame(() => subEntries()[0]?.focus());
  }

  function closeSub() {
    setOpen(false);
    opener.current?.focus();
  }

  function onSubKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const list = subEntries().filter((entry) => !(entry as HTMLButtonElement).disabled);
    const index = list.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        move(index + 1);
        break;
      case "ArrowUp":
        move(index - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(list.length - 1);
        break;
      case "ArrowLeft":
      case "Escape":
        event.preventDefault();
        closeSub();
        break;
      case "Tab":
        // Leaves the whole menu, as from the top level.
        return;
      default:
        return;
    }
    // The keys a submenu handles do not walk the parent menu too.
    event.stopPropagation();
  }

  return (
    <div
      className="relative"
      onPointerEnter={() => {
        if (sub !== undefined) setOpen(true);
      }}
      onPointerLeave={() => {
        if (sub !== undefined) setOpen(false);
      }}
    >
      {item.separatorBefore === true && (
        <div role="separator" className="my-1 border-t border-line" />
      )}
      <button
        ref={opener}
        type="button"
        role="menuitem"
        tabIndex={-1}
        disabled={item.disabled}
        aria-haspopup={sub === undefined ? undefined : "menu"}
        aria-expanded={sub === undefined ? undefined : open}
        aria-controls={sub === undefined ? undefined : subId}
        onClick={() => {
          if (sub !== undefined) {
            openSub(true);
            return;
          }
          onChosen();
          item.onSelect?.();
        }}
        onKeyDown={(event) => {
          if (sub !== undefined && event.key === "ArrowRight") {
            event.preventDefault();
            event.stopPropagation();
            openSub(true);
          }
        }}
        className={ITEM}
      >
        {item.icon}
        <span className="flex-1">{item.label}</span>
        {sub !== undefined && <CaretRightIcon className="h-3.5 w-3.5 text-ink-muted" />}
      </button>
      {sub !== undefined && open && (
        <div
          ref={submenu}
          id={subId}
          role="menu"
          aria-label={item.label}
          onKeyDown={onSubKeyDown}
          style={shift === null ? { visibility: "hidden", top: 0 } : { top: -shift.up }}
          className={`absolute z-40 min-w-56 rounded-(--radius-panel) border border-line bg-surface-raised p-1 shadow-lg ${
            shift?.flip === true ? "right-full mr-1" : "left-full ml-1"
          }`}
        >
          {sub.map((child) => (
            <MenuEntry key={child.key} item={child} onChosen={onChosen} />
          ))}
        </div>
      )}
    </div>
  );
}
