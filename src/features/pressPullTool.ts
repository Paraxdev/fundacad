// Interactive Press/Pull (MCAD-style): pick a solid face, then grab a small
// arrow handle on it and drag along the face normal to add material (boss / pull
// out), cut material (pocket / push in), or resize a cylindrical face (hole/boss)
// — with a LIVE preview. Same interaction as Fillet/Chamfer (EdgeFeatureTool): an
// on-top, constant-screen-size gizmo you grab and scrub; a clean click commits.
//
// Like Fillet (and unlike sketch Extrude) the result can't be faked client-side —
// a real surface offset needs build123d/OCCT — so the preview is sidecar-driven:
// the un-committed feature is appended via store.setPreview() and the normal
// rebuild pipeline renders it. Commit promotes it (records undo); Esc reverts.

import * as THREE from "three";
import type { Viewport } from "../viewport/viewport";
import type { DocumentStore } from "../document/store";
import type { Feature, Selector } from "../types";
import { DimInput } from "../sketch/dimInput";
import { setPrompt } from "../ui/prompt";
import { snap } from "../ui/units";
import {
  axisDragDistance,
  createArrowHandle,
  disposeArrowHandle,
  fluentRelease,
  HANDLE_UP,
} from "./manipulator";

type Phase = "pick" | "drag";

const Y_AXIS = HANDLE_UP;
const HANDLE_IDLE = 0xffc83d; // amber (pull / add)
const HANDLE_HOT = 0xffe9a8; // brighter when hovered/grabbed
const HANDLE_CUT = 0xff6b5c; // red when pushing in (cut)

export class PressPullTool {
  active = false;
  private phase: Phase = "pick";
  private faces: Selector[] = []; // one or more faces pushed together by `value`
  private faceIds: number[] = []; // their mesh faceIds (for the instant ghost preview)
  private upTo: Selector | null = null; // "extrude up to this surface" target (else by distance)
  private pickingTarget = false; // waiting for the user to click the up-to target surface
  private bodyId: string | null = null; // the body that owns the picked face
  private anchor = new THREE.Vector3(); // gizmo origin = the clicked point on the face
  private axis = new THREE.Vector3(0, 0, 1); // drag axis (unit) = face outward normal
  private quat = new THREE.Quaternion(); // Y -> current arrow direction
  private value = 0; // signed distance in mm (+ along normal / out, − in)
  private previewId = ""; // id shared by the live preview and the committed feature

  private gizmo: THREE.Group | null = null;
  private gizmoMat: THREE.MeshBasicMaterial | null = null;
  private hovering = false;
  private grabbing = false;
  /** true when this drag began on the passive selection handle rather than on
   *  our own gizmo — a one-press gesture, so releasing it finishes (see onUp). */
  private fluentGrab = false;
  private grabValue = 0; // value at grab start (relative drag)
  private grabProj = 0; // axis projection at grab start
  private downPos = { x: 0, y: 0 };
  private downOnGizmo = false;
  private raf = 0;

  private dim = new DimInput();
  private onDone: ((id: string | null) => void) | null = null;

  private boundMove: (e: PointerEvent) => void;
  private boundDown: (e: PointerEvent) => void;
  private boundUp: (e: PointerEvent) => void;
  private boundKey: (e: KeyboardEvent) => void;
  private boundTick: () => void;

  constructor(
    private viewport: Viewport,
    private store: DocumentStore,
  ) {
    this.boundMove = (e) => this.onMove(e);
    this.boundDown = (e) => this.onDown(e);
    this.boundUp = (e) => this.onUp(e);
    this.boundKey = (e) => this.onKey(e);
    this.boundTick = () => this.tick();
  }

  /** `opts.grabAt` is the direct-manipulation entry (features/faceNudge.ts):
   *  the user pressed the handle that appears the moment a face is selected, so
   *  we arm from that pre-selection AND begin scrubbing inside the same
   *  pointerdown. The handle derived its anchor and axis from the same
   *  selectedFacesForPressPull() call this does, so there is nothing to adopt
   *  and nothing that can disagree. */
  start(onDone: (id: string | null) => void, opts?: { grabAt?: { x: number; y: number } }) {
    if (this.active) return;
    // pre-selection: faces already selected → skip straight to the drag.
    // Read BEFORE anything is installed, because the direct-manipulation entry
    // needs the selection its handle was drawn for: if a rebuild landed between
    // the paint and the press, arming into the pick phase would be a
    // bait-and-switch into a tool nobody asked for — and it would hold
    // toolBusy() until noticed.
    const pre = this.viewport.selectedFacesForPressPull();
    if (opts?.grabAt && !pre) return;
    this.active = true;
    this.phase = "pick";
    this.onDone = onDone;
    this.viewport.suspendPicking = true; // we drive our own face picking
    const el = this.viewport.domElement;
    el.addEventListener("pointermove", this.boundMove);
    el.addEventListener("pointerdown", this.boundDown, true);
    el.addEventListener("pointerup", this.boundUp);
    window.addEventListener("keydown", this.boundKey, true);

    if (pre) {
      this.beginDrag(pre.selectors, pre.faceIds, pre.anchor, pre.normal, pre.bodyId);
      if (opts?.grabAt) this.grabHandle(opts.grabAt.x, opts.grabAt.y);
    } else {
      setPrompt("Select a face to Press/Pull (Ctrl+click adds more)");
    }
  }

  /** Take hold of the arrow at (x, y) without a fresh pointerdown of our own —
   *  the press that started the gesture landed on the passive selection handle,
   *  before this tool existed. Everything after this point is the ordinary
   *  drag: the same onMove scrub, the same onUp release. */
  private grabHandle(clientX: number, clientY: number) {
    if (this.phase !== "drag") return;
    this.grabbing = true;
    this.fluentGrab = true;
    this.downOnGizmo = true;
    this.downPos = { x: clientX, y: clientY };
    this.grabValue = this.value;
    this.grabProj = axisDragDistance(this.viewport, clientX, clientY, this.anchor, this.axis);
    this.viewport.domElement.style.cursor = "grabbing";
  }

  private onMove(e: PointerEvent) {
    if (this.phase === "pick") {
      const faceId = this.viewport.hoverFaceAt(e.clientX, e.clientY);
      this.viewport.domElement.style.cursor = faceId != null ? "pointer" : "default";
      return;
    }
    if (this.grabbing) {
      const proj = axisDragDistance(this.viewport, e.clientX, e.clientY, this.anchor, this.axis);
      // snap the drag to 0.1mm steps (MCAD-style); type a value for finer control
      const raw = this.grabValue + (proj - this.grabProj);
      const stepped = snap(raw, this.viewport.snapStep(this.anchor));
      if (stepped === this.value) return; // same step — don't re-trigger an OCCT rebuild
      this.value = stepped;
      this.dim.updateFromCursor({ distance: Math.abs(this.value) });
      this.refreshPreview();
      return;
    }
    // idle: highlight the handle when hovered so it reads as grabbable
    this.hovering = this.hitGizmo(e.clientX, e.clientY);
    this.viewport.domElement.style.cursor = this.hovering ? "grab" : "default";
  }

  private onDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if (this.phase === "pick") {
      const hit = this.viewport.pickFaceForPressPull(e.clientX, e.clientY);
      if (!hit) return; // missed the body — let the click orbit
      e.preventDefault();
      e.stopImmediatePropagation();
      this.beginDrag([hit.selector], [hit.faceId], hit.anchor, hit.normal, hit.bodyId);
      return;
    }
    // drag phase: clicking the "up to" target surface (after pressing T).
    // Consume EVERY click in this mode — a miss must never fall through to the
    // clean-click-commits path and fire a stray plain commit (audit bug #3).
    if (this.pickingTarget) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const hit = this.viewport.pickFaceForPressPull(e.clientX, e.clientY);
      if (hit && !this.faceIds.includes(hit.faceId)) {
        this.upTo = hit.selector;
        this.commitUpTo();
      } else {
        setPrompt("Pick the face to extrude UP TO (any face, any body) · Esc to go back");
      }
      return;
    }
    // drag phase: Ctrl/Cmd-click another face on the SAME body adds it to the
    // operation (all faces share the one distance). Do this before the grab check.
    if (e.ctrlKey || e.metaKey) {
      const hit = this.viewport.pickFaceForPressPull(e.clientX, e.clientY);
      if (hit && hit.bodyId === this.bodyId) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.faces.push(hit.selector);
        this.faceIds.push(hit.faceId);
        this.refreshPreview();
        setPrompt(`${this.faces.length} faces — drag or type a distance · click to commit · Esc to cancel`);
      }
      return;
    }
    // grabbing the handle scrubs; a clean click elsewhere commits
    this.downPos = { x: e.clientX, y: e.clientY };
    this.downOnGizmo = this.hitGizmo(e.clientX, e.clientY);
    if (this.downOnGizmo) {
      e.preventDefault();
      e.stopImmediatePropagation(); // don't let the camera orbit while dragging the handle
      this.grabbing = true;
      this.grabValue = this.value;
      this.grabProj = axisDragDistance(this.viewport, e.clientX, e.clientY, this.anchor, this.axis);
      this.viewport.domElement.style.cursor = "grabbing";
    }
  }

  private onUp(e: PointerEvent) {
    if (e.button !== 0 || this.phase !== "drag") return;
    if (this.pickingTarget) return; // T-mode clicks are fully handled in onDown
    if (this.grabbing) {
      this.grabbing = false;
      const release = fluentRelease({
        fluent: this.fluentGrab,
        moved:
          Math.abs(e.clientX - this.downPos.x) > 3 || Math.abs(e.clientY - this.downPos.y) > 3,
        // Same threshold commit() uses to decide there is nothing to commit —
        // read here so a drag that ended back at the face cancels out of a tool
        // the user never explicitly opened, instead of parking them in it with
        // a "nothing to commit" prompt.
        meaningful: Math.abs(this.value) >= 1e-3,
      });
      if (release === "commit") return this.commit();
      if (release === "cancel") return this.cancel();
      this.fluentGrab = false;
      this.viewport.domElement.style.cursor = this.hovering ? "grab" : "default";
      return;
    }
    const moved =
      Math.abs(e.clientX - this.downPos.x) > 3 || Math.abs(e.clientY - this.downPos.y) > 3;
    if (this.downOnGizmo || moved) return;
    // Clean click on ANOTHER face = extrude UP TO it (mainstream MCAD "to object" —
    // no T needed: pick a face, then click the face to meet). Empty space or
    // one of the operation's own faces = commit as before.
    const hit = this.viewport.pickFaceForPressPull(e.clientX, e.clientY);
    if (hit && !this.faceIds.includes(hit.faceId)) {
      this.upTo = hit.selector;
      this.commitUpTo();
      return;
    }
    this.commit();
  }

  private onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (this.pickingTarget) {
        this.pickingTarget = false;
        // restore the distance field T-mode hid (audit bug #2: leaving it
        // active let Enter commit a plain distance mid-target-pick)
        this.dim.show([{ name: "distance", label: "D", kind: "length" }], () => this.commit(), () => this.cancel());
        this.dim.updateFromCursor({ distance: Math.abs(this.value) });
        setPrompt("Drag the arrow · type a value · click another face = extrude up to it · click empty space to commit · Esc to cancel");
        return;
      }
      this.cancel();
      return;
    }
    if ((e.key === "t" || e.key === "T") && this.phase === "drag" && !this.pickingTarget) {
      this.pickingTarget = true;
      this.dim.hide(); // Enter must not commit a plain distance while picking
      this.viewport.clearPressPullGhost();
      setPrompt("Click the face to extrude UP TO (any face, any body) · Esc to go back");
    }
  }

  private beginDrag(faces: Selector[], faceIds: number[], anchor: THREE.Vector3, normal: THREE.Vector3, bodyId: string | null = null) {
    this.faces = faces;
    this.faceIds = faceIds;
    this.upTo = null;
    this.pickingTarget = false;
    this.bodyId = bodyId;
    this.anchor.copy(anchor);
    this.axis.copy(normal).normalize();
    this.phase = "drag";
    this.value = 0;
    this.previewId = this.store.nextId();
    this.viewport.clearHover();
    this.buildGizmo();
    this.dim.show([{ name: "distance", label: "D", kind: "length" }], () => this.commit(), () => this.cancel());
    const s = this.viewport.projectToScreen(this.anchor);
    this.dim.position(s.x, s.y);
    this.dim.updateFromCursor({ distance: 0 });
    setPrompt(
      "Drag the arrow · type a value (negative = cut) · click ANOTHER face = extrude up to it · click empty space to commit · Esc to cancel",
    );
    this.raf = requestAnimationFrame(this.boundTick);
  }

  /** keep the handle a constant on-screen size, point it the way we're dragging,
   *  and keep a typed value previewing live (the pointer may be still). */
  private tick() {
    if (this.phase === "drag" && this.gizmo) {
      const sign = this.value < 0 ? -1 : 1;
      const dir = this.axis.clone().multiplyScalar(sign);
      this.quat.setFromUnitVectors(Y_AXIS, dir);
      const k = this.viewport.pixelWorldSize(this.anchor);
      this.gizmo.position.copy(this.anchor);
      this.gizmo.quaternion.copy(this.quat);
      this.gizmo.scale.setScalar(k);
      const base = sign < 0 ? HANDLE_CUT : HANDLE_IDLE;
      this.gizmoMat?.color.set(this.hovering || this.grabbing ? HANDLE_HOT : base);
      const s = this.viewport.projectToScreen(this.anchor);
      this.dim.position(s.x, s.y);
      if (!this.grabbing && this.dim.isUserDriven("distance")) {
        const v = this.dim.getValue("distance");
        if (v != null) {
          // the field is the truth: typed sign wins (out = +, cut = −). The old
          // code re-applied the drag's sign onto |v|, so a typed "-2" after an
          // outward drag silently JOINED 2 instead of cutting.
          if (Math.abs(v - this.value) > 1e-6) {
            this.value = v;
            this.refreshPreview();
          }
        }
      }
      this.raf = requestAnimationFrame(this.boundTick);
    }
  }

  /** Instant ghost preview during the drag — a frontend-only translucent prism, no
   *  kernel round-trip (that's why dragging feels immediate). The real OCCT geometry
   *  is computed once on commit. Near-zero distance clears the ghost. */
  private refreshPreview() {
    this.viewport.setPressPullGhost(this.faceIds, this.value);
  }

  private buildGizmo() {
    const { group, material } = createArrowHandle(HANDLE_IDLE);
    this.gizmoMat = material;
    this.gizmo = group;
    this.viewport.addToScene(group);
  }

  private hitGizmo(x: number, y: number): boolean {
    if (!this.gizmo) return false;
    const ray = this.viewport.rayFrom(x, y);
    return ray.intersectObjects(this.gizmo.children, false).length > 0;
  }

  private buildFeature(): Feature {
    const v = Math.round(this.value * 1000) / 1000;
    return {
      id: this.previewId,
      type: "press-pull",
      face: this.faces.length === 1 ? (this.faces[0] ?? this.faces) : this.faces,
      distance: v,
      operation: v >= 0 ? "join" : "cut",
      ...(this.bodyId != null ? { body: this.bodyId } : {}),
      ...(this.upTo ? { upTo: this.upTo } : {}),
    };
  }

  private commit() {
    if (this.phase !== "drag") return this.cancel();
    const v = this.dim.getValue("distance");
    if (v == null && this.dim.isUserDriven("distance")) {
      // the field holds unparseable text — committing the stale drag value
      // instead would be a silent wrong-number surprise
      setPrompt("Can't read that number — fix the value, or Esc to cancel");
      return;
    }
    // Typed sign wins (out = +, cut = −) — but ONLY when the user actually
    // typed. While dragging, the field displays |value| (line ~106), so reading
    // it back unguarded strips a dragged cut's sign and commits a JOIN — the
    // mirror image of the typed-"-2"-after-outward-drag bug this line fixed.
    if (v != null && this.dim.isUserDriven("distance")) this.value = v;
    if (Math.abs(this.value) < 1e-3) {
      // keep the tool alive: silently cancelling here read as "nothing happened"
      setPrompt("Nothing to commit — drag the arrow or type a distance first");
      return;
    }
    const feature = this.buildFeature();
    this.store.addFeature(feature);
    this.cleanup();
    this.onDone?.(feature.id);
  }

  /** Commit an "extrude up to a surface" — the sidecar derives each face's distance
   *  from the target, so we skip the near-zero-distance guard `commit()` applies. */
  private commitUpTo() {
    const feature = this.buildFeature();
    this.store.addFeature(feature);
    this.cleanup();
    this.onDone?.(feature.id);
  }

  cancel() {
    this.cleanup();
    this.onDone?.(null);
  }

  private cleanup() {
    const el = this.viewport.domElement;
    el.removeEventListener("pointermove", this.boundMove);
    el.removeEventListener("pointerdown", this.boundDown, true);
    el.removeEventListener("pointerup", this.boundUp);
    window.removeEventListener("keydown", this.boundKey, true);
    el.style.cursor = "default";
    this.viewport.clearPressPullGhost();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.dim.hide();
    this.disposeGizmo();
    this.viewport.clearHover();
    this.viewport.suspendPicking = false;
    this.active = false;
    this.grabbing = false;
    this.fluentGrab = false;
    this.hovering = false;
    this.value = 0;
    setPrompt(null);
  }

  private disposeGizmo() {
    if (!this.gizmo || !this.gizmoMat) return;
    this.viewport.removeFromScene(this.gizmo);
    disposeArrowHandle(this.gizmo, this.gizmoMat);
    this.gizmo = null;
    this.gizmoMat = null;
  }
}
