// Shared math and glyphs for interactive 3D manipulators (extrude / fillet /
// chamfer / press-pull): mapping a cursor ray onto a drag axis to read a signed
// scalar (a distance or radius in mm), and the handle you grab to do it.
// Kept in one place so the tools don't each carry a copy — and, since the
// passive selection handle hands its gesture over to the fillet/chamfer tool
// mid-press, so the two handles are provably the same handle.

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

/** The Y-up direction the handle glyph below is modelled along; orient a handle
 *  with `quat.setFromUnitVectors(HANDLE_UP, axis)`. */
export const HANDLE_UP = new THREE.Vector3(0, 1, 0);

/** Pick the sign of a drag axis so it points AWAY from the body.
 *
 *  `perp` is only defined up to a sign, and the cross product that produced it
 *  has no idea which side the material is on — so the handle used to stand
 *  outward or bury itself in the solid depending on nothing more than which way
 *  the camera happened to be facing. Comparing against the direction from the
 *  body's centre to the anchor settles it.
 *
 *  A centre-to-anchor test is exact for a convex body and right almost
 *  everywhere else; it only misreads deep inside a concave pocket, where "out"
 *  is genuinely ambiguous. The alternative — averaging the two adjacent face
 *  normals — needs adjacency the viewport does not carry, for a case this
 *  already handles.
 */
export function orientOutward(
  perp: THREE.Vector3,
  anchor: THREE.Vector3 | null,
  centre: THREE.Vector3 | null,
): THREE.Vector3 {
  if (!anchor || !centre) return perp;
  const out = anchor.clone().sub(centre);
  if (out.lengthSq() < 1e-9) return perp; // handle sits ON the centre: no "out"
  return perp.dot(out) < 0 ? perp.negate() : perp;
}

/** Drag axis for a handle sitting ON an edge: perpendicular to the edge and
 *  lying in the screen plane, so the handle stands clear of the edge instead of
 *  vanishing into it — and, given `anchor` and the body `centre`, pointing out
 *  of the material rather than into it. Falls back to the camera's right vector
 *  when there is no tangent (a multi-edge pre-selection) or the edge points at
 *  the camera.
 *
 *  Shared rather than duplicated because the passive selection handle and the
 *  armed tool must agree to the last digit: the handle is grabbed and the tool
 *  arms inside the SAME pointerdown, and an axis that differed by a hair would
 *  make the handle visibly jump — and steer the drag somewhere else — at the
 *  exact moment the user commits to the gesture. That is also why the outward
 *  flip lives here rather than in either caller. */
export function edgeHandleAxis(
  viewport: Viewport,
  tangent: THREE.Vector3 | null,
  anchor?: THREE.Vector3 | null,
  centre?: THREE.Vector3 | null,
): THREE.Vector3 {
  const fwd = viewport.camera.getWorldDirection(new THREE.Vector3());
  if (tangent) {
    const perp = tangent.clone().cross(fwd);
    if (perp.lengthSq() > 1e-6) {
      return orientOutward(perp.normalize(), anchor ?? null, centre ?? null);
    }
  }
  const right = new THREE.Vector3().setFromMatrixColumn(viewport.camera.matrixWorld, 0).normalize();
  return orientOutward(right, anchor ?? null, centre ?? null);
}

/** What letting go of the handle should do. */
export type FluentRelease = "commit" | "cancel" | "stay";

/** Releasing the handle: commit, throw the gesture away, or stay armed.
 *
 *  A gesture that began on the PASSIVE selection handle is one press — press,
 *  drag, release, done. That is the entire point of the affordance, and leaving
 *  the tool armed afterwards would strand the user in a modal state they never
 *  opted into. A gesture that began on the tool's own gizmo is the classic
 *  flow and keeps its explicit commit.
 *
 *  Two cases inside the fluent one are easy to get wrong:
 *
 *  `moved` — a press that never travelled is not a drag. It must not commit a
 *  default value off a stray click on the handle, so it stays armed instead,
 *  which doubles as the way IN to the full tool from the handle.
 *
 *  `meaningful` — a drag that ended back at nothing (zero radius, zero
 *  distance) has nothing to commit. Staying armed would strand exactly the user
 *  who was trying to back out, so it cancels. The tools disagreed about this
 *  before it lived in one place: one cancelled, the other set a prompt and
 *  stayed. */
export function fluentRelease(opts: {
  fluent: boolean;
  moved: boolean;
  meaningful: boolean;
}): FluentRelease {
  if (!opts.fluent || !opts.moved) return "stay";
  return opts.meaningful ? "commit" : "cancel";
}

// --- the grab handle ------------------------------------------------------
//
// Molten amber, from the app's own accent tokens (styles/_tokens.scss) — the
// theme runs a single accent on near-black graphite and has no blue at all
// (`--accent-blue` is an alias for the amber), so a cool-toned manipulator would
// belong to a different app.

/** `--accent` */
export const HANDLE_IDLE = 0xff7a3c;
/** `--accent-hot`, for hover and grab */
export const HANDLE_HOT = 0xff9a5c;
/** `--error`, for a push that removes material rather than adding it */
export const HANDLE_CUT = 0xff5c5c;
/** Near-black outline, so the blob keeps its shape against a light face */
const HANDLE_OUTLINE = 0x140f0c;

/** Which base colour a handle is wearing. */
export type HandleTone = "idle" | "cut";

export interface DragHandle {
  /** Add this to the scene; scale it by pixelWorldSize(anchor) each frame. */
  group: THREE.Group;
  /** Repaint. Omitted fields keep their current value. */
  paint(opts: { hot?: boolean; tone?: HandleTone; opacity?: number }): void;
  /** Free GPU resources. Removing the group from the scene stays the caller's
   *  job — only it knows which scene that is. */
  dispose(): void;
}

/** The lathe profile, as (radius, height) in PIXELS: a soft stem that swells
 *  into a fat rounded head.
 *
 *  Deliberately NOT an arrow. Two reasons, one aesthetic and one behavioural:
 *
 *  An arrowhead promises a direction, and these handles no longer have one —
 *  the edge drag runs a fillet one way and a chamfer the other through zero,
 *  and press/pull adds one way and cuts the other. A symmetric head says "slide
 *  me along this line", which is what they actually do.
 *
 *  And a 1.6px shaft is a miserable target. The head is where the eye goes and
 *  where the cursor goes, so the glyph puts its mass there instead of spending
 *  it on a stalk. (The real fix for aiming is the grab volume below; this is
 *  what makes the drawn shape agree with it.)
 */
const PROFILE: [number, number][] = [
  [0.0, 6.0], // sits off the surface so it never buries in the face it stands on
  [2.8, 6.6],
  [3.1, 12.0],
  [2.7, 20.0], // waist
  [3.3, 26.0],
  [6.4, 30.5], // flare
  [9.5, 36.0],
  [9.7, 41.0], // widest
  [7.5, 46.0],
  [4.0, 50.0],
  [0.0, 52.0], // pole
];

/** How far off the axis a press still counts as grabbing the handle, in pixels.
 *
 *  The whole point of the overhaul. The old handle was hit-tested against its
 *  own geometry, so grabbing it meant landing on a 1.6px shaft or a 5px cone —
 *  fine as a drawn mark, far too fine as a target, which is why it took careful
 *  aim. These proxies never draw; they only widen what counts as a hit. Three's
 *  raycaster tests layers and never `visible`, so an invisible mesh is still
 *  pickable — locked down by a test, since the whole affordance rests on it. */
const GRAB_HEAD = 17;
const GRAB_STEM = 11;

function lathe(): THREE.LatheGeometry {
  // Sample a spline through the control points rather than lathing the polyline
  // itself: the corners between segments would otherwise show as visible facets
  // right where the shape is supposed to read as soft.
  const spline = new THREE.SplineCurve(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)));
  return new THREE.LatheGeometry(spline.getPoints(56), 28);
}

export function createDragHandle(tone: HandleTone = "idle"): DragHandle {
  const group = new THREE.Group();
  group.renderOrder = 999;

  // Lit, not flat: the scene's key/fill/hemisphere lights are what make this
  // read as a rounded body rather than a silhouette. The emissive floor keeps it
  // legible when the lights are behind it — and doubles as the "molten" of the
  // theme's molten amber.
  const body = new THREE.MeshLambertMaterial({
    color: HANDLE_IDLE,
    emissive: HANDLE_IDLE,
    emissiveIntensity: 0.5,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 1,
  });
  const geo = lathe();
  const blob = new THREE.Mesh(geo, body);
  blob.renderOrder = 999;

  // A back-face shell a touch larger — an outline, so the blob holds its shape
  // over a pale face where amber-on-white would otherwise wash out.
  const outlineMat = new THREE.MeshBasicMaterial({
    color: HANDLE_OUTLINE,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 1,
  });
  const outline = new THREE.Mesh(geo, outlineMat);
  outline.scale.setScalar(1.13);
  outline.renderOrder = 998;

  // Invisible, generous, and DIRECT children of the group: every consumer hit
  // tests with intersectObjects(group.children, false), so widening the target
  // needs no change at any call site.
  const hidden = new THREE.MeshBasicMaterial({ visible: false, depthTest: false });
  const grabHead = new THREE.Mesh(new THREE.SphereGeometry(GRAB_HEAD, 10, 8), hidden);
  grabHead.position.y = 38;
  const grabStem = new THREE.Mesh(
    new THREE.CylinderGeometry(GRAB_STEM, GRAB_STEM, 30, 8),
    hidden,
  );
  grabStem.position.y = 19;

  group.add(outline, blob, grabHead, grabStem);

  let hot = false;
  let currentTone: HandleTone = tone;
  const apply = () => {
    const base = currentTone === "cut" ? HANDLE_CUT : HANDLE_IDLE;
    const c = hot ? HANDLE_HOT : base;
    body.color.set(c);
    body.emissive.set(c);
  };
  apply();

  return {
    group,
    paint(opts) {
      if (opts.hot !== undefined) hot = opts.hot;
      if (opts.tone !== undefined) currentTone = opts.tone;
      if (opts.hot !== undefined || opts.tone !== undefined) apply();
      if (opts.opacity !== undefined) {
        body.opacity = opts.opacity;
        // The outline fades faster than the body: at the passive handle's 55%
        // a full-strength outline reads as the loudest thing on screen, which
        // is backwards for an offer the user has not accepted yet.
        outlineMat.opacity = opts.opacity * 0.8;
      }
    },
    dispose() {
      geo.dispose();
      grabHead.geometry.dispose();
      grabStem.geometry.dispose();
      body.dispose();
      outlineMat.dispose();
      hidden.dispose();
    },
  };
}
