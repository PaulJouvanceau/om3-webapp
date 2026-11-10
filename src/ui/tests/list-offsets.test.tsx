import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useListOffsets } from "../components/Table";

/** The heights of the elements, by their tag or their tools mark. */
const heights = { thead: 30, tools: 28 };

function Page() {
  const page = useRef<HTMLDivElement>(null);
  useListOffsets(page);
  return (
    <div ref={page} data-testid="page">
      <div data-list-tools="" />
      <table>
        <thead>
          <tr>
            <th>Name</th>
          </tr>
        </thead>
      </table>
    </div>
  );
}

describe("list offsets", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("the heights of the header and of the tools given to the page, again as they change", () => {
    let resized = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      if (this.tagName === "THEAD") return heights.thead;
      return this.hasAttribute("data-list-tools") ? heights.tools : 0;
    });
    const { getByTestId } = render(<Page />);
    const page = getByTestId("page");
    expect(page.style.getPropertyValue("--list-head")).toBe("30px");
    expect(page.style.getPropertyValue("--list-tools")).toBe("28px");
    // Rows selected, the tools on two lines.
    heights.tools = 72;
    act(() => resized());
    expect(page.style.getPropertyValue("--list-tools")).toBe("72px");
  });

  test("no ResizeObserver: nothing given, the lines under no offset", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const { getByTestId } = render(<Page />);
    expect(getByTestId("page").style.getPropertyValue("--list-head")).toBe("");
  });
});
