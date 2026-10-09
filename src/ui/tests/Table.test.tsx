import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import {
  Cell,
  EmptyRow,
  HeaderCell,
  HeaderRow,
  Row,
  SortHeaderCell,
  Table,
} from "../components/Table";
import { StatusMark } from "../components/StatusMark";

function renderTable(rows: React.ReactNode, sticky = false) {
  return render(
    <Table sticky={sticky} aria-label="wrapper">
      <thead>
        <HeaderRow>
          <HeaderCell>Name</HeaderCell>
          <HeaderCell>Size</HeaderCell>
        </HeaderRow>
      </thead>
      <tbody>{rows}</tbody>
    </Table>,
  );
}

describe("Table", () => {
  test("renders a table with column headers in the oc3 list style", () => {
    renderTable(
      <Row>
        <Cell>a</Cell>
        <Cell numeric>1</Cell>
      </Row>,
    );
    expect(screen.getByRole("table")).toHaveClass("w-full", "border-collapse", "text-data");
    expect(screen.getByRole("columnheader", { name: "Name" })).toHaveAttribute("scope", "col");
    expect(screen.getByRole("cell", { name: "1" })).toHaveAttribute("data-numeric");
    expect(screen.getByRole("cell", { name: "1" })).toHaveClass("tabular-nums");
  });

  test("centers every column, its title as its values, text and numbers alike", () => {
    render(
      <Table>
        <thead>
          <HeaderRow>
            <HeaderCell>Name</HeaderCell>
            <SortHeaderCell label="Size" active direction="asc" onSort={() => {}} />
          </HeaderRow>
        </thead>
        <tbody>
          <Row>
            <Cell>a</Cell>
            <Cell numeric>1</Cell>
          </Row>
        </tbody>
      </Table>,
    );
    for (const header of screen.getAllByRole("columnheader")) expect(header).toHaveClass("text-center");
    for (const cell of screen.getAllByRole("cell")) expect(cell).toHaveClass("text-center");
    expect(screen.getByRole("button", { name: "Size" })).toHaveClass("text-center");
  });

  test("hangs the sort arrow past the title, so sorting does not move it", () => {
    render(
      <Table>
        <thead>
          <HeaderRow>
            <SortHeaderCell label="Size" active direction="desc" onSort={() => {}} />
          </HeaderRow>
        </thead>
      </Table>,
    );
    const arrow = screen.getByText("▼");
    expect(arrow).toHaveAttribute("aria-hidden", "true");
    expect(arrow).toHaveClass("absolute", "left-full");
    expect(screen.getByRole("button", { name: "Size" })).toBeInTheDocument();
  });

  test("gives every row the 30px height of the other views", () => {
    renderTable(
      <Row>
        <Cell>a</Cell>
        <Cell>b</Cell>
      </Row>,
    );
    for (const row of screen.getAllByRole("row").slice(1)) expect(row).toHaveClass("h-[1.875rem]");
    expect(screen.getByRole("columnheader", { name: "Name" })).toHaveClass("h-[1.875rem]");
  });

  test("keeps the header in view when sticky: the wrapper scrolls both ways", () => {
    renderTable(null, true);
    expect(screen.getByRole("table")).toHaveAttribute("data-sticky");
    expect(screen.getByRole("table").parentElement).toHaveClass("overflow-auto");
  });

  test("scrolls only sideways when not sticky", () => {
    renderTable(null);
    expect(screen.getByRole("table").parentElement).toHaveClass("overflow-x-auto");
    expect(screen.getByRole("table").parentElement).not.toHaveClass("overflow-auto");
  });

  test("names the table itself with aria-label", () => {
    renderTable(null);
    expect(screen.getByRole("table", { name: "wrapper" })).toBeInTheDocument();
  });

  test("a row with onActivate opens by click, Enter and Space, not from a control inside", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    renderTable(
      <Row onActivate={onActivate}>
        <Cell>a</Cell>
        <Cell>
          {/* A control inside a row stops its click, as the row documents. */}
          <button type="button" onClick={(event) => event.stopPropagation()}>
            inner
          </button>
        </Cell>
      </Row>,
    );
    const row = screen.getAllByRole("row")[1]!;
    expect(row).toHaveAttribute("tabindex", "0");
    await user.click(screen.getByRole("cell", { name: "a" }));
    expect(onActivate).toHaveBeenCalledTimes(1);
    row.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onActivate).toHaveBeenCalledTimes(3);
    screen.getByRole("button", { name: "inner" }).focus();
    await user.keyboard("{Enter}");
    expect(onActivate).toHaveBeenCalledTimes(3);
  });

  test("a row without onActivate is not focusable, a selected one is marked current", () => {
    renderTable(
      <Row selected>
        <Cell>a</Cell>
        <Cell>b</Cell>
      </Row>,
    );
    const row = screen.getAllByRole("row")[1]!;
    expect(row).not.toHaveAttribute("tabindex");
    expect(row).toHaveAttribute("aria-current", "true");
    expect(row).toHaveClass("bg-accent-soft");
  });

  test("a sortable header is a button announcing its order", async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    const { rerender } = render(
      <table>
        <thead>
          <tr>
            <SortHeaderCell label="Name" active={false} direction="asc" onSort={onSort} />
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "none");
    await user.click(screen.getByRole("button", { name: "Name" }));
    expect(onSort).toHaveBeenCalledTimes(1);
    rerender(
      <table>
        <thead>
          <tr>
            <SortHeaderCell label="Name" active direction="desc" onSort={onSort} />
          </tr>
        </thead>
      </table>,
    );
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("button")).toHaveTextContent("Name▼");
  });

  test("an empty table says so across all its columns", () => {
    renderTable(<EmptyRow colSpan={2}>No pools</EmptyRow>);
    expect(screen.getByRole("cell", { name: "No pools" })).toHaveAttribute("colspan", "2");
  });
});

describe("StatusMark", () => {
  test.each([
    ["up", "text-state-up", "up"],
    ["warn", "text-state-warn", "warn"],
    ["down", "text-state-down", "down"],
    ["unknown", "text-state-unknown", "n/a"],
  ] as const)("marks %s with its drawn shape, tint and label", (state, ink, label) => {
    render(<StatusMark state={state} />);
    const mark = screen.getByTitle(label);
    expect(mark).toHaveAttribute("data-state", state);
    expect(mark).toHaveClass(ink);
    expect(mark).toHaveTextContent(label);
    expect(mark.querySelector("svg")).toHaveAttribute("data-glyph", state);
  });

  test("takes a more precise label", () => {
    render(<StatusMark state="down" label="stale" />);
    expect(screen.getByTitle("stale")).toHaveTextContent("stale");
    expect(screen.getByTitle("stale").querySelector("svg")).toHaveAttribute("data-glyph", "down");
  });
});
