// Where the feature-values popover lands over the bottom history strip.
//
// It follows the selected chip, and the chip is inside a horizontal scroller —
// so it can be anywhere from off the left edge to off the right one, and the
// panel has to stay readable at both extremes rather than following it out of
// the window.

import { describe, expect, it } from "vitest";
import { anchorAbove } from "../../src/ui/propsAnchor";

const VIEW = { width: 1000, height: 800 };
const chip = (left: number, top = 740) => ({ left, right: left + 28, top });

describe("anchorAbove", () => {
  it("sits above the chip and lines up with its left edge", () => {
    const a = anchorAbove(chip(300), VIEW, 248);
    expect(a.left).toBe(300);
    // 800 - 740 + 8: the strip's top edge plus the gap, measured from the
    // bottom of the window because that is the edge the panel grows away from.
    expect(a.bottom).toBe(68);
  });

  it("stops at the right edge instead of hanging off it", () => {
    const a = anchorAbove(chip(960), VIEW, 248);
    expect(a.left).toBe(1000 - 8 - 248);
    expect(a.left + 248).toBeLessThanOrEqual(1000);
  });

  it("stops at the left edge too, which a scrolled strip reaches", () => {
    // A chip scrolled partly out of view has a negative left. Following it
    // there would put the labels outside the window with nothing to scroll.
    const a = anchorAbove(chip(-40), VIEW, 248);
    expect(a.left).toBe(8);
  });

  it("keeps the panel on screen when the window is narrower than the panel", () => {
    const a = anchorAbove(chip(10), { width: 200, height: 800 }, 248);
    expect(a.left).toBe(8);
    expect(a.left).toBeGreaterThanOrEqual(0);
  });

  it("never anchors below the bottom of the window", () => {
    // A chip reported at or past the bottom edge (a strip mid-transition, a
    // stale rect) would otherwise produce a negative offset and park the panel
    // off screen with no way to reach it.
    expect(anchorAbove(chip(300, 900), VIEW, 248).bottom).toBe(8);
  });
});
