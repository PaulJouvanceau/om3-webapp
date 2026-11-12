import { describe, expect, test } from "vitest";
import { opValue, setOp } from "../keyop";
import { bodyOps } from "../section-config";
import { hbOps } from "../heartbeat-config";

describe("a set operation as om3 reads it", () => {
  test("a value ending with ':' quoted, not read as a test of the keyword", () => {
    expect(setOp("hb#1.addr", "::")).toBe('hb#1.addr="::"');
    expect(setOp("env.PATH", "/opt/bin:")).toBe('env.PATH="/opt/bin:"');
    // A double quote in it: by single ones.
    expect(opValue('say "x":')).toBe("'say \"x\":'");
  });

  test("a value between a pair of quotes quoted, the pair not stripped", () => {
    expect(opValue('"a b"')).toBe("'\"a b\"'");
    expect(opValue("'a'")).toBe("\"'a'\"");
  });

  test("the others as they are", () => {
    expect(setOp("env.PATH", "/opt/bin:/usr/bin")).toBe("env.PATH=/opt/bin:/usr/bin");
    expect(opValue('a "b" c')).toBe('a "b" c');
    expect(opValue("")).toBe("");
    // Both quotes in it, none read back as is: as it is.
    expect(opValue("'a\" b:")).toBe("'a\" b:");
  });

  test("written so by the section editor and the heartbeat wizard", () => {
    expect(bodyOps("network", "b", "type = lan", "type = lan\nmask = ::").set).toEqual(['network#b.mask="::"']);
    expect(hbOps("hb#1", { type: "unicast" }, { type: "unicast", "addr@n1": "::" }).set).toEqual(['hb#1.addr@n1="::"']);
  });
});
