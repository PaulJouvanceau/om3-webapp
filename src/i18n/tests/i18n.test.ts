import { describe, expect, test } from "vitest";
import { browserLanguage } from "../index";

describe("browserLanguage", () => {
  test.each([
    ["fr-FR", "fr"],
    ["fr", "fr"],
    ["FR-ca", "fr"],
    ["en-US", "en"],
    ["de-DE", "en"],
    [undefined, "en"],
  ])("%s speaks %s", (language, expected) => {
    expect(browserLanguage(language)).toBe(expected);
  });
});
