import { describe, it, expect } from "vitest";
import {
  MAX_DIAGONAL_FRACTION,
  MIN_EDGE_VALUE,
  clampValue,
  dragBounds,
  otherTreatment,
  scrubValue,
  seedValue,
  switchTreatment,
  treatmentField,
  treatmentLabel,
} from "./edgeDragMath";

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

describe("dragBounds", () => {
  it("floors a dragged value at one snap step, not at zero", () => {
    // Dragging backwards past the edge must park at the smallest visible
    // increment rather than slide through zero into a negative radius.
    expect(dragBounds(0.5, 100).min).toBe(0.5);
  });

  it("falls back to the absolute minimum when there is no usable step", () => {
    expect(dragBounds(0, 100).min).toBe(MIN_EDGE_VALUE);
    expect(dragBounds(-1, 100).min).toBe(MIN_EDGE_VALUE);
    expect(dragBounds(Number.NaN, 100).min).toBe(MIN_EDGE_VALUE);
  });

  it("caps a dragged value at a fraction of the model's diagonal", () => {
    expect(dragBounds(0.1, 100).max).toBeCloseTo(100 * MAX_DIAGONAL_FRACTION);
  });

  it("is unbounded above when the model has no bbox yet", () => {
    // An empty document still has to let the tool arm without dividing the
    // gesture by a diagonal that does not exist.
    expect(dragBounds(0.1, null).max).toBe(Infinity);
    expect(dragBounds(0.1, 0).max).toBe(Infinity);
  });

  it("never produces max < min on a model smaller than one snap step", () => {
    const b = dragBounds(5, 1);
    expect(b.max).toBeGreaterThanOrEqual(b.min);
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

describe("scrubValue", () => {
  const bounds = { min: 0.5, max: 25 };

  it("is relative to the grab, so grabbing the handle never jumps the value", () => {
    // proj === grabProj is the instant of the press: the value must be exactly
    // what it already was, whatever absolute position the handle sits at.
    expect(scrubValue({ grabValue: 3, grabProj: 117.4, proj: 117.4, step: 0.5, bounds })).toBe(3);
  });

  it("adds the travel along the axis", () => {
    expect(scrubValue({ grabValue: 2, grabProj: 0, proj: 4, step: 0.5, bounds })).toBe(6);
    expect(scrubValue({ grabValue: 6, grabProj: 4, proj: 0, step: 0.5, bounds })).toBe(2);
  });

  it("snaps to the step so the readout reads as a round number", () => {
    expect(scrubValue({ grabValue: 2, grabProj: 0, proj: 0.9713, step: 0.5, bounds })).toBe(3);
    expect(scrubValue({ grabValue: 2, grabProj: 0, proj: 0.1, step: 0.5, bounds })).toBe(2);
  });

  it("strips float fuzz rather than emitting 0.30000000000000004", () => {
    const v = scrubValue({ grabValue: 0.1, grabProj: 0, proj: 0.2, step: 0.1, bounds: { min: 0.1, max: 25 } });
    expect(v).toBe(0.3);
  });

  it("parks at the floor when dragged back past the edge", () => {
    // The signature awkward case: pull the handle the wrong way and keep going.
    expect(scrubValue({ grabValue: 2, grabProj: 0, proj: -50, step: 0.5, bounds })).toBe(0.5);
  });

  it("parks at the ceiling when flicked past what the model can hold", () => {
    expect(scrubValue({ grabValue: 2, grabProj: 0, proj: 10_000, step: 0.5, bounds })).toBe(25);
  });

  it("keeps giving the same answer once clamped, so the tool stops rebuilding", () => {
    // edgeFeatureTool skips the sidecar round-trip when the stepped value is
    // unchanged; a clamp that drifted would rebuild on every pointermove for
    // the whole time the cursor stayed off the end of the drag.
    const a = scrubValue({ grabValue: 2, grabProj: 0, proj: 900, step: 0.5, bounds });
    const b = scrubValue({ grabValue: 2, grabProj: 0, proj: 901, step: 0.5, bounds });
    expect(a).toBe(b);
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
