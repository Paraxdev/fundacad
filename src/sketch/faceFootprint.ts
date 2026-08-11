// The model's outline on a sketch plane — the shape a profile drawn there is
// actually sitting on. A sketch made on a face routinely runs off it, and the two
// halves are separate regions (region.ts says why), but only if the region
// detector is told where the face ends.
//
// Reads EDGES rather than faces: the viewport already holds every B-rep edge as an
// exact polyline, so "what bounds the face under this sketch" becomes "which of
// those lie IN the sketch plane". No triangle walking, no face id to keep in step
// across a rebuild, nothing extra in the document. A sketch plane is coplanar with
// its face by construction, so the edges passing that test ARE its boundary.
//
// Other geometry flush with the same plane is picked up too, and that is correct:
// the profile can sit on it, and its edge is also where support stops.

import * as THREE from "three";
import { chainLoops } from "./region";
import type { SketchPlane } from "./plane";

/** The shape of an edge as the viewport stores it (viewport/edgeLines.EdgeRef).
 *  Structural so nothing here depends on the renderer. */
export interface FootprintEdge {
  readonly points: readonly (readonly [number, number, number])[];
}

/** How far off the plane a point may sit and still count as ON it, relative to
 *  the model's own size.
 *
 *  Relative because an absolute figure means different things on a 6mm part and
 *  a 400mm one, and because tessellated points carry error proportional to the
 *  geometry that produced them. Generous enough to survive that, tight enough
 *  that the face 2mm below never qualifies. */
export const PLANE_TOL_FRACTION = 1e-4;

export function planeTolerance(modelScale: number): number {
  const s = Number.isFinite(modelScale) && modelScale > 0 ? modelScale : 0;
  return Math.max(1e-5, s * PLANE_TOL_FRACTION);
}

/** True when every sample of the polyline lies in the plane.
 *
 *  EVERY sample, not the midpoint or the ends: an edge that merely crosses the
 *  plane has both ends off it but passes any single-point test at the crossing,
 *  and admitting one would cut the profile along a line that is not a boundary
 *  of anything. */
export function edgeLiesInPlane(
  e: FootprintEdge,
  plane: SketchPlane,
  tol: number,
): boolean {
  if (e.points.length < 2) return false;
  const p = new THREE.Vector3();
  for (const q of e.points) {
    p.set(q[0], q[1], q[2]);
    if (Math.abs(plane.plane.distanceToPoint(p)) > tol) return false;
  }
  return true;
}

/** The model's outline on this sketch plane, as closed loops in sketch 2D mm —
 *  ready to hand to detectRegions as its footprint.
 *
 *  Empty when the plane has no model in it, which is the ordinary case for a
 *  sketch on a datum plane. Callers must pass an empty result through as
 *  "no footprint" rather than as "an empty face", or every profile on a datum
 *  plane would read as unsupported. */
export function planeFootprint(
  edges: readonly FootprintEdge[],
  plane: SketchPlane,
  modelScale: number,
): THREE.Vector2[][] {
  const tol = planeTolerance(modelScale);
  const flat: THREE.Vector2[][] = [];
  const p = new THREE.Vector3();
  for (const e of edges) {
    if (!edgeLiesInPlane(e, plane, tol)) continue;
    const poly: THREE.Vector2[] = [];
    for (const q of e.points) {
      p.set(q[0], q[1], q[2]);
      poly.push(plane.to2D(p, new THREE.Vector2()));
    }
    if (poly.length >= 2) flat.push(poly);
  }
  if (!flat.length) return [];
  return chainLoops(flat);
}
