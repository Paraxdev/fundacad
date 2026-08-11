// What these prove is that a pie stays LEARNABLE. Every failure below is a
// version of the same complaint: "it moved", or "I flicked and nothing
// happened".

import { describe, it, expect } from "vitest";
import {
  DEAD_ZONE_PX,
  MAX_PIE_ITEMS,
  PIE_RADIUS_PX,
  SLOT_ORDER,
  TRAVEL_SLOP_PX,
  armedIndex,
  itemOffset,
  releaseOutcome,
  slotOf,
  withinClickReach,
} from "./pieMath";

/** A cursor `dist` px from the centre in a compass direction. Screen space, so
 *  north is negative y — writing the directions out here rather than in every
 *  case is what stops a test from quietly agreeing with a sign error. */
function at(dir: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW", dist: number) {
  const d = Math.SQRT1_2;
  const v = {
    N: [0, -1],
    NE: [d, -d],
    E: [1, 0],
    SE: [d, d],
    S: [0, 1],
    SW: [-d, d],
    W: [-1, 0],
    NW: [-d, -d],
  }[dir] as [number, number];
  return [v[0] * dist, v[1] * dist] as const;
}

describe("slot layout", () => {
  it("arms item i from the same direction however many items the menu has", () => {
    // THE guarantee, stated as the thing the user actually experiences: the
    // flick that reached an item still reaches it after the menu grew. If a pie
    // divided 2π by its item count instead of filling fixed slots, adding one
    // entry would move every other entry — and a test that only checked "the
    // items are evenly spread" would pass on exactly that bug.
    for (let i = 0; i < MAX_PIE_ITEMS; i++) {
      const [dx, dy] = at(SLOT_ORDER[i]!, 200);
      for (let count = i + 1; count <= MAX_PIE_ITEMS; count++) {
        expect(armedIndex(dx, dy, count)).toBe(i);
      }
    }
  });

  it("fills the cardinal directions before any diagonal", () => {
    // A four-item menu that used NE/SE/SW/NW would demand two-axis accuracy for
    // every pick when it had four free slots that need none.
    expect(SLOT_ORDER.slice(0, 4)).toEqual(["W", "E", "S", "N"]);
  });

  it("puts opposite slots at opposite angles, in adjacent index pairs", () => {
    // What lets a menu author express "Top and Bottom are opposites" by
    // declaring them next to each other. If the fill order were shuffled, every
    // spatial menu would have to hard-code slot positions to stay sensible.
    const pairs = [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
    ] as const;
    for (const [a, b] of pairs) {
      const oa = itemOffset(a)!;
      const ob = itemOffset(b)!;
      expect(oa.x).toBeCloseTo(-ob.x, 10);
      expect(oa.y).toBeCloseTo(-ob.y, 10);
    }
  });

  it("has no slot for a ninth item", () => {
    // The renderer must not silently stack two items on one angle; callers cap
    // their lists and this is the backstop that makes forgetting visible.
    expect(slotOf(MAX_PIE_ITEMS)).toBeNull();
    expect(itemOffset(MAX_PIE_ITEMS)).toBeNull();
  });
});

describe("arming", () => {
  it("arms nothing inside the dead zone", () => {
    // Releasing where you started must never run a tool — it is the only way
    // out of a menu you opened by accident.
    expect(armedIndex(0, 0, 4)).toBeNull();
    expect(armedIndex(...at("W", DEAD_ZONE_PX - 1), 4)).toBeNull();
  });

  it("arms the same item at 30px and at 3000px", () => {
    // The flick. An expert throws the cursor well past the label and lets go;
    // hit-testing the label's box would drop that gesture on the floor.
    for (const dist of [DEAD_ZONE_PX + 1, PIE_RADIUS_PX, 3000]) {
      expect(armedIndex(...at("W", dist), 4)).toBe(0);
      expect(armedIndex(...at("N", dist), 4)).toBe(3);
    }
  });

  it("arms the nearest OCCUPIED slot, not the nearest of eight", () => {
    // A three-item pie fills W, E and S. Aiming north-east has to reach the
    // eastern item: the user cannot see that NE is empty, and a menu that
    // ignored anything but a perfect hit would feel broken precisely when they
    // stopped looking at it.
    expect(armedIndex(...at("NE", 200), 3)).toBe(1); // E
    expect(armedIndex(...at("NW", 200), 3)).toBe(0); // W
  });

  it("breaks an exact tie by index, not by iteration luck", () => {
    // Due north over a west/east pair is equidistant. Whatever it picks, it has
    // to pick the SAME thing every time and on both sides of the boundary
    // pixel — that boundary is where the hand is least precise, so a coin flip
    // there is felt as the menu being unreliable.
    expect(armedIndex(...at("N", 200), 2)).toBe(0);
    expect(armedIndex(...at("S", 200), 2)).toBe(0);
  });

  it("refuses a menu with nothing in it", () => {
    expect(armedIndex(...at("E", 200), 0)).toBeNull();
  });

  it("never arms past the last slot, however many items it is handed", () => {
    // A caller that failed to cap its list would otherwise get an index with no
    // item behind it, and the pick would throw at the worst possible moment.
    const i = armedIndex(...at("E", 200), 40);
    expect(i).not.toBeNull();
    expect(i!).toBeLessThan(MAX_PIE_ITEMS);
  });
});

describe("what a release means", () => {
  it("picks whatever is armed", () => {
    expect(releaseOutcome({ armed: 2, travelledPx: 400 })).toBe("pick");
  });

  it("keeps the menu up when the opening click lets go where it started", () => {
    // The click-open-click-pick half. Without this the pie would flash open and
    // shut on every click that opened it, and only drag users could ever use
    // it.
    expect(releaseOutcome({ armed: null, travelledPx: 0 })).toBe("keep-open");
    expect(releaseOutcome({ armed: null, travelledPx: TRAVEL_SLOP_PX })).toBe("keep-open");
  });

  it("cancels when the pointer went out and came back to the centre", () => {
    // Same release coordinates as the case above — the pointer is in the dead
    // zone both times. Only the PEAK travel separates "I have not moved yet"
    // from "I looked, and no thanks", which is why the rule reads the furthest
    // distance rather than the final one.
    expect(releaseOutcome({ armed: null, travelledPx: 220 })).toBe("cancel");
  });
});

describe("click reach", () => {
  it("accepts a click anywhere around the wheel", () => {
    expect(withinClickReach(...at("SE", PIE_RADIUS_PX * 2))).toBe(true);
  });

  it("rejects a click most of a screen away", () => {
    // Click-away has to be a way out. It only applies to a FRESH click — a
    // flick already under way is exempt, which is what stops this rule from
    // eating an overshoot.
    expect(withinClickReach(...at("SE", 1200))).toBe(false);
  });
});
