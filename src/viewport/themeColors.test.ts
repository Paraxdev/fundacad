import { describe, it, expect } from "vitest";
import { invalidateThemeColors, parseCssColor, themeColor } from "./themeColors";

describe("parseCssColor", () => {
  it("reads the hex forms the palette actually uses", () => {
    expect(parseCssColor("#ff7a3c")).toBe(0xff7a3c);
    expect(parseCssColor("  #0e0f12  ")).toBe(0x0e0f12);
    expect(parseCssColor("#f80")).toBe(0xff8800); // shorthand expands per channel
  });

  it("reads rgb()/rgba(), because the tint tokens are written that way", () => {
    // --accent-tint and friends are rgba. A viewport colour reaching for one and
    // silently getting the fallback would look like the theme half-applying.
    expect(parseCssColor("rgb(255, 122, 60)")).toBe(0xff7a3c);
    expect(parseCssColor("rgba(255, 122, 60, 0.35)")).toBe(0xff7a3c);
    expect(parseCssColor("rgb(255 122 60 / 35%)")).toBe(0xff7a3c);
  });

  it("drops alpha rather than folding it into the colour", () => {
    // Three keeps opacity on the material; baking it into the RGB would darken
    // the colour instead of making it transparent.
    expect(parseCssColor("rgba(255, 122, 60, 0)")).toBe(0xff7a3c);
  });

  it("clamps out-of-range channels instead of overflowing into the next one", () => {
    expect(parseCssColor("rgb(300, -20, 60)")).toBe(0xff003c);
  });

  it("returns null on anything it cannot read", () => {
    // Null, not a guess: the caller then keeps its own literal. Guessing would
    // paint a manipulator black on a token typo, which reads as a broken tool.
    expect(parseCssColor("")).toBeNull();
    expect(parseCssColor("   ")).toBeNull();
    expect(parseCssColor("papayawhip")).toBeNull();
    expect(parseCssColor("#12345")).toBeNull();
    expect(parseCssColor("rgb(1, 2)")).toBeNull();
    expect(parseCssColor("var(--accent)")).toBeNull();
  });
});

describe("themeColor", () => {
  it("falls back to the caller's literal with no document to resolve against", () => {
    // Headless: tests, workers, anything constructing a handle before the DOM.
    // The manipulators must still come out the right colour there.
    invalidateThemeColors();
    expect(themeColor("--accent", 0xff7a3c)).toBe(0xff7a3c);
    expect(themeColor("--nonexistent-token", 0x123456)).toBe(0x123456);
  });
});
