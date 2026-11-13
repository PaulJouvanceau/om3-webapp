import { describe, expect, test } from "vitest";
import { lineValue, sectionHeaders } from "../ini";

describe("a value as om3 reads it", () => {
  test("an inline comment, after a space, left out; a '#' or a ';' in a word kept", () => {
    expect(lineValue(" rw # tuned")).toBe("rw");
    expect(lineValue("rw,noatime ; tuned")).toBe("rw,noatime");
    expect(lineValue("a#b;c")).toBe("a#b;c");
    expect(lineValue("http://h/p#frag")).toBe("http://h/p#frag");
    // A tab no space: no comment.
    expect(lineValue("a\t# b")).toBe("a\t# b");
    // " #" first, " ;" only without one, as om3 looks for them.
    expect(lineValue("a ;b #c")).toBe("a ;b");
    // Right after the "=", no space before it once the value trimmed: the value, as om3 reads it.
    expect(lineValue("  # not a comment")).toBe("# not a comment");
  });

  test("quoted: a backquote or triple quotes enclosing it, a comment marker inside kept; a pair of quotes stripped", () => {
    expect(lineValue("`a # b` # c")).toBe("a # b");
    expect(lineValue('"""a ; b"""')).toBe("a ; b");
    expect(lineValue("\"a b\" # c")).toBe("a b");
    expect(lineValue("'a'")).toBe("a");
    // A quote inside: no pair stripped.
    expect(lineValue("\"a\"b\"")).toBe("\"a\"b\"");
    // Not closed on its line, continued by a backslash: as written, none read here.
    expect(lineValue("`a # b")).toBe("`a # b");
    expect(lineValue("a # b \\")).toBe("a # b \\");
  });

  test("the spaces around it trimmed", () => {
    expect(lineValue("  10.0.0.1  ")).toBe("10.0.0.1");
    expect(lineValue("")).toBe("");
  });
});

describe("the sections of a file as om3 reads them", () => {
  const headers = (text: string) => sectionHeaders(text.split("\n")).filter((name) => name !== null);

  test("a line opening one: at the margin or indented, a key line above not continued", () => {
    expect(headers("[DEFAULT]\nnodes = *\n[app#1]\n  [fs#1]\ntype = flag")).toEqual(["DEFAULT", "app#1", "fs#1"]);
    // After a blank line, a comment, or a value on its line alone between quotes: no value to continue.
    expect(headers("[a]\nk = v\n\n    [b]")).toEqual(["a", "b"]);
    expect(headers("[a]\nk = \"v\"\n    [b]")).toEqual(["a", "b"]);
  });

  test("a line of a value none: indented under its key, in a quoted value, after a backslash", () => {
    expect(headers("[a]\nstart = sh -c \"\n    [ -d /srv ]\n    \"\nk =\n    [1, 2]\n[b]")).toEqual(["a", "b"]);
    expect(headers("[a]\nk = `x\n[not]\ny`\n[b]")).toEqual(["a", "b"]);
    expect(headers('[a]\nk = """x\n[not]\n"""\n[b]')).toEqual(["a", "b"]);
    expect(headers("[a]\nk = x \\\n[not]\n[b]")).toEqual(["a", "b"]);
    // An inline comment no quote: the value continued.
    expect(headers("[a]\nk = v # c\n    [1]\n[b]")).toEqual(["a", "b"]);
  });
});
