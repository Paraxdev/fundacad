// The arithmetic behind the direct-manipulation edge gesture: turning a drag
// along the handle's axis into a radius/distance, flipping between the two edge
// treatments mid-gesture, and keeping the dragged number inside what the kernel
// can plausibly build.
//
// Split out of edgeFeatureTool.ts on purpose. The tool itself is pointer
// plumbing — listeners, a Three.js gizmo, a sidecar preview — none of which can
// run in the headless test suite. These five functions are the part that can
// actually be wrong in a way a user notices, so they live where vitest can
// reach them with no viewport, camera or WebGL context.

import { snap } from "../ui/units";

export type EdgeTreatment = "fillet" | "chamfer";

export interface TreatmentField {
  /** the Feature field the value is stored in (mm) */
  name: "radius" | "distance";
  /** the one-letter label on the heads-up input */
  label: "R" | "D";
}

export interface ValueBounds {
  min: number;
  max: number;
}

/** Smallest value worth committing, in mm. Below this OCCT either refuses or
 *  produces a blend nobody can see, so it is the floor for a TYPED value; a
 *  DRAGGED one stops at a whole snap step (see dragBounds). */
export const MIN_EDGE_VALUE = 0.001;

/** How much of the model's bounding-box diagonal a dragged value may reach.
 *
 *  A blend can never exceed roughly half the shortest side of the faces it
 *  joins, and for a cube of side s the diagonal is s·√3 — so s/2 is ≈0.29 of
 *  the diagonal. A quarter is comfortably inside that for anything box-ish and
 *  still far larger than a sane fillet, which is the point: the clamp exists to
 *  stop a flick of the mouse from running the number to 10⁴ mm and firing a
 *  string of doomed OCCT rebuilds, not to second-guess the user. Typed values
 *  are deliberately NOT clamped by it. */
export const MAX_DIAGONAL_FRACTION = 0.25;

export function treatmentField(kind: EdgeTreatment): TreatmentField {
  return kind === "fillet" ? { name: "radius", label: "R" } : { name: "distance", label: "D" };
}

export function otherTreatment(kind: EdgeTreatment): EdgeTreatment {
  return kind === "fillet" ? "chamfer" : "fillet";
}

/** Human name for prompts and the gizmo readout. */
export function treatmentLabel(kind: EdgeTreatment): string {
  return kind === "fillet" ? "Fillet" : "Chamfer";
}

/** Bounds for a DRAGGED value.
 *
 *  The floor is one snap step rather than zero: the step scales with zoom, so
 *  it is "one visible increment at the size you are looking at", and stopping
 *  there means dragging backwards past the edge parks the value at the smallest
 *  thing you could have meant instead of sliding through zero into a negative
 *  radius the kernel would reject. */
export function dragBounds(step: number, modelDiagonal: number | null): ValueBounds {
  const min = step > 0 && Number.isFinite(step) ? step : MIN_EDGE_VALUE;
  const max =
    modelDiagonal != null && modelDiagonal > 0 && Number.isFinite(modelDiagonal)
      ? Math.max(min, modelDiagonal * MAX_DIAGONAL_FRACTION)
      : Infinity;
  return { min, max };
}

export function clampValue(v: number, bounds: ValueBounds): number {
  if (!Number.isFinite(v)) return bounds.min;
  return Math.min(bounds.max, Math.max(bounds.min, v));
}

export interface Scrub {
  /** value in mm when the handle was grabbed */
  grabValue: number;
  /** axis projection (mm) at grab time */
  grabProj: number;
  /** axis projection (mm) now */
  proj: number;
  /** snap granularity in mm */
  step: number;
  bounds: ValueBounds;
}

/** Value for the current pointer position: the grab value plus how far the
 *  cursor has travelled along the handle's axis, snapped to a clean step so the
 *  readout says 2.5 rather than 2.4713, then clamped. Relative to the grab (not
 *  absolute along the axis) so grabbing the handle never makes the value jump. */
export function scrubValue(s: Scrub): number {
  return clampValue(snap(s.grabValue + (s.proj - s.grabProj), s.step), s.bounds);
}

/** Flip fillet ↔ chamfer, carrying the number across untouched.
 *
 *  This IS the interaction the whole gesture exists for: a fillet's radius and a
 *  chamfer's setback are the same drag magnitude off the same edge, so they are
 *  two renderings of one number rather than two commands. Re-clamped only
 *  because the caller may hand us a value from a different bounds regime (a
 *  typed one, or one dragged before the camera zoomed). */
export function switchTreatment(
  kind: EdgeTreatment,
  value: number,
  bounds: ValueBounds,
): { kind: EdgeTreatment; value: number } {
  return { kind: otherTreatment(kind), value: clampValue(value, bounds) };
}

/** Opening value for a fresh gesture. A 2 mm fillet / 1 mm chamfer is the
 *  familiar MCAD default, but on a model small enough that those overflow the
 *  drag bounds it is clamped — a default nobody can build is worse than a small
 *  one. */
export function seedValue(kind: EdgeTreatment, bounds: ValueBounds): number {
  return clampValue(kind === "fillet" ? 2 : 1, bounds);
}
