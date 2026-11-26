import { afterEach, describe, expect, test, vi } from "vitest";
import i18n, { browserLanguage, cachedLanguage, setLanguage } from "../index";

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

describe("the language chosen", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    localStorage.removeItem("om3.language");
    await i18n.changeLanguage("en");
  });

  test("kept, it is the one of the next loads; none kept, the browser's", () => {
    expect(cachedLanguage()).toBe("en");
    localStorage.setItem("om3.language", "fr");
    expect(cachedLanguage()).toBe("fr");
    // A value not of the webapp is left for the browser's.
    localStorage.setItem("om3.language", "de");
    expect(cachedLanguage()).toBe("en");
  });

  test("set, it speaks at once and is kept", async () => {
    await setLanguage("fr");
    expect(i18n.language).toBe("fr");
    expect(i18n.t("user.language")).toBe("Langue");
    expect(localStorage.getItem("om3.language")).toBe("fr");
    expect(document.documentElement.lang).toBe("fr");
  });

  test("without storage, it still speaks, and the browser's is read", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    await setLanguage("fr");
    expect(i18n.language).toBe("fr");
    expect(cachedLanguage()).toBe("en");
  });
});

describe("the counts said", () => {
  // Every string of a locale by its dotted key.
  const flatten = (tree: Record<string, unknown>, prefix = ""): Record<string, string> =>
    Object.entries(tree).reduce<Record<string, string>>((all, [key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof value === "object" && value !== null
        ? {...all, ...flatten(value as Record<string, unknown>, path)}
        : {...all, [path]: String(value)};
    }, {});
  const en = flatten(i18n.getResourceBundle("en", "translation"));
  // A count before a word in the plural: "{{count}} nodes", "{{count}} events received";
  // not one ending in ss, "{{count}} address".
  const plural = /\{\{count\}\} (\w+ )?\w*[^\Ws]s\b/;
  // Never of one: the listing cut past 500 entries; the keys deleted, several (messageMany).
  const severalOnly = ["volumeFiles.truncated", "keys.deleteDialog.messageMany"];

  test("a count before a plural has a singular of its own in English: never 1 nodes", () => {
    const bare = Object.keys(en).filter((key) => !/_(one|other)$/.test(key) && plural.test(en[key]) && !severalOnly.includes(key));
    expect(bare).toEqual([]);
    const same = Object.keys(en).filter((key) => key.endsWith("_one") && plural.test(en[key]));
    expect(same).toEqual([]);
  });

  test("one of them said in the singular, several in the plural, in English and in French", async () => {
    const say = (lng: string, key: string, count: number, params = {}) => i18n.getFixedT(lng)(key, {count, ...params});
    expect(say("en", "events.subscriptions.received", 1)).toBe("1 event received");
    expect(say("en", "nodes.target.selected", 1)).toBe("1 node");
    expect(say("en", "objects.dialogTarget.objects", 1)).toBe("1 object");
    expect(say("en", "objects.dialogTarget.objects", 2)).toBe("2 objects");
    expect(say("en", "keys.bytes", 1)).toBe("1 byte");
    expect(say("en", "nodeDaemon.summary.dns", 1, {names: say("en", "nodeDaemon.summary.dnsNames", 1)})).toBe("1 record of 1 name");
    expect(say("fr", "nodeDaemon.summary.dns", 2, {names: say("fr", "nodeDaemon.summary.dnsNames", 1)})).toBe("2 enregistrements pour 1 nom");
    expect(say("fr", "networks.sketch.label", 1, {name: "n"})).toBe("Schéma du réseau n sur 1 nœud");
  });
});
