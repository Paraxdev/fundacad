// Shared math and glyphs for interactive 3D manipulators (extrude / fillet /
// chamfer / press-pull): mapping a cursor ray onto a drag axis to read a signed
// scalar (a distance or radius in mm), and the arrow handle you grab to do it.
// Kept in one place so the tools don't each carry a copy — and, since the
// passive selection handle hands its gesture over to the fillet/chamfer tool
// mid-press, so the two arrows are provably the same arrow.

import * as THREE from "three";
import type { Viewport } from "../viewport/viewport";

/** Signed distance along `dir` (unit) of the closest point on the axis
 *  (through `origin`) to the cursor `ray`. Ill-conditioned when the camera
 *  looks down the axis — use axisDragDistance for interactive drags. */
export function distanceAlongAxis(
  ray: THREE.Ray,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
): number {
  const w0 = ray.origin.clone().sub(origin);
  const b = ray.direction.dot(dir);
  const d = ray.direction.dot(w0);
  const e = dir.dot(w0);
  const denom = 1 - b * b; // a=c=1 (unit vectors)
  if (Math.abs(denom) < 1e-6) return -e;
  return (e - b * d) / denom; // signed param along dir
}

/** Drag distance along a world axis for a cursor position — robust at EVERY
 *  view angle. The closest-point solution above degenerates when the camera
 *  looks down the axis (in an orthographic top view it returns a CONSTANT, so
 *  dragging a top-facing face did nothing at all). Near the degeneracy this
 *  projects the axis to screen space and measures the cursor along it; when
 *  the axis has no screen extent (pointing dead at the camera), vertical mouse
 *  motion drives it — up = toward the viewer. */
export function axisDragDistance(
  viewport: Viewport,
  clientX: number,
  clientY: number,
  anchor: THREE.Vector3,
  axis: THREE.Vector3,
): number {
  const ray = viewport.rayFrom(clientX, clientY).ray;
  if (Math.abs(ray.direction.dot(axis)) < 0.95) {
    return distanceAlongAxis(ray, anchor, axis);
  }
  const px = viewport.pixelWorldSize(anchor); // world units per screen pixel
  const step = px * 40;
  const p0 = viewport.projectToScreen(anchor);
  const p1 = viewport.projectToScreen(anchor.clone().addScaledVector(axis, step));
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (len > 6) {
    // cursor offset along the screen-projected axis, mapped back to world
    return (((clientX - p0.x) * dx + (clientY - p0.y) * dy) / len) * (step / len);
  }
  // axis points dead at / away from the camera
  const camDir = viewport.camera.getWorldDirection(new THREE.Vector3());
  const sign = axis.dot(camDir) < 0 ? 1 : -1; // toward the viewer → mouse up = +
  return (p0.y - clientY) * px * sign;
}

/** The Y-up direction the arrow glyph below is modelled along; orient a handle
 *  with `quat.setFromUnitVectors(HANDLE_UP, axis)`. */
export const HANDLE_UP = new THREE.Vector3(0, 1, 0);

/** Drag axis for a handle sitting ON an edge: perpendicular to the edge and
 *  lying in the screen plane, so the arrow stands clear of the edge instead of
 *  vanishing into it. Falls back to the camera's right vector when there is no
 *  tangent (a multi-edge pre-selection) or the edge points at the camera.
 *
 *  Shared rather than duplicated because the passive selection handle and the
 *  armed tool must agree to the last digit: the handle is grabbed and the tool
 *  arms inside the SAME pointerdown, and an axis that differed by a hair would
 *  make the arrow visibly jump — and steer the drag somewhere else — at the
 *  exact moment the user commits to the gesture. */
export function edgeHandleAxis(viewport: Viewport, tangent: THREE.Vector3 | null): THREE.Vector3 {
  const fwd = viewport.camera.getWorldDirection(new THREE.Vector3());
  if (tangent) {
    const perp = tangent.clone().cross(fwd);
    if (perp.lengthSq() > 1e-6) return perp.normalize();
  }
  return new THREE.Vector3().setFromMatrixColumn(viewport.camera.matrixWorld, 0).normalize();
}

/** The grab-me arrow: a shaft + cone modelled in PIXEL units along +Y, with a
 *  gap at the base so it doesn't bury itself in the face/edge it stands on. The
 *  owner scales it by viewport.pixelWorldSize(anchor) every frame to hold a
 *  constant on-screen size. depthTest off + a high renderOrder so it is always
 *  visible, and therefore always grabbable, however the model occludes it. */
export function createArrowHandle(color: number): {
  group: THREE.Group;
  material: THREE.MeshBasicMaterial;
} {
  const material = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 34, 12), material);
  shaft.position.y = 6 + 17; // gap off the surface + half the shaft length
  const head = new THREE.Mesh(new THREE.ConeGeometry(5, 13, 18), material);
  head.position.y = 6 + 34 + 6.5;
  const group = new THREE.Group();
  group.add(shaft, head);
  group.renderOrder = 999;
  shaft.renderOrder = 999;
  head.renderOrder = 999;
  return { group, material };
}

/** Free an arrow handle's GPU resources. The caller still owns removing the
 *  group from the scene — only it knows which scene that is. */
export function disposeArrowHandle(group: THREE.Group, material: THREE.MeshBasicMaterial) {
  for (const child of group.children) {
    if (child instanceof THREE.Mesh) child.geometry.dispose();
  }
  material.dispose();
}
