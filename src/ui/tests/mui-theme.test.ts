import { afterEach, describe, expect, test } from "vitest";
import { createOm3MuiTheme } from "../mui-theme";

const TOKENS: Record<string, string> = {
  "--surface": "#f6f7f5",
  "--surface-raised": "#ffffff",
  "--surface-sunken": "#eceeeb",
  "--ink": "#1a2229",
  "--ink-muted": "#5b6770",
  "--line": "#d9dedb",
  "--accent": "#0f5b66",
  "--accent-ink": "#ffffff",
  "--state-up": "#2e7d4f",
  "--state-warn": "#a86b12",
  "--state-down": "#b8322a",
  "--font-sans": '"IBM Plex Sans Variable", system-ui, sans-serif',
};

function setTokens(tokens: Record<string, string>) {
  for (const [name, value] of Object.entries(tokens)) {
    document.documentElement.style.setProperty(name, value);
  }
}

describe("createOm3MuiTheme", () => {
  afterEach(() => {
    for (const name of Object.keys(TOKENS)) {
      document.documentElement.style.removeProperty(name);
    }
  });

  test("maps the oc3 tokens onto the MUI palette and typography", () => {
    setTokens(TOKENS);
    const theme = createOm3MuiTheme(false);

    expect(theme.palette.mode).toBe("light");
    expect(theme.palette.primary.main).toBe("#0f5b66");
    expect(theme.palette.primary.contrastText).toBe("#ffffff");
    expect(theme.palette.success.main).toBe("#2e7d4f");
    expect(theme.palette.warning.main).toBe("#a86b12");
    expect(theme.palette.error.main).toBe("#b8322a");
    expect(theme.palette.background.default).toBe("#f6f7f5");
    expect(theme.palette.background.paper).toBe("#ffffff");
    expect(theme.palette.text.primary).toBe("#1a2229");
    expect(theme.palette.text.secondary).toBe("#5b6770");
    expect(theme.palette.divider).toBe("#d9dedb");
    expect(theme.typography.fontFamily).toContain("IBM Plex Sans Variable");
    expect(theme.shape.borderRadius).toBe(3);
  });

  test("sets the dark mode", () => {
    setTokens(TOKENS);
    expect(createOm3MuiTheme(true).palette.mode).toBe("dark");
  });

  test("keeps the MUI defaults when the tokens do not resolve", () => {
    const theme = createOm3MuiTheme(false);
    expect(theme.palette.primary.main).toBe("#1976d2");
    expect(theme.palette.background.default).toBe("#fff");
  });

  test("tones MUI down to the oc3 density", () => {
    const theme = createOm3MuiTheme(false);
    expect(theme.components?.MuiButtonBase?.defaultProps?.disableRipple).toBe(true);
    expect(theme.components?.MuiPaper?.defaultProps?.elevation).toBe(0);
  });
});
