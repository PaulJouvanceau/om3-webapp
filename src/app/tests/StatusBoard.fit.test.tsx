import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBoard } from "../StatusBoard";
import { buildBoard, type ObjectData } from "../statusboard";
import dns from "./fixtures/system-svc-dns.json";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StatusBoard scaled to its room", () => {
  test("scaled down while it overflows; its content narrower, the whole table again", () => {
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(1000);
    const build = () => buildBoard({ path: "system/svc/dns", object: dns as ObjectData });
    const { rerender } = render(<StatusBoard board={build()} />);
    // Overflowing at every step: its nodes one under the other, no table.
    expect(screen.queryByRole("table")).toBeNull();

    // The content now fits, the frame the same width: the table whole, its side columns back.
    scroll.mockReturnValue(0);
    rerender(<StatusBoard board={build()} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Type" })).toBeInTheDocument();
  });
});
