// Shared math and glyphs for interactive 3D manipulators (extrude / fillet /
// chamfer / press-pull): mapping a cursor ray onto a drag axis to read a signed
// scalar (a distance or radius in mm), and the handle you grab to do it.
// Kept in one place so the tools don't each carry a copy — and, since the
// passive selection handle hands its gesture over to the fillet/chamfer tool
// mid-press, so the two handles are provably the same handle.

import * as THREE from "three";
import type { Viewport } from "../viewport/viewport";
import { themeColor } from "../viewport/themeColors";

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

/** Orientation for a gizmo drawn FLAT AGAINST THE SCREEN: local +X along `axis`
 *  as the screen sees it, local +Y up the screen, local +Z out of it toward the
 *  camera. `fallbackRight` (the camera's own right) covers an axis pointing dead
 *  at the viewer, which has no screen direction to line up with.
 *
 *  The obvious spelling of this is three cross products into makeBasis, and the
 *  obvious spelling is what the profile arc shipped with — `up = fwd x right`,
 *  with `-fwd` in the third column. That basis is LEFT-handed: `fwd x right`
 *  points DOWN the screen, so its determinant is -1. Quaternion.setFromRotation-
 *  Matrix assumes a proper rotation, and handed a reflection it returns a
 *  non-unit quaternion standing for some unrelated rotation — which Object3D
 *  then applies as a tilt AND a shrink. So the arc was drawn at an essentially
 *  arbitrary angle, near enough edge-on at most orbits to disappear. Its knob is
 *  a sphere and its readout a sprite, both orientation-blind, so those two went
 *  on looking correct while the only part of the control that had to be oriented
 *  collapsed to a stub.
 *
 *  Handedness is also what keeps a curved control's two halves agreeing. A hit
 *  test reads screen angles with atan2 about a flipped y — i.e. +Y up — so a
 *  mirrored basis sends the knob one way round its track while the cursor is
 *  read the other way. */
export function screenPlaneOrientation(
  forward: THREE.Vector3,
  axis: THREE.Vector3,
  fallbackRight: THREE.Vector3,
): THREE.Quaternion {
  const fwd = forward.clone().normalize();
  const back = fwd.clone().negate(); // out of the screen, toward the camera
  const right = axis.clone().projectOnPlane(fwd);
  if (right.lengthSq() < 1e-9) right.copy(fallbackRight).projectOnPlane(fwd);
  // Only reachable if the caller's "right" was itself along the view direction;
  // any perpendicular beats returning a basis that isn't one.
  if (right.lengthSq() < 1e-9) right.set(1, 0, 0).projectOnPlane(fwd);
  if (right.lengthSq() < 1e-9) right.set(0, 1, 0).projectOnPlane(fwd);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(back, right).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(right, up, back),
  );
}

/** The smallest share of a handle's length that has to survive projection, as
 *  the sine of the angle between its axis and the view direction. 0.4 leaves
 *  about 21px of the glyph's 52 and costs at most 24 degrees of lean — enough
 *  that it still reads as a body standing along a direction, little enough that
 *  the direction it reads as is still the one the drag runs along. */
export const MIN_SCREEN_AXIS = 0.4;

/** The direction to DRAW a handle along when its own axis points at the camera.
 *
 *  The glyph is a 52px body standing along an axis. Stand it along the view
 *  direction and it projects to a 20px disc: no length to read, no length to
 *  aim at, and no hint of which way the gesture runs — the "squashed lump" a
 *  handle becomes when the camera swings round behind its axis. This tips the
 *  axis back out of the screen until at least `minScreen` of it survives,
 *  keeping the screen direction it already had and the side of the camera it was
 *  already on, so a slow orbit makes the handle lean rather than snap.
 *
 *  For DRAWING only, never for measuring. A press/pull distance means nothing
 *  unless it is measured along the real face normal, and a fillet radius nothing
 *  unless measured along the real drag axis. Nothing is lost by the split:
 *  axisDragDistance already drives an axis this steep off vertical mouse travel
 *  rather than off the axis's (by then nonexistent) screen extent. */
export function leanOutOfView(
  axis: THREE.Vector3,
  forward: THREE.Vector3,
  fallbackRight: THREE.Vector3,
  minScreen: number = MIN_SCREEN_AXIS,
): THREE.Vector3 {
  const fwd = forward.clone().normalize();
  const a = axis.clone().normalize();
  const along = a.dot(fwd);
  const flat = a.clone().addScaledVector(fwd, -along); // the part that shows on screen
  if (flat.length() >= minScreen) return a;
  // Dead-on: there is no screen direction to preserve, so borrow the camera's.
  const dir =
    flat.lengthSq() > 1e-12 ? flat.normalize() : fallbackRight.clone().projectOnPlane(fwd);
  if (dir.lengthSq() < 1e-12) return a; // nothing to lean towards; leave it be
  dir.normalize();
  const depth = Math.sqrt(Math.max(0, 1 - minScreen * minScreen)) * (along < 0 ? -1 : 1);
  return dir.multiplyScalar(minScreen).addScaledVector(fwd, depth).normalize();
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
// Painted from the app's own accent tokens rather than from a palette of its
// own. Each theme runs a single accent (styles/_themes.scss) and the manipulator
// is the most-looked-at thing on screen, so it is the last place that should be
// carrying colours the chrome no longer uses.

// The literals are FALLBACKS, not the palette: each is read from its theme token
// at paint time (viewport/themeColors.ts) so a manipulator can never be the one
// part of the app still wearing the previous theme. They stay as the answer for
// a headless context with no document to resolve against.

/** `--accent` */
export const HANDLE_IDLE = 0xff7a3c;
/** `--accent-hot`, for hover and grab */
export const HANDLE_HOT = 0xff9a5c;
/** `--error`, for a push that removes material rather than adding it */
export const HANDLE_CUT = 0xff5c5c;
/** `--bg`: the app's deepest surface, so the blob keeps its shape against a
 *  light face — and stays an outline rather than a halo under a light theme. */
const HANDLE_OUTLINE = 0x0e0f12;

function idleColor() {
  return themeColor("--accent", HANDLE_IDLE);
}
function hotColor() {
  return themeColor("--accent-hot", HANDLE_HOT);
}
function cutColor() {
  return themeColor("--error", HANDLE_CUT);
}

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
    color: idleColor(),
    emissive: idleColor(),
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
    color: themeColor("--bg", HANDLE_OUTLINE),
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
  // Resolved on every repaint, not captured once: a theme change has to reach a
  // handle that is already on screen, and repaint is the only moment its colour
  // is allowed to move.
  const apply = () => {
    const base = currentTone === "cut" ? cutColor() : idleColor();
    const c = hot ? hotColor() : base;
    body.color.set(c);
    body.emissive.set(c);
    outlineMat.color.set(themeColor("--bg", HANDLE_OUTLINE));
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
