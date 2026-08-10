<script setup lang="ts">
// The left tool rail: a slim column of icon buttons that is the primary place
// to reach for a tool, with the ribbon left intact above it.
//
// A button stands for a FAMILY, not a tool — press and release runs whichever
// variant is on the face, press and hold (or right-click) opens the family and
// the one you release over both runs and stays. Which tools are a family, and
// which variant is on the face, is ui/toolRail.ts; when a press is a click and
// when it is a hold is ui/holdGesture.ts. Neither of those imports Vue, so both
// are tested headlessly and this component is only the wiring: pointer events
// in, effects out.
//
// The pointer bookkeeping that CANNOT move into the state machine, and why it
// is here:
//
//   * The release is listened for on the WINDOW, not on the rows. A hold that
//     ends over the model, over the ribbon, over nothing at all still has to
//     end — a row-scoped handler would leave the flyout open and the machine
//     stuck in `open` the moment the pointer drifted off the list.
//   * Only button 0 is read. A right-click emits pointerdown, contextmenu AND
//     pointerup; if that trailing pointerup counted, every right-click would
//     open the flyout and shut it again in the same frame.
//   * Touch and pen get implicit pointer capture on the element that was
//     pressed, so the pointerup would be reported on the BUTTON however far the
//     finger travelled — i.e. every touch hold would read as "released over
//     nothing". Releasing the capture up front is what makes the gesture work
//     the same way with a finger as with a mouse.

import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { useRibbonStore } from "../../stores/ribbon";
import Icon from "./Icon.vue";
import ToolFlyout from "./ToolFlyout.vue";
import { HOLD_MS, IDLE, holdStep } from "../../ui/holdGesture";
import type { HoldEvent, HoldPhase } from "../../ui/holdGesture";
import {
  defaultTool,
  hasVariants,
  onRailDefaultsChange,
  railDefaults,
  railFor,
  setRailDefault,
} from "../../ui/toolRail";
import type { RailGroup } from "../../ui/toolRail";
import type { ToolItem } from "../../ui/ribbonDefs";

const ribbon = useRibbonStore();

const groups = computed<RailGroup[]>(() => railFor(ribbon.context));

// The remembered defaults are module state in a plain .ts, not a store, so
// nothing tracks them — the same arrangement Icon.vue uses for the active icon
// pack, and for the same reason: keeping ui/toolRail.ts free of a Vue import is
// what lets the headless *.test.ts suite import it.
const tick = ref(0);
const stopWatching = onRailDefaultsChange(() => tick.value++);
onUnmounted(stopWatching);

/** The tool showing on a group's button.
 *
 *  An armed tool wins over the remembered default so the rail cannot look out
 *  of sync with the app: press R and the Rectangle family shows Rectangle, not
 *  whatever was last picked from its flyout. It is deliberately not PERSISTED —
 *  arming by shortcut is a use of a tool, not a decision about the rail. */
function face(group: RailGroup): ToolItem {
  tick.value; // dependency: re-read after a pick
  const armed = ribbon.activeSketchTool;
  if (armed) {
    const tool = group.items.find((t) => t.action === armed);
    if (tool) return tool;
  }
  return defaultTool(group, railDefaults()[group.id]);
}

function title(group: RailGroup): string {
  const tool = face(group);
  const key = tool.key ? ` (${tool.key})` : "";
  // The affordance has to be spelled out somewhere: a corner mark says "there
  // is more here", but nothing on screen can say HOW to get at it.
  return hasVariants(group) ? `${tool.label}${key} — hold for variants` : `${tool.label}${key}`;
}

// --- the gesture ----------------------------------------------------------

const phase = shallowRef<HoldPhase>(IDLE);
const anchor = shallowRef<HTMLElement | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

const openGroup = computed<RailGroup | null>(() => {
  const p = phase.value;
  return p.phase === "open" ? (groups.value.find((g) => g.id === p.groupId) ?? null) : null;
});

function dispatch(ev: HoldEvent) {
  // Every event cancels the pending hold. A timer that outlives its press is
  // the classic way a menu appears a moment after the click that ran the tool —
  // the machine ignores such a `hold`, but not arming one at all is cheaper and
  // leaves no stray timeout behind on unmount.
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  const { next, effect } = holdStep(phase.value, ev);
  phase.value = next;

  if (ev.type === "press" && next.phase === "pressing" && next.hasVariants) {
    timer = setTimeout(() => dispatch({ type: "hold" }), HOLD_MS);
  }

  switch (effect.kind) {
    case "runDefault": {
      const group = groups.value.find((g) => g.id === effect.groupId);
      if (group) ribbon.act(face(group).action);
      break;
    }
    case "pick":
      // Order matters only for the eye: the face changes before the tool arms,
      // so the button you released over is already showing when its prompt
      // appears.
      setRailDefault(effect.groupId, effect.action);
      ribbon.act(effect.action);
      break;
    // "open" and "close" are the phase itself — openGroup is derived from it,
    // so there is nothing to do here beyond letting the render follow.
    case "open":
    case "close":
    case "none":
      break;
  }
}

function onPointerDown(e: PointerEvent, group: RailGroup) {
  if (e.button !== 0) return; // right-click is the contextmenu path
  const btn = e.currentTarget as HTMLElement;
  if (btn.hasPointerCapture?.(e.pointerId)) btn.releasePointerCapture(e.pointerId);
  anchor.value = btn;
  dispatch({ type: "press", groupId: group.id, hasVariants: hasVariants(group) });
}

function onContextMenu(e: PointerEvent | MouseEvent, group: RailGroup) {
  anchor.value = e.currentTarget as HTMLElement;
  dispatch({ type: "contextmenu", groupId: group.id, hasVariants: hasVariants(group) });
}

/** Keyboard activation. Enter/Space runs the face — every tool on the rail is
 *  therefore reachable without a pointer, and the variants stay reachable
 *  without one through the ribbon's split buttons and the command palette,
 *  which is why this does not try to make the flyout itself navigable. */
function onKey(e: KeyboardEvent, group: RailGroup) {
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  ribbon.act(face(group).action);
}

function onWindowUp(e: PointerEvent) {
  if (e.button !== 0) return;
  const row = (e.target as Element | null)?.closest?.("[data-rail-action]") ?? null;
  const action = row?.getAttribute("data-rail-action");
  const groupId = row?.getAttribute("data-rail-group");
  dispatch({ type: "release", over: action && groupId ? { groupId, action } : null });
}

// Capture phase, so it runs before the button's own pointerdown: a press
// somewhere else is a dismiss, and only a press INSIDE the rail or the flyout
// is part of the gesture.
function onWindowDown(e: PointerEvent) {
  if (phase.value.phase !== "open") return;
  const t = e.target as Element | null;
  if (t?.closest?.("#toolrail, .rail-flyout")) return;
  dispatch({ type: "cancel" });
}

function onWindowKey(e: KeyboardEvent) {
  if (e.key === "Escape" && phase.value.phase !== "idle") dispatch({ type: "cancel" });
}

function onLostPointer() {
  dispatch({ type: "cancel" });
}

onMounted(() => {
  window.addEventListener("pointerup", onWindowUp);
  window.addEventListener("pointerdown", onWindowDown, true);
  window.addEventListener("keydown", onWindowKey);
  // A drag out of the window, a pointercancel from the compositor, an alt-tab:
  // all of them end the press without a pointerup, and none of them may leave
  // the flyout on screen.
  window.addEventListener("pointercancel", onLostPointer);
  window.addEventListener("blur", onLostPointer);
});
onUnmounted(() => {
  window.removeEventListener("pointerup", onWindowUp);
  window.removeEventListener("pointerdown", onWindowDown, true);
  window.removeEventListener("keydown", onWindowKey);
  window.removeEventListener("pointercancel", onLostPointer);
  window.removeEventListener("blur", onLostPointer);
  if (timer !== null) clearTimeout(timer);
});

// Entering or leaving a sketch swaps the whole group list, so an open flyout is
// pointing at a button that no longer exists.
watch(
  () => ribbon.context,
  () => dispatch({ type: "cancel" }),
);
</script>

<template>
  <div id="toolrail" role="toolbar" aria-orientation="vertical" aria-label="Tools">
    <button
      v-for="g in groups"
      :key="g.id"
      type="button"
      class="rail-btn"
      :class="{
        active: ribbon.activeSketchTool === face(g).action,
        variants: hasVariants(g),
        open: openGroup?.id === g.id,
      }"
      :data-action="face(g).action"
      :data-rail-group="g.id"
      :title="title(g)"
      :aria-label="title(g)"
      :aria-haspopup="hasVariants(g) ? 'menu' : undefined"
      :aria-expanded="hasVariants(g) ? openGroup?.id === g.id : undefined"
      @pointerdown="onPointerDown($event, g)"
      @contextmenu.prevent="onContextMenu($event, g)"
      @keydown="onKey($event, g)"
    >
      <Icon :name="face(g).iconName" :size="22" />
    </button>

    <ToolFlyout
      v-if="openGroup && anchor"
      :group="openGroup"
      :anchor="anchor"
      :current="face(openGroup).action"
    />
  </div>
</template>
