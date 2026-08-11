<script setup lang="ts">
// The pie menu on screen. Every rule about WHAT a gesture picked lives in
// ui/pieMath.ts; this file is the plumbing between a pointer stream and those
// rules — the same division LeftToolbar.vue keeps with ui/holdGesture.ts.
//
// The pointer bookkeeping that cannot move into the pure module, and why it is
// here:
//
//   * Move and release are listened for on the WINDOW. A pie is aimed at by
//     throwing the cursor somewhere — over the model, over the ribbon, off the
//     window edge — and a gesture that only counted movement inside the wheel
//     would be a wheel you had to stay inside, which is the rectangle-hover
//     behaviour a pie exists to replace.
//
//   * The DISMISSING pointerdown is bound one tick late, exactly as
//     ContextMenuHost.vue binds its own. Move and release are bound
//     immediately, because when the pie is opened by a press (the toolbar's pie
//     button) that press is still down and its release is the end of the flick.
//     Binding the press handler in the same breath would let the opening press
//     dismiss the menu it just opened.
//
//   * The cursor starts at the centre rather than at the true pointer position.
//     The wheel is nudged inward when it opens near a screen edge, so "where
//     the pointer is" and "where the middle of the wheel is" are not the same
//     point, and adopting that offset immediately would arm an item nobody
//     aimed at — and, worse, let the opening click's own release pick it.
//     Nothing is armed until the user moves.
//
// The backdrop swallows pointer events while the pie is up, and exists at all
// only while it is up (v-if, not a hidden element). Both halves matter: an
// overlay left in the DOM would steal picks from the geometry behind it, and a
// click that fell THROUGH to the viewport would re-select something mid-gesture
// — the pie would then run a tool against a selection that changed between the
// press and the release.
//
// Unlike the list menu, a pie holds no captured targets (no faceId, no body id,
// no feature), so a rebuild underneath it cannot make it act on stale topology.
// That is why nothing here subscribes to the document to dismiss itself.

import { computed, onUnmounted, ref, watch } from "vue";
import Icon from "../shell/Icon.vue";
import { currentPie, dismissPie, onPieChange, pieEpoch } from "../../ui/pieMenu";
import {
  DEAD_ZONE_PX,
  PIE_RADIUS_PX,
  armedIndex,
  itemOffset,
  releaseOutcome,
  slotOf,
  withinClickReach,
} from "../../ui/pieMath";

// The open request is module state in a plain .ts rather than a store (see
// ui/pieMenu.ts), so nothing tracks it: one counter per host, the same
// arrangement Icon.vue uses for the active icon pack.
const tick = ref(0);
const stop = onPieChange(() => tick.value++);

const req = computed(() => {
  tick.value; // dependency: re-read on open/close
  return currentPie();
});
const epoch = computed(() => {
  tick.value;
  return pieEpoch();
});

/** Where the middle of the wheel actually is, client coords. */
const centre = ref({ x: 0, y: 0 });
/** Pointer offset from that centre. Zero until the user moves — see the header. */
const cursor = ref({ dx: 0, dy: 0 });
/** The FURTHEST the pointer has been from the centre this gesture. What
 *  separates "the click that opened this hasn't moved yet" from "I dragged out,
 *  looked, and came back to cancel" — the two release at the same place. */
const travelled = ref(0);

const armed = computed(() => {
  const r = req.value;
  return r ? armedIndex(cursor.value.dx, cursor.value.dy, r.items.length) : null;
});

/** Keeps the whole wheel — labels included — on screen. The centre moves, the
 *  arithmetic follows it, and the angles are unchanged: the pie is still read
 *  relative to its own middle, so a menu opened in a corner is aimed at exactly
 *  the same way as one opened in the middle of the viewport. */
const EDGE_MARGIN = PIE_RADIUS_PX + 64;
function place(x: number, y: number) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  centre.value = {
    x: Math.min(Math.max(x, Math.min(EDGE_MARGIN, w / 2)), Math.max(w - EDGE_MARGIN, w / 2)),
    y: Math.min(Math.max(y, Math.min(EDGE_MARGIN, h / 2)), Math.max(h - EDGE_MARGIN, h / 2)),
  };
}

function pick(index: number) {
  const item = req.value?.items[index];
  // Closed BEFORE the item runs, like ContextMenuHost.activate: a tool that
  // opens a panel or another popup must not have it shut by our own teardown.
  dismissPie();
  if (item && !item.disabled) item.onPick?.();
}

function noteTravel(dx: number, dy: number) {
  cursor.value = { dx, dy };
  const r = Math.hypot(dx, dy);
  if (r > travelled.value) travelled.value = r;
}

function onMove(e: PointerEvent) {
  noteTravel(e.clientX - centre.value.x, e.clientY - centre.value.y);
}

function onUp(e: PointerEvent) {
  if (e.button !== 0) return; // the trailing release of a right-click is not a pick
  const outcome = releaseOutcome({ armed: armed.value, travelledPx: travelled.value });
  if (outcome === "keep-open") return; // that was the opening click letting go
  if (outcome === "pick" && armed.value !== null) pick(armed.value);
  else dismissPie();
}

function onDown(e: PointerEvent) {
  if (e.button !== 0) {
    dismissPie(); // a right-click while a menu is up is "no, not that"
    return;
  }
  const dx = e.clientX - centre.value.x;
  const dy = e.clientY - centre.value.y;
  // Click-away. Only a FRESH press is measured this way — a flick already under
  // way is exempt by construction, because its press happened before this
  // handler was bound. See pieMath.CLICK_REACH_PX for why the two differ.
  if (!withinClickReach(dx, dy)) {
    dismissPie();
    return;
  }
  // Adopt the press position: a click picks by the direction of the click, and
  // on a touch screen there is no move before the press to have set it.
  noteTravel(dx, dy);
}

function onKey(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  e.stopPropagation(); // Escape closes the pie only — not the app's selection
  dismissPie();
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault(); // ...the browser menu on top of a pie helps nobody
}

function onLost() {
  dismissPie();
}

let armTimer: ReturnType<typeof setTimeout> | null = null;

function bind() {
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("contextmenu", onContextMenu, true);
  window.addEventListener("pointercancel", onLost);
  window.addEventListener("blur", onLost);
  // Deferred, and re-checked: the press that opened the pie must not be the
  // press that closes it.
  armTimer = setTimeout(() => {
    armTimer = null;
    if (currentPie()) window.addEventListener("pointerdown", onDown, true);
  }, 0);
}

function unbind() {
  if (armTimer !== null) {
    clearTimeout(armTimer);
    armTimer = null;
  }
  window.removeEventListener("pointermove", onMove);
  window.removeEventListener("pointerup", onUp);
  window.removeEventListener("keydown", onKey, true);
  window.removeEventListener("contextmenu", onContextMenu, true);
  window.removeEventListener("pointercancel", onLost);
  window.removeEventListener("blur", onLost);
  window.removeEventListener("pointerdown", onDown, true);
}

watch(epoch, () => {
  unbind();
  const r = req.value;
  if (!r) return;
  place(r.x, r.y);
  cursor.value = { dx: 0, dy: 0 };
  travelled.value = 0;
  bind();
});

onUnmounted(() => {
  unbind();
  stop();
});

/** Absolute placement for one wedge. Null indices cannot happen — callers cap
 *  their lists at MAX_PIE_ITEMS — but the fallback keeps a mistake in the
 *  middle of the wheel rather than at NaN. */
function itemStyle(i: number) {
  const o = itemOffset(i) ?? { x: 0, y: 0 };
  return { left: `${o.x}px`, top: `${o.y}px` };
}
</script>

<template>
  <Teleport to="body">
    <!-- Fixed, full-screen, and only in the DOM while a pie is open. -->
    <div v-if="req" class="pie-backdrop" role="presentation">
      <div
        class="pie"
        role="menu"
        :aria-label="req.title"
        :style="{ left: `${centre.x}px`, top: `${centre.y}px` }"
      >
        <!-- The dead zone, drawn. Naming the menu in the middle is what makes an
             accidental open explain itself; lighting it when nothing is armed is
             what makes "let go here and nothing happens" visible. -->
        <div
          class="pie-hub"
          :class="{ live: armed === null }"
          :style="{ width: `${DEAD_ZONE_PX * 2}px`, height: `${DEAD_ZONE_PX * 2}px` }"
        >
          <span class="pie-title">{{ req.title }}</span>
        </div>

        <div
          v-for="(it, i) in req.items"
          :key="i"
          class="pie-item"
          :class="[`pie-${(slotOf(i) ?? 'n').toLowerCase()}`, { armed: armed === i, disabled: it.disabled }]"
          role="menuitem"
          :aria-disabled="it.disabled ? 'true' : undefined"
          :style="itemStyle(i)"
        >
          <Icon v-if="it.iconName" :name="it.iconName" :size="18" />
          <span class="pie-label">{{ it.label }}</span>
          <span v-if="it.hint" class="pie-key">{{ it.hint }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
