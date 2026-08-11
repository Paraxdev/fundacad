// The orientation wheel's arrangement is a promise to the user's hand. These
// pin the two things that would quietly break it.

import { describe, it, expect } from "vitest";
import { MAX_PIE_ITEMS, armedIndex } from "./pieMath";
import { viewPie, type ViewPieDeps } from "./viewPie";

/** Records what the wheel would do to the camera, with no camera. */
function recorder() {
  const calls: string[] = [];
  const deps: ViewPieDeps = {
    setStandardView: (v) => calls.push(v),
    fitView: () => calls.push("fit"),
  };
  return { calls, deps };
}

describe("the view pie", () => {
  it("puts opposite views at opposite angles", () => {
    // The rule the whole wheel is built on. Flicking north for Top and south
    // for Bottom is learnable; Top and Bottom next door to each other is not,
    // and nothing else in the app would catch the reorder that caused it.
    const { deps } = recorder();
    const labels = viewPie(0, 0, deps).items.map((i) => i.label);
    expect([labels[0], labels[1]]).toEqual(["Left", "Right"]);
    expect([labels[2], labels[3]]).toEqual(["Bottom", "Top"]);
    expect([labels[4], labels[5]]).toEqual(["Front", "Back"]);
  });

  it("flicking north looks down from the top, and south from the bottom", () => {
    // Reads the arrangement the way a user does — through the gesture — so a
    // sign error in either this file or pieMath's screen-space convention shows
    // up as the view going the wrong way rather than as an index mismatch.
    const { calls, deps } = recorder();
    const items = viewPie(0, 0, deps).items;
    items[armedIndex(0, -300, items.length)!]?.onPick?.();
    items[armedIndex(0, 300, items.length)!]?.onPick?.();
    items[armedIndex(-300, 0, items.length)!]?.onPick?.();
    expect(calls).toEqual(["top", "bottom", "left"]);
  });

  it("fits in one wheel", () => {
    // A ninth item has no slot (pieMath.slotOf returns null) and would simply
    // never be reachable.
    const { deps } = recorder();
    expect(viewPie(0, 0, deps).items.length).toBeLessThanOrEqual(MAX_PIE_ITEMS);
  });
});
