import { useLayoutEffect, useState } from "react";

/** The step the width is told in: a drawing laid out again every few pixels, not each. */
const STEP = 8;

/**
 * The width an element is drawn in, in pixels, a multiple of STEP rounded down, told
 * again as it changes: for a drawing scaled to its room to size what must stay read
 * (its names, its labels) to it. The ref to give the element, and its width: unknown
 * until it is drawn, or without a ResizeObserver. A ref setter, the element drawn
 * late (once there is something to draw) still measured.
 */
export function useRoomWidth(): [(element: Element | null) => void, number | undefined] {
  const [box, setBox] = useState<Element | null>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (!box || typeof ResizeObserver !== "function") return;
    const measure = () => {
      const room = Math.floor(box.getBoundingClientRect().width / STEP) * STEP;
      setWidth(room > 0 ? room : undefined);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => {
      observer.disconnect();
    };
  }, [box]);
  return [setBox, width];
}
