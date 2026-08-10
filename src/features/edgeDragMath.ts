// The arithmetic behind the direct-manipulation edge gesture: turning a drag
// along the handle's axis into a radius/distance, flipping between the two edge
// treatments mid-gesture, and keeping the dragged number inside what the kernel
// can plausibly build.
//
// The drag is SIGNED, and that is the whole design: one axis carries both
// treatments, with "nothing" at the origin between them. Drag the arrow the way
// it points and you get a fillet whose radius is how far you dragged; keep
// pulling back through the origin and the same travel becomes a chamfer's
// setback; stop at the origin and there is no feature at all. Changing your mind
// therefore costs a mouse movement rather than an abort and a restart — which is
// what the earlier one-sided drag (floored at a snap step, so it could neither
// reach zero nor cross it) forced on you.
//
// Split out of edgeFeatureTool.ts on purpose. The tool itself is pointer
// plumbing — listeners, a Three.js gizmo, a sidecar preview — none of which can
// run in the headless test suite. These functions are the part that can actually
// be wrong in a way a user notices, so they live where vitest can reach them
// with no viewport, camera or WebGL context.

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
 *  produces a blend nobody can see — so it is both the floor for a TYPED value
 *  and, for a dragged one, the test for "the user is sitting on the origin and
 *  has asked for no feature at all". */
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

/** How far a dragged value may travel from the origin, in mm — the same cap on
 *  BOTH sides, since a chamfer that overruns the face is no more buildable than
 *  a fillet that does. Infinity when the document has no geometry to measure. */
export function dragLimit(modelDiagonal: number | null): number {
  if (modelDiagonal == null || !(modelDiagonal > 0) || !Number.isFinite(modelDiagonal)) {
    return Infinity;
  }
  return Math.max(MIN_EDGE_VALUE, modelDiagonal * MAX_DIAGONAL_FRACTION);
}

/** Bounds for a value the user is free to choose outright (a typed one, or one
 *  carried across a Tab flip): anything the kernel might build, floored at the
 *  smallest visible blend. */
export function valueBounds(modelDiagonal: number | null): ValueBounds {
  return { min: MIN_EDGE_VALUE, max: dragLimit(modelDiagonal) };
}

export function clampValue(v: number, bounds: ValueBounds): number {
  if (!Number.isFinite(v)) return bounds.min;
  return Math.min(bounds.max, Math.max(bounds.min, v));
}

export interface Scrub {
  /** signed offset in mm when the handle was grabbed (see scrubSigned) */
  grabSigned: number;
  /** axis projection (mm) at grab time */
  grabProj: number;
  /** axis projection (mm) now */
  proj: number;
  /** snap granularity in mm */
  step: number;
  /** largest magnitude the drag may reach, either side of the origin */
  limit: number;
}

/** Signed offset for the current pointer position: where the drag started plus
 *  how far the cursor has travelled along the handle's axis, snapped to a clean
 *  step so the readout says 2.5 rather than 2.4713, then held inside ±limit.
 *  Relative to the grab (not absolute along the axis) so taking hold of the
 *  handle never makes the value jump.
 *
 *  Exactly 0 inside a one-step dead zone around the origin. Snapping alone would
 *  already produce 0 within half a step, but half a step is ~4 px of mouse
 *  travel — too fine a target for a state the user has to be able to stop in on
 *  purpose, since it is how the gesture is abandoned. A whole step either side
 *  makes the origin a detent you can feel, and the first value past it is one
 *  clean increment rather than a jump. */
export function scrubSigned(s: Scrub): number {
  const raw = s.grabSigned + (s.proj - s.grabProj);
  if (!Number.isFinite(raw)) return 0;
  const dead = s.step > 0 && Number.isFinite(s.step) ? s.step : MIN_EDGE_VALUE;
  if (Math.abs(raw) < dead) return 0;
  const stepped = snap(raw, s.step);
  const limit = s.limit > 0 ? s.limit : Infinity;
  return Math.sign(stepped) * Math.min(Math.abs(stepped), limit);
}

/** Read a signed offset as a treatment: `positive` is the one the arrow's own
 *  direction means, its opposite lives on the other side of the origin, and the
 *  magnitude is the radius or setback either way.
 *
 *  A radius and a setback are the same drag off the same edge, which is why one
 *  axis can carry both — the sign is the only thing that distinguishes them. At
 *  exactly 0 the value is 0 and the reported kind is arbitrary; callers keep
 *  showing whichever they had rather than let the label flicker at the
 *  crossing. */
export function treatmentAt(
  positive: EdgeTreatment,
  signed: number,
): { kind: EdgeTreatment; value: number } {
  return {
    kind: signed < 0 ? otherTreatment(positive) : positive,
    value: Math.abs(signed),
  };
}

/** Flip fillet ↔ chamfer in place, carrying the number across untouched — what
 *  Tab does, and the only way to switch a value that was TYPED rather than
 *  dragged (a typed number has no side of the origin to be on).
 *
 *  Re-clamped only because the caller may hand us a value from a different
 *  bounds regime (a typed one, or one dragged before the camera zoomed). */
export function switchTreatment(
  kind: EdgeTreatment,
  value: number,
  bounds: ValueBounds,
): { kind: EdgeTreatment; value: number } {
  return { kind: otherTreatment(kind), value: clampValue(value, bounds) };
}

/** Opening value for a gesture that starts from a command rather than from the
 *  handle — the tool has to show SOMETHING the moment it arms. (A gesture that
 *  starts by grabbing the handle opens at 0 instead: there the drag itself is
 *  the value, measured from where you pressed.)
 *
 *  A 2 mm fillet / 1 mm chamfer is the familiar MCAD default, but on a model
 *  small enough that those overflow the drag bounds it is clamped — a default
 *  nobody can build is worse than a small one. */
export function seedValue(kind: EdgeTreatment, bounds: ValueBounds): number {
  return clampValue(kind === "fillet" ? 2 : 1, bounds);
}
