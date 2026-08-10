import { describe, it, expect } from "vitest";
import { fluentRelease } from "./manipulator";

describe("fluentRelease", () => {
  it("leaves a gesture that began on the tool's own gizmo armed", () => {
    // The classic flow: grab, scrub, let go, adjust, click to commit. Releasing
    // the handle there has never meant "done" and must not start meaning it.
    expect(fluentRelease({ fluent: false, moved: true, meaningful: true })).toBe("stay");
    expect(fluentRelease({ fluent: false, moved: false, meaningful: false })).toBe("stay");
  });

  it("commits a fluent drag that actually went somewhere", () => {
    // One press: press the passive handle, drag, release, done. Leaving the
    // tool armed after that would strand the user in a mode they never entered.
    expect(fluentRelease({ fluent: true, moved: true, meaningful: true })).toBe("commit");
  });

  it("stays armed when a fluent press never travelled", () => {
    // A click on the arrow is not a drag. Committing here would drop a default
    // 2 mm fillet on a stray click — and staying armed is what makes clicking
    // the handle a way IN to the full tool.
    expect(fluentRelease({ fluent: true, moved: false, meaningful: true })).toBe("stay");
  });

  it("cancels a fluent drag that ended back at nothing", () => {
    // Dragging out and back to zero is how you back out of a gesture you did
    // not mean to start. Staying armed would trap exactly that user in the tool
    // they were trying to leave.
    expect(fluentRelease({ fluent: true, moved: true, meaningful: false })).toBe("cancel");
  });

  it("never commits without both a fluent grab and real movement", () => {
    for (const moved of [true, false]) {
      for (const meaningful of [true, false]) {
        expect(fluentRelease({ fluent: false, moved, meaningful })).not.toBe("commit");
      }
    }
    expect(fluentRelease({ fluent: true, moved: false, meaningful: true })).not.toBe("commit");
  });
});
