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

  describe("furniture it must not cover", () => {
    // The view-control pill sits at the bottom-left of the viewport and the
    // history's first chips sit at the bottom-left of the window, so the two
    // share a column by construction: the panel landed across ISO / Top / Front
    // for as long as a feature was selected.
    const pill = { left: 248, right: 700, top: 690 };

    it("lifts over the pill when they share a column", () => {
      const a = anchorAbove(chip(300), VIEW, 248, 8, 8, pill);
      expect(a.bottom).toBe(800 - 690 + 8); // clears the pill, not the strip
      expect(a.left).toBe(300); // still in its chip's column
    });

    it("stays tight against the strip for a chip past the pill", () => {
      const a = anchorAbove(chip(760), VIEW, 248, 8, 8, pill);
      expect(a.bottom).toBe(68);
    });

    it("does not lift for a panel that merely touches the pill's edge", () => {
      // left + width === pill.left exactly is not an overlap, and treating it
      // as one would raise the panel over furniture it was already clear of.
      const touching = { left: 8 + 248, right: 700, top: 690 };
      const a = anchorAbove(chip(0), VIEW, 248, 8, 8, touching);
      expect(a.left).toBe(8);
      expect(a.left + 248).toBe(touching.left);
      expect(a.bottom).toBe(68);
    });

    it("ignores furniture that is below the chip anyway", () => {
      const a = anchorAbove(chip(300, 600), VIEW, 248, 8, 8, pill);
      expect(a.bottom).toBe(800 - 600 + 8);
    });

    it("behaves as before when there is no furniture", () => {
      expect(anchorAbove(chip(300), VIEW, 248, 8, 8, null).bottom).toBe(68);
      expect(anchorAbove(chip(300), VIEW, 248).bottom).toBe(68);
    });
  });

  it("never anchors below the bottom of the window", () => {
    // A chip reported at or past the bottom edge (a strip mid-transition, a
    // stale rect) would otherwise produce a negative offset and park the panel
    // off screen with no way to reach it.
    expect(anchorAbove(chip(300, 900), VIEW, 248).bottom).toBe(8);
  });
});
