import { describe, expect, test } from "vitest";
import { evalQuery, evaluatedText, keywordPatterns, maskedKeywords } from "../config-eval";

describe("an evaluation asked", () => {
  test("as the node answering, of the keywords set: evaluate alone", () => {
    expect(evalQuery("", [])).toBe("evaluate=true");
  });

  test("as a node, of patterns: impersonate, kw repeated", () => {
    expect(evalQuery("n2", keywordPatterns(" fs#1.* ,DEFAULT.nodes  cont*.stop_*"))).toBe(
      "evaluate=true&impersonate=n2&kw=fs%231.*&kw=DEFAULT.nodes&kw=cont*.stop_*",
    );
  });
});

describe("the keywords a redacted file masks", () => {
  test("named as the daemon names them: DEFAULT bare, the others by their section", () => {
    const redacted = "[DEFAULT]\nid = 1\ntoken = ********\n\n[cluster]\nname = dev3\nsecret = ********\n\n[data]\npw = ********\n# x = ********\n";
    expect([...maskedKeywords(redacted)]).toEqual(["token", "cluster.secret", "data.pw"]);
  });

  test("none in a file masking nothing", () => {
    expect(maskedKeywords("[DEFAULT]\nnodes = *\n").size).toBe(0);
  });
});

describe("what a keyword evaluates to, in words", () => {
  test("the text the daemon gives, else the value converted", () => {
    expect(evaluatedText({ keyword: "nodes", value: "*", evaluated: ["n1", "n2"], evaluated_text: "n1 n2" })).toBe("n1 n2");
    expect(evaluatedText({ keyword: "nodes", value: "*", evaluated: ["n1", "n2"] })).toBe('["n1","n2"]');
    expect(evaluatedText({ keyword: "x", value: "" })).toBe("");
  });
});
