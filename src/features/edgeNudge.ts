// The arrow that appears the moment you select an edge.
//
// Selecting an edge used to be a dead end: the edge lit up and you were
// expected to know that Fillet, Chamfer or a right-click menu would consume
// the selection. This puts the offer on screen instead — an arrow standing off
// the edge, the same arrow the fillet/chamfer tool uses, saying "pull me".
//
// It is deliberately NOT a tool:
//
//  - it does not set toolBusy(), because a passive affordance that blocked
//    every other command would be a modal state the user never entered. You can
//    select an edge and then do literally anything else.
//  - it does not touch suspendPicking, so normal selection keeps working
//    around it.
//  - it owns no value, no preview and no document state. Grabbing it hands the
//    gesture to EdgeFeatureTool, which owns all of that already; this file's
//    entire job is to be visible and to be grabbable.
//
// Per-frame work stays out of Vue: the transform is written straight onto the
// Three.js object in a rAF loop, the same way the tool gizmos do it.

import * as THREE from "three";
import type { Viewport } from "../viewport/viewport";
import type { EdgeRef } from "../viewport/edgeLines";
import { polylineMid } from "../viewport/edgeMatch";
import { createArrowHandle, disposeArrowHandle, edgeHandleAxis, HANDLE_UP } from "./manipulator";

type Vec3 = [number, number, number];

const HANDLE_IDLE = 0xffc83d; // amber — the manipulator handle colour
const HANDLE_HOT = 0xffe9a8; // brighter when hovered
// Dimmer than an armed tool's handle: this is an offer, not a live control,
// and it must not compete with the selected edge itself for attention.
const IDLE_OPACITY = 0.55;
const HOT_OPACITY = 1;

export interface EdgeNudgeDeps {
  /** Never show over an active tool/sketch — its own gizmos own the screen. */
  toolBusy: () => boolean;
  /** The handle was pressed at (x, y): arm the real gesture, already grabbed. */
  onGrab: (clientX: number, clientY: number, tangent: THREE.Vector3 | null) => void;
}

export class EdgeNudge {
  /** What we WANT drawn — a snapshot of plain numbers, not the EdgeRefs, so a
   *  rebuild swapping the model out from under us cannot leave the handle
   *  pointing at a disposed object. Null = nothing selected. */
  private want: { anchor: THREE.Vector3; tangent: THREE.Vector3 | null } | null = null;

  private group: THREE.Group | null = null;
  private material: THREE.MeshBasicMaterial | null = null;
  private axis = new THREE.Vector3(1, 0, 0);
  private quat = new THREE.Quaternion();
  private hovering = false;
  private raf = 0;

  private boundMove: (e: PointerEvent) => void;
  private boundDown: (e: PointerEvent) => void;
  private boundTick: () => void;

  constructor(
    private viewport: Viewport,
    private deps: EdgeNudgeDeps,
  ) {
    this.boundMove = (e) => this.onMove(e);
    this.boundDown = (e) => this.onDown(e);
    this.boundTick = () => this.tick();
  }

  /** Offer the handle for this edge selection; an empty selection hides it.
   *  Several edges get ONE handle — see handlePlacement for where it lands. */
  showFor(edges: EdgeRef[]) {
    const place = handlePlacement(edges.map((e) => e.points as Vec3[]));
    if (!place) {
      this.hide();
      return;
    }
    this.want = {
      anchor: new THREE.Vector3(...place.anchor),
      tangent: place.tangent && new THREE.Vector3(...place.tangent),
    };
    this.viewport.domElement.addEventListener("pointermove", this.boundMove);
    this.viewport.domElement.addEventListener("pointerdown", this.boundDown, true);
    if (!this.raf) this.raf = requestAnimationFrame(this.boundTick);
  }

  hide() {
    this.want = null;
    this.unmount();
    const el = this.viewport.domElement;
    el.removeEventListener("pointermove", this.boundMove);
    el.removeEventListener("pointerdown", this.boundDown, true);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Reconcile every frame rather than react to events.
   *
   *  A tool can start from a keyboard shortcut, a menu, the command palette or
   *  the browser tree, and a sketch can open from four more places — none of
   *  which route through anything this file could subscribe to. Asking
   *  toolBusy() once a frame covers all of them and, just as importantly, puts
   *  the handle BACK when the tool ends and the edge is still selected. The
   *  loop only runs while an edge is selected, so this costs one predicate call
   *  per frame in a state the user is briefly in. */
  private tick() {
    this.raf = requestAnimationFrame(this.boundTick);
    if (!this.want || this.deps.toolBusy()) {
      this.unmount();
      return;
    }
    if (!this.group || !this.material) this.mount();
    if (!this.group || !this.material) return;
    const { anchor, tangent } = this.want;
    // Recomputed per frame, not cached: the axis is defined against the CAMERA
    // (perpendicular to the edge, in the screen plane), so orbiting has to swing
    // the handle round with it or it ends up edge-on and unclickable.
    this.axis.copy(edgeHandleAxis(this.viewport, tangent));
    this.quat.setFromUnitVectors(HANDLE_UP, this.axis);
    this.group.position.copy(anchor);
    this.group.quaternion.copy(this.quat);
    this.group.scale.setScalar(this.viewport.pixelWorldSize(anchor));
    // The viewport renders on demand, and a raycast reads matrixWorld — which
    // is only refreshed by a render. Between two draws the handle would then be
    // hit-tested where it USED to be: visibly there, not grabbable. Two objects,
    // so composing it here every frame is cheaper than the bug.
    this.group.updateMatrixWorld(true);
  }

  private mount() {
    const { group, material } = createArrowHandle(HANDLE_IDLE);
    material.transparent = true;
    material.opacity = IDLE_OPACITY;
    this.group = group;
    this.material = material;
    this.viewport.addToScene(group);
  }

  private unmount() {
    if (!this.group || !this.material) return;
    this.viewport.removeFromScene(this.group);
    disposeArrowHandle(this.group, this.material);
    this.group = null;
    this.material = null;
    this.hovering = false;
  }

  private onMove(e: PointerEvent) {
    const hit = this.hitTest(e.clientX, e.clientY);
    if (hit === this.hovering) return;
    this.hovering = hit;
    if (this.material) {
      this.material.color.set(hit ? HANDLE_HOT : HANDLE_IDLE);
      this.material.opacity = hit ? HOT_OPACITY : IDLE_OPACITY;
    }
    // Only on a CHANGE: the viewport renders on demand, and repainting on every
    // pointermove that happened to miss the handle would defeat that.
    this.viewport.requestRender();
    // Cursor only while we own it — clearing it unconditionally would fight the
    // viewport's own hover cursor every time the pointer left the arrow.
    if (hit) this.viewport.domElement.style.cursor = "grab";
    else if (this.viewport.domElement.style.cursor === "grab") {
      this.viewport.domElement.style.cursor = "default";
    }
  }

  private onDown(e: PointerEvent) {
    if (e.button !== 0 || !this.want) return;
    if (this.deps.toolBusy()) return;
    if (!this.hitTest(e.clientX, e.clientY)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const tangent = this.want.tangent;
    // Drop the scene object before handing over — the tool mounts its own
    // handle at the same anchor with the same axis, and two arrows in one place
    // would z-fight. unmount(), not hide(): `want` survives, so the moment the
    // tool ends the tick puts the offer straight back. A rebuild in between is
    // fine now that setModel carries the selection over it — showFor() runs
    // again off the rebuilt edge and replaces `want` with an anchor that
    // matches the geometry actually on screen.
    this.unmount();
    this.deps.onGrab(e.clientX, e.clientY, tangent);
  }

  private hitTest(x: number, y: number): boolean {
    if (!this.group) return false;
    return this.viewport.rayFrom(x, y).intersectObjects(this.group.children, false).length > 0;
  }
}

/** Where the handle stands and which way it lies, from the selected edges'
 *  polylines. Null when there is nothing to stand on.
 *
 *  Kept pure (plain tuples in, plain tuples out — no viewport, no camera, no
 *  scene) because it is the part of this file a headless test can hold: the
 *  hit-testing and the projection above it need a real canvas and a real
 *  camera, which vitest does not have.
 *
 *  The anchor is the mean of the ARC-LENGTH midpoints, matching where
 *  EdgeFeatureTool anchors the same selection — the handle must not shift when
 *  the tool takes over. The tangent comes from the FIRST usable edge: with
 *  several edges there is no single right perpendicular, and one that at least
 *  lies across a real member reads better than the camera-right fallback.
 *  A null tangent means "no usable direction" and leaves that fallback to the
 *  caller, which is the only party that knows where the camera is. */
export function handlePlacement(
  polylines: Vec3[][],
): { anchor: Vec3; tangent: Vec3 | null } | null {
  const mids: Vec3[] = [];
  let tangent: Vec3 | null = null;
  for (const pts of polylines) {
    const mid = polylineMid(pts);
    if (!mid) continue;
    tangent ??= edgeTangent(pts);
    mids.push(mid);
  }
  if (!mids.length) return null;
  const anchor: Vec3 = [0, 0, 0];
  for (const m of mids) {
    anchor[0] += m[0];
    anchor[1] += m[1];
    anchor[2] += m[2];
  }
  return {
    anchor: [anchor[0] / mids.length, anchor[1] / mids.length, anchor[2] / mids.length],
    tangent,
  };
}

/** Unit direction first sample → last sample of an edge polyline, or null when
 *  there isn't one. Good enough for "which way is across this edge" even on a
 *  curve, where the chord and the true tangent at the midpoint diverge: the
 *  handle only has to stand clear of the edge, not measure it. A closed edge
 *  (a full circle: first sample === last) has no chord at all, hence null. */
function edgeTangent(points: Vec3[]): Vec3 | null {
  const a = points[0];
  const b = points[points.length - 1];
  if (!a || !b) return null;
  const t: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(t[0], t[1], t[2]);
  if (len < 1e-9) return null;
  return [t[0] / len, t[1] / len, t[2] / len];
}
