import { describe, it, expect } from "vitest";
import {
  MAX_DIAGONAL_FRACTION,
  MIN_EDGE_VALUE,
  clampValue,
  dragLimit,
  otherTreatment,
  scrubSigned,
  seedValue,
  switchTreatment,
  treatmentAt,
  treatmentField,
  treatmentLabel,
  valueBounds,
} from "../../src/features/edgeDragMath";

describe("treatmentField", () => {
  it("names the field each treatment actually stores its value in", () => {
    // These strings are read straight into the Feature and into the heads-up
    // input's label; getting them the wrong way round writes a chamfer's
    // setback into a fillet's radius.
    expect(treatmentField("fillet")).toEqual({ name: "radius", label: "R" });
    expect(treatmentField("chamfer")).toEqual({ name: "distance", label: "D" });
  });

  it("labels both treatments for the prompt line", () => {
    expect(treatmentLabel("fillet")).toBe("Fillet");
    expect(treatmentLabel("chamfer")).toBe("Chamfer");
  });
});

describe("otherTreatment", () => {
  it("is its own inverse", () => {
    expect(otherTreatment("fillet")).toBe("chamfer");
    expect(otherTreatment("chamfer")).toBe("fillet");
    expect(otherTreatment(otherTreatment("fillet"))).toBe("fillet");
  });
});

describe("dragLimit", () => {
  it("caps a dragged value at a fraction of the model's diagonal", () => {
    expect(dragLimit(100)).toBeCloseTo(100 * MAX_DIAGONAL_FRACTION);
  });

  it("is unbounded when the model has no bbox yet", () => {
    // An empty document still has to let the tool arm without dividing the
    // gesture by a diagonal that does not exist.
    expect(dragLimit(null)).toBe(Infinity);
    expect(dragLimit(0)).toBe(Infinity);
    expect(dragLimit(Number.NaN)).toBe(Infinity);
  });

  it("still leaves room for the smallest buildable blend on a tiny model", () => {
    expect(dragLimit(0.0001)).toBeGreaterThanOrEqual(MIN_EDGE_VALUE);
  });

  it("lets a measured neighbourhood override the diagonal in BOTH directions", () => {
    // The two halves of the same complaint. On a thin plate the diagonal is far
    // too generous (35mm of travel on a 2mm rim); on a chunky part it is too
    // tight and refuses fillets that build. A min() of the two would only ever
    // fix the first, which is why the local measure replaces rather than joins.
    expect(dragLimit(141, 1)).toBeCloseTo(1); // tighter than 141 * 0.25
    expect(dragLimit(346, 100)).toBeCloseTo(100); // looser than 346 * 0.25
  });

  it("falls back to the diagonal when the neighbourhood could not be measured", () => {
    // null is "not measured", and it must not read as "measured: no limit" —
    // that would drop the clamp entirely and let a flick of the mouse run the
    // value to 10^4 mm.
    expect(dragLimit(100, null)).toBeCloseTo(100 * MAX_DIAGONAL_FRACTION);
    expect(dragLimit(100, undefined)).toBeCloseTo(100 * MAX_DIAGONAL_FRACTION);
    expect(dragLimit(100, 0)).toBeCloseTo(100 * MAX_DIAGONAL_FRACTION);
    expect(dragLimit(100, Number.NaN)).toBeCloseTo(100 * MAX_DIAGONAL_FRACTION);
    expect(dragLimit(100, Infinity)).toBeCloseTo(100 * MAX_DIAGONAL_FRACTION);
  });
});

describe("valueBounds", () => {
  it("floors a chosen value at the smallest visible blend, not at zero", () => {
    expect(valueBounds(100).min).toBe(MIN_EDGE_VALUE);
    expect(valueBounds(100).max).toBeCloseTo(100 * MAX_DIAGONAL_FRACTION);
  });

  it("never produces max < min", () => {
    const b = valueBounds(1e-9);
    expect(b.max).toBeGreaterThanOrEqual(b.min);
    // ...including when the neighbourhood measures smaller than the smallest
    // blend worth committing, which a sliver of a face genuinely can.
    const local = valueBounds(100, 1e-9);
    expect(local.max).toBeGreaterThanOrEqual(local.min);
  });

  it("carries the local limit through to a typed value's bounds too", () => {
    expect(valueBounds(141, 1).max).toBeCloseTo(1);
  });
});

describe("clampValue", () => {
  const bounds = { min: 0.5, max: 25 };

  it("holds the value inside the bounds", () => {
    expect(clampValue(10, bounds)).toBe(10);
    expect(clampValue(-3, bounds)).toBe(0.5);
    expect(clampValue(1e6, bounds)).toBe(25);
  });

  it("treats a non-finite value as the floor rather than propagating NaN", () => {
    // axisDragDistance can return NaN at a degenerate camera angle; letting it
    // through would write NaN into the Feature and fail the rebuild silently.
    expect(clampValue(Number.NaN, bounds)).toBe(0.5);
    expect(clampValue(Infinity, bounds)).toBe(0.5);
  });
});

describe("scrubSigned", () => {
  const limit = 25;

  it("is relative to the grab, so grabbing the handle never jumps the value", () => {
    // proj === grabProj is the instant of the press: the value must be exactly
    // what it already was, whatever absolute position the handle sits at.
    expect(scrubSigned({ grabSigned: 3, grabProj: 117.4, proj: 117.4, step: 0.5, limit })).toBe(3);
  });

  it("adds the travel along the axis", () => {
    expect(scrubSigned({ grabSigned: 2, grabProj: 0, proj: 4, step: 0.5, limit })).toBe(6);
    expect(scrubSigned({ grabSigned: 6, grabProj: 4, proj: 0, step: 0.5, limit })).toBe(2);
  });

  it("snaps to the step so the readout reads as a round number", () => {
    expect(scrubSigned({ grabSigned: 2, grabProj: 0, proj: 0.9713, step: 0.5, limit })).toBe(3);
    expect(scrubSigned({ grabSigned: 2, grabProj: 0, proj: 0.1, step: 0.5, limit })).toBe(2);
  });

  it("strips float fuzz rather than emitting 0.30000000000000004", () => {
    expect(scrubSigned({ grabSigned: 0.1, grabProj: 0, proj: 0.2, step: 0.1, limit })).toBe(0.3);
  });

  it("passes THROUGH zero into the other treatment's side", () => {
    // The whole point of the redesign: dragging back past the edge used to park
    // at a floor, which made "I meant a chamfer" an abort-and-restart.
    expect(scrubSigned({ grabSigned: 2, grabProj: 0, proj: -5, step: 0.5, limit })).toBe(-3);
  });

  it("holds a one-step dead zone at the origin so the abort is reachable", () => {
    // Half a step is ~4px of travel — too fine to stop in on purpose, and this
    // is the state the user backs out of the gesture in.
    expect(scrubSigned({ grabSigned: 2, grabProj: 0, proj: -2.4, step: 0.5, limit })).toBe(0);
    expect(scrubSigned({ grabSigned: 2, grabProj: 0, proj: -1.6, step: 0.5, limit })).toBe(0);
    // ...and one clean step past it, not a fraction of one
    expect(scrubSigned({ grabSigned: 2, grabProj: 0, proj: -2.55, step: 0.5, limit })).toBe(-0.5);
  });

  it("caps the same distance either side of the origin", () => {
    expect(scrubSigned({ grabSigned: 2, grabProj: 0, proj: 10_000, step: 0.5, limit })).toBe(25);
    expect(scrubSigned({ grabSigned: 2, grabProj: 0, proj: -10_000, step: 0.5, limit })).toBe(-25);
  });

  it("keeps giving the same answer once clamped, so the tool stops rebuilding", () => {
    // edgeFeatureTool skips the sidecar round-trip when the stepped value is
    // unchanged; a clamp that drifted would rebuild on every pointermove for
    // the whole time the cursor stayed off the end of the drag.
    const a = scrubSigned({ grabSigned: 2, grabProj: 0, proj: 900, step: 0.5, limit });
    const b = scrubSigned({ grabSigned: 2, grabProj: 0, proj: 901, step: 0.5, limit });
    expect(a).toBe(b);
  });

  it("reads a degenerate projection as the origin rather than NaN", () => {
    // axisDragDistance can return NaN at a degenerate camera angle; letting it
    // through would write NaN into the Feature and fail the rebuild silently.
    expect(scrubSigned({ grabSigned: 2, grabProj: 0, proj: Number.NaN, step: 0.5, limit })).toBe(0);
  });
});

describe("treatmentAt", () => {
  it("gives the arrow's own treatment on the positive side", () => {
    expect(treatmentAt("fillet", 3)).toEqual({ kind: "fillet", value: 3 });
    expect(treatmentAt("chamfer", 3)).toEqual({ kind: "chamfer", value: 3 });
  });

  it("gives the opposite treatment, same magnitude, on the far side", () => {
    // Same drag distance, other side of the edge: a 3 mm radius becomes a 3 mm
    // setback. That equivalence is why one axis can carry both.
    expect(treatmentAt("fillet", -3)).toEqual({ kind: "chamfer", value: 3 });
    expect(treatmentAt("chamfer", -3)).toEqual({ kind: "fillet", value: 3 });
  });

  it("values the origin at nothing", () => {
    expect(treatmentAt("fillet", 0).value).toBe(0);
  });
});

describe("switchTreatment", () => {
  it("carries the number across untouched — that is the whole gesture", () => {
    const bounds = { min: 0.5, max: 25 };
    expect(switchTreatment("fillet", 4.5, bounds)).toEqual({ kind: "chamfer", value: 4.5 });
    expect(switchTreatment("chamfer", 4.5, bounds)).toEqual({ kind: "fillet", value: 4.5 });
  });

  it("round-trips back to the original treatment and value", () => {
    const bounds = { min: 0.5, max: 25 };
    const once = switchTreatment("fillet", 7, bounds);
    expect(switchTreatment(once.kind, once.value, bounds)).toEqual({ kind: "fillet", value: 7 });
  });

  it("re-clamps a value that came from a different bounds regime", () => {
    // e.g. the user typed 900, then flipped: the flip must not smuggle an
    // out-of-range value into the other treatment's drag.
    expect(switchTreatment("fillet", 900, { min: 0.5, max: 25 }).value).toBe(25);
  });
});

describe("seedValue", () => {
  it("opens on the familiar MCAD defaults", () => {
    const roomy = { min: 0.1, max: 100 };
    expect(seedValue("fillet", roomy)).toBe(2);
    expect(seedValue("chamfer", roomy)).toBe(1);
  });

  it("shrinks the default on a model too small to hold it", () => {
    // A default nobody can build is worse than a small one: it would open the
    // gesture on a preview that fails before the user has touched anything.
    expect(seedValue("fillet", { min: 0.05, max: 0.5 })).toBe(0.5);
  });
});
