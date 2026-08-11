<script setup lang="ts">
// The toolbar that follows the selection: the tools that can act on what you just
// picked, floating just above it, gone the moment nothing is selected. The list is
// derived from features/toolCapabilities.ts, so a tool that cannot act on this
// selection is never on it and one that can never has to be gone looking for.
//
// Like the drag handle (features/selectionNudge.ts) it is NOT a tool: no busy
// state, no document state, and a button click dispatches the same action the
// ribbon would.
//
// It knows by LOOKING once a frame, not by subscribing: onSelectionChange is a
// single-slot callback already owned by app/viewportWiring.ts, and profile-area
// selection notifies nothing at all. Polling covers the silent paths too — a
// rebuild restoring a selection, a tool clearing one, Escape.
//
// The loop costs nothing when idle: it runs only while a selection exists and
// stops itself on the first empty frame, and it is woken only by the four things
// that can create one (pointer release, key release, document change, build). Per
// frame it reads the cheap accessors only; the triangle-walking
// selectedFacesForPressPull runs only when the selection signature changes.

import { computed, onMounted, onUnmounted, ref, shallowRef } from "vue";
import * as THREE from "three";
import Icon from "../shell/Icon.vue";
import { useEngine } from "../../app/engineKey";
import { openPie } from "../../ui/pieMenu";
import { selectionPie, toolbarOffers, type ToolOffer } from "../../ui/selectionTools";
import type { SelectionCounts } from "../../features/toolCapabilities";
import { handlePlacement } from "../../features/edgeNudge";
import { regionAnchor } from "../../features/regionNudge";

type Vec3 = [number, number, number];

const engine = useEngine();

/** How far above the anchor the bar floats, px. Clear of the drag handle, which
 *  stands ON the anchor: the two are one affordance and must not overlap. */
const LIFT_PX = 64;
/** Keeps the bar on screen without measuring it — happy-dom has no layout, and
 *  neither does the frame in which a selection first appears. */
const HALF_W_PX = 110;

const counts = shallowRef<SelectionCounts>({});
const screen = ref<{ x: number; y: number } | null>(null);
const offers = computed(() => toolbarOffers(counts.value));
const visible = computed(() => screen.value !== null && offers.value.length > 0);

// --- reading the selection ---------------------------------------------------

/** World point the bar is pinned to. Recomputed only when the selection
 *  changes, then re-projected every frame. */
let anchor: THREE.Vector3 | null = null;
let signature = "";

const camForward = new THREE.Vector3();
const toAnchor = new THREE.Vector3();

/** The whole selection, in the order that decides which kind wins.
 *
 *  The ranking is ui/selectionTools.KIND_RANK, which is itself
 *  app/viewportWiring.ts's drag-handle ranking — one selection gets one answer,
 *  and the arrow standing on the geometry must not disagree with the buttons
 *  floating above it. */
function readSelection(): { counts: SelectionCounts; signature: string; anchor: THREE.Vector3 | null } {
  const edges = engine.viewport.selectedEdgeLines();
  const regions = engine.overlay.selectedRegions();
  const faceIds = engine.viewport.getSelectedFaceIds();
  const bodies = engine.viewport.getSelectedBodies();

  const c: SelectionCounts = {};
  if (edges.length) c.edge = edges.length;
  if (regions.length) c["sketch-region"] = regions.length;
  if (faceIds.length) c.face = faceIds.length;
  if (bodies.length) c.body = bodies.length;

  // Identity, not just size: swapping one selected edge for another has to move
  // the bar, and a count alone would not notice.
  const sig =
    `e${edges.map((e) => e.id).join()}` +
    `|r${regions.map((r) => r.interior3D.x).join()}` +
    `|f${faceIds.join()}` +
    `|b${bodies.join()}`;
  if (sig === signature) return { counts: c, signature: sig, anchor };

  let at: THREE.Vector3 | null = null;
  if (edges.length) {
    // Shared with the drag handle rather than re-derived: the mean of the
    // arc-length midpoints. Two "middle of the selection" calculations that
    // agreed to within a millimetre would still put the bar a hair off the
    // arrow it belongs to.
    const place = handlePlacement(edges.map((e) => e.points as Vec3[]));
    if (place) at = new THREE.Vector3(...place.anchor);
  } else if (regions.length) {
    at = regionAnchor(regions);
  } else if (faceIds.length) {
    // The expensive one, and the reason this whole function is gated on the
    // signature — see the header.
    at = engine.viewport.selectedFacesForPressPull()?.anchor.clone() ?? null;
  } else if (bodies.length) {
    at = engine.viewport.bodiesCentroid(bodies);
  }
  return { counts: c, signature: sig, anchor: at };
}

/** One frame. Returns whether anything is still selected — i.e. whether the
 *  loop has a reason to run again. */
function refresh(): boolean {
  const next = readSelection();
  counts.value = next.counts;
  signature = next.signature;
  anchor = next.anchor;

  // An active tool owns the screen: its own gizmos, its own dimension box, its
  // own meaning for a click. Asked every frame rather than subscribed to,
  // because a tool can start from a shortcut, a menu, the palette or the
  // browser tree — and because this is what puts the bar BACK the instant the
  // tool ends with the selection intact.
  if (!anchor || engine.toolBusy()) {
    screen.value = null;
    return !!anchor;
  }

  const cam = engine.viewport.camera;
  cam.getWorldDirection(camForward);
  toAnchor.copy(anchor).sub(cam.position);
  if (camForward.dot(toAnchor) <= 0) {
    // Behind the camera. project() would still return coordinates, mirrored
    // through the centre of the screen — a bar hovering over empty space on the
    // wrong side of the viewport, offering to fillet something nobody can see.
    screen.value = null;
    return true;
  }

  const p = engine.viewport.projectToScreen(anchor);
  const x = Math.min(Math.max(p.x, HALF_W_PX), Math.max(window.innerWidth - HALF_W_PX, HALF_W_PX));
  const y = p.y - LIFT_PX;
  const prev = screen.value;
  // Only on a real change: the viewport renders on demand, and rewriting the
  // style binding every frame of a still camera would keep Vue patching for
  // nothing.
  if (!prev || Math.abs(prev.x - x) > 0.5 || Math.abs(prev.y - y) > 0.5) screen.value = { x, y };
  return true;
}

// --- the loop ----------------------------------------------------------------

let raf = 0;

function tick() {
  raf = 0;
  if (refresh()) raf = requestAnimationFrame(tick);
}

/** Something happened that could have changed the selection: look next frame.
 *  Cheap to call spuriously — one frame of four array reads. */
function wake() {
  if (!raf) raf = requestAnimationFrame(tick);
}

let unsubs: (() => void)[] = [];

onMounted(() => {
  // A selection is only ever created by a pointer release (a pick in the
  // viewport, a menu item), a key release (Escape, Del, a shortcut that runs a
  // tool) or the document changing under it. rAF means the wake always lands
  // after every other handler for that event has run, so listener order does
  // not matter anywhere.
  window.addEventListener("pointerup", wake);
  window.addEventListener("keyup", wake);
  unsubs = [engine.store.onDocChange(() => wake()), engine.store.onBuild(() => wake())];
  wake();
});

onUnmounted(() => {
  window.removeEventListener("pointerup", wake);
  window.removeEventListener("keyup", wake);
  for (const off of unsubs) off();
  unsubs = [];
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
});

// --- acting ------------------------------------------------------------------

function title(o: ToolOffer): string {
  return o.hint ? `${o.label} (${o.hint})` : o.label;
}

function run(o: ToolOffer) {
  if (engine.toolBusy()) return;
  // The one tool with no action id is dispatched through the engine — see
  // ui/selectionTools.ACTIONLESS and the note on "delete-face" in
  // features/toolCapabilities.ts.
  if (o.action) engine.handleAction(o.action);
  else if (o.tool === "delete-face") engine.deleteSelectedFace();
}

/** The rest of the offer, as a pie centred on the button.
 *
 *  On pointerDOWN, not click, and that is the whole point: press it and flick
 *  in a direction and you never see the menu, which is the gesture a pie is
 *  for. Press and let go without moving and it stays up to be clicked — the
 *  release rule in ui/pieMath decides which of the two happened, so neither
 *  this component nor the user has to declare it up front. */
function openMore(e: PointerEvent) {
  if (e.button !== 0) return;
  const btn = e.currentTarget as HTMLElement;
  // Touch and pen capture the pointer on the element that was pressed, which
  // would send every move to the button instead of to the window — the same
  // release LeftToolbar.vue performs before its own hold gesture.
  if (btn.hasPointerCapture?.(e.pointerId)) btn.releasePointerCapture(e.pointerId);
  e.preventDefault();
  const req = selectionPie(e.clientX, e.clientY, counts.value, run);
  if (req) openPie(req);
}
</script>

<template>
  <Teleport to="body">
    <!-- v-if, never a hidden element: an overlay left in the DOM over the
         viewport steals the picks the geometry behind it should be getting. -->
    <div
      v-if="visible && screen"
      class="seltools"
      role="toolbar"
      aria-label="Tools for the selection"
      :style="{ left: `${screen.x}px`, top: `${screen.y}px` }"
    >
      <button
        v-for="o in offers"
        :key="o.tool"
        type="button"
        class="seltool-btn"
        :data-tool="o.tool"
        :title="title(o)"
        :aria-label="title(o)"
        @click="run(o)"
      >
        <Icon :name="o.iconName" :size="18" />
      </button>
      <span class="seltool-sep"></span>
      <button
        type="button"
        class="seltool-btn seltool-more"
        data-tool="__pie"
        title="All tools for this selection, press and flick, or click"
        aria-label="All tools for this selection"
        aria-haspopup="menu"
        @pointerdown="openMore"
      >
        <Icon name="boltCircle" :size="18" />
      </button>
    </div>
  </Teleport>
</template>
