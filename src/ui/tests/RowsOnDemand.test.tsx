import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Table } from "../components/Table";
import { MoreRows, useRowsOnDemand } from "../components/RowsOnDemand";

function List({ total, order }: { total: number; order: string }) {
  const items = Array.from({ length: total }, (_, i) => `row ${i}`);
  const drawn = useRowsOnDemand(items.length, [order]);
  return (
    <Table aria-label="list" style={{ overflowY: "auto" }}>
      <tbody>
        {drawn.rows(items).map((item) => (
          <tr key={item} data-item="">
            <td>{item}</td>
          </tr>
        ))}
        <MoreRows rows={drawn} colSpan={1} />
      </tbody>
    </Table>
  );
}

const drawnCount = () => document.querySelectorAll("[data-item]").length;

/** The elements `holds` says hold more than they show, of 1000px in a box of 500. */
function scrolling(holds: (element: HTMLElement) => boolean) {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    return holds(this) ? 1000 : 500;
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(500);
}

describe("rows on demand", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("the first 100 drawn, then more as the end nears, in the scroller of the table; none past the end", () => {
    let onChange: (entries: { isIntersecting: boolean }[]) => void = () => {};
    const options: IntersectionObserverInit[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: typeof onChange, init: IntersectionObserverInit) {
          onChange = callback;
          options.push(init);
        }
        observe() {}
        disconnect() {}
      },
    );
    // The frame of the table holds more than it shows: it scrolls.
    scrolling((element) => element.hasAttribute("data-table-scroll"));
    render(<List total={250} order="a" />);
    expect(drawnCount()).toBe(100);
    expect(screen.getByText("100 of 250 shown")).toBeInTheDocument();
    expect(options[0].root).toBe(document.querySelector("[data-table-scroll]"));
    expect(options[0].rootMargin).toBe("0px 0px 600px 0px");
    act(() => onChange([{ isIntersecting: true }]));
    expect(drawnCount()).toBe(200);
    // The last ones: 50, not 100.
    expect(screen.getByRole("button", { name: "Show 50 more" })).toBeInTheDocument();
    act(() => onChange([{ isIntersecting: true }]));
    expect(drawnCount()).toBe(250);
    expect(document.querySelector("[data-more-rows]")).toBeNull();
  });

  test("the frame of the table as tall as its rows, on a small screen: watched from the page scrolling it", () => {
    const options: IntersectionObserverInit[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(_: unknown, init: IntersectionObserverInit) {
          options.push(init);
        }
        observe() {}
        disconnect() {}
      },
    );
    scrolling((element) => element.id === "page");
    render(
      <div id="page" style={{ overflowY: "auto" }}>
        <List total={250} order="a" />
      </div>,
    );
    expect(options[0].root).toBe(document.getElementById("page"));
  });

  test("asked for with its button; what the list holds changed, the first ones again", () => {
    const { rerender } = render(<List total={250} order="a" />);
    fireEvent.click(screen.getByRole("button", { name: "Show 100 more" }));
    expect(drawnCount()).toBe(200);
    rerender(<List total={250} order="b" />);
    expect(drawnCount()).toBe(100);
  });

  test("a list shorter than a step: all of it, no line for more", () => {
    render(<List total={30} order="a" />);
    expect(drawnCount()).toBe(30);
    expect(document.querySelector("[data-more-rows]")).toBeNull();
  });
});
