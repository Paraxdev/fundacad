<script setup lang="ts">
// Bottom timeline (MCAD-style): a compact strip of icon chips in build order,
// plus a draggable rollback marker, transport buttons (roll to start / step /
// roll to end) and an error badge that jumps to failing features. Number, name
// and error text live in the tooltip — chips stay ~28px so a 100+-feature
// document spans screens, not screen-miles.

import { computed, nextTick, onUnmounted, ref, useTemplateRef, watch } from "vue";
import { useEngine } from "../../app/engineKey";
import { useDocValue, useBuildValue } from "../../app/useDoc";
import { useSelectionStore } from "../../stores/selection";
import { useTimelineStore } from "../../stores/timeline";
import { FEATURE_META } from "../../ui/featureMeta";
import Icon from "./Icon.vue";
import { contextMenu } from "../../ui/menu";
import { buildProgress, CANCEL_DELAY_MS } from "../../ui/buildProgress";
import { gapIndexIn } from "../../ui/trackGaps";

const engine = useEngine();
const store = engine.store;
const selection = useSelectionStore();
const timeline = useTimelineStore();

const scroller = useTemplateRef<HTMLElement>("scroller");
const track = useTemplateRef<HTMLElement>("track");

const features = useDocValue((doc) => doc.features.map((f) => ({ id: f.id, type: f.type })));
const rollback = useDocValue(() => store.rollbackIndex);
const suppressed = useDocValue(() => new Set(features.value.filter((f) => store.isSuppressed(f.id)).map((f) => f.id)));

/** Every failing feature this build: id -> message. Continue-past-errors can
 *  yield several; fall back to the single legacy error field. */
const errors = useBuildValue((b) => {
  const m = new Map<string, string>();
  for (const e of b.result?.featureErrors ?? []) if (e.feature_id) m.set(e.feature_id, e.message);
  if (b.errorFeatureId && !m.has(b.errorFeatureId)) m.set(b.errorFeatureId, b.errorMessage ?? "failed");
  return m;
});
const building = useBuildValue((b) => b.building);
const progress = useBuildValue((b) => ({ progress: b.progress, meshed: b.meshed, meshTotal: b.meshTotal }));

const chip = computed(() =>
  buildProgress(progress.value.progress, progress.value.meshed, progress.value.meshTotal, features.value.length),
);

// --- busy / Cancel -------------------------------------------------------
// Timestamp the TRANSITION into busy, not each emission: an op emits busy
// frames throughout, and re-arming the delay on every one means it never
// elapses. The delay exists so a fast op doesn't flash a button at the user.
const busy = engine.bridge.busy;
const busySince = ref(0);
const delayElapsed = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

watch(
  busy,
  (b) => {
    if (!b.active) {
      busySince.value = 0;
      delayElapsed.value = false;
      if (timer) { clearTimeout(timer); timer = null; }
      return;
    }
    if (busySince.value) return; // already timing this op
    busySince.value = Date.now();
    timer = setTimeout(() => { delayElapsed.value = true; }, CANCEL_DELAY_MS);
  },
  { immediate: true },
);
onUnmounted(() => { if (timer) clearTimeout(timer); });

const showCancel = computed(() => busy.value.active && delayElapsed.value);
const busyText = computed(() =>
  busy.value.pct === null ? busy.value.label : `${busy.value.label} ${busy.value.pct}%`,
);

// Cancelling is not instant (the sidecar kills the worker and spawns a fresh
// one), so the button disables itself in flight — a second press would target
// an op that is already gone.
const cancelling = ref(false);
async function cancelBusy() {
  cancelling.value = true;
  try {
    await store.cancelBusy();
  } finally {
    cancelling.value = false;
  }
}

// `busy.active` joins this guard: importing into an EMPTY document is the most
// common long operation there is, and without it the timeline would advertise
// "start with a Sketch" for the whole 90+ seconds.
const showEmpty = computed(() => features.value.length === 0 && !building.value && !busy.value.active);

// --- chips ---------------------------------------------------------------
function metaFor(type: string) {
  // Unknown feature types must render, not crash: a document from a newer
  // version with a type this build doesn't know would otherwise throw
  // mid-render and make File→Open silently do nothing.
  return FEATURE_META[type as keyof typeof FEATURE_META] ?? { icon: "dot", label: type };
}

function chipTitle(f: { id: string; type: string }, i: number) {
  const err = errors.value.get(f.id);
  return (
    `${i + 1} · ${metaFor(f.type).label}` +
    // A plain-text word, not a warning sign: this is a `title` attribute, and
    // the browser draws it in the OS tooltip font where a symbol lands as
    // whatever fallback glyph — or tofu — that font happens to carry.
    (err ? `\nFailed: ${err}` : "") +
    "\ndouble-click to edit · right-click for more"
  );
}

// --- scrolling -----------------------------------------------------------
// The scroller is a persistent element and Vue patches the chips in place, so
// scroll position survives a re-render on its own — the old code had to save
// and restore it around `track.innerHTML = ""`. Only the follow-on-append
// behaviour is left to do explicitly.
watch(
  () => features.value.length,
  async (n, prev) => {
    if (prev === undefined || n <= prev) return;
    await nextTick();
    if (scroller.value) scroller.value.scrollLeft = scroller.value.scrollWidth;
  },
);

// The wheel scrubs the strip horizontally — vertical wheels are useless here.
// Non-passive: preventDefault is the point.
function onWheel(e: WheelEvent) {
  const el = scroller.value;
  if (!el) return;
  el.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  e.preventDefault();
}

// Dragging a chip near either edge auto-scrolls; a reorder across a long
// document is impossible otherwise.
function onDragOverScroller(e: DragEvent) {
  const el = scroller.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (e.clientX < r.left + 48) el.scrollLeft -= 14;
  else if (e.clientX > r.right - 48) el.scrollLeft += 14;
}

// --- reorder via native drag-and-drop ------------------------------------
const dragId = ref<string | null>(null);
const dropTarget = ref<string | null>(null);

function onDragStart(id: string, e: DragEvent) {
  dragId.value = id;
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
function onDragOver(id: string, e: DragEvent) {
  if (dragId.value && dragId.value !== id) {
    e.preventDefault();
    dropTarget.value = id;
  }
}
function onDrop(id: string, i: number, e: DragEvent) {
  e.preventDefault();
  dropTarget.value = null;
  if (dragId.value && dragId.value !== id) store.moveFeature(dragId.value, i);
  dragId.value = null;
}

// --- error badge ---------------------------------------------------------
const errCycle = ref(0);
watch(
  () => errors.value.size,
  (n) => { if (n === 0) errCycle.value = 0; },
);

function jumpToNextError() {
  const ids = [...errors.value.keys()];
  if (!ids.length) return;
  const id = ids[errCycle.value % ids.length];
  if (id === undefined) return;
  errCycle.value++;
  track.value
    ?.querySelector<HTMLElement>(`.timeline-node[data-id="${CSS.escape(id)}"]`)
    ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  timeline.select(id);
}

// --- rollback marker (drag to roll the model back/forward) ---------------
// Stays imperative: it is a pointer drag resolved against measured chip rects.
function onMarkerDown(e: PointerEvent) {
  e.preventDefault();
  e.stopPropagation();
  const m = e.currentTarget as HTMLElement;
  m.classList.add("dragging");
  const move = (ev: PointerEvent) => m.style.setProperty("--x", `${ev.clientX}px`);
  const up = (ev: PointerEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    m.classList.remove("dragging");
    store.setRollback(gapIndexAt(ev));
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

/** Which inter-feature gap (0..n) the pointer falls into. The measuring is here;
 *  the arithmetic — including which axis the track runs along, since the history
 *  strip can be moved to the right-hand side — is in ui/trackGaps.ts. */
function gapIndexAt(ev: PointerEvent): number {
  const nodes = [...(track.value?.querySelectorAll<HTMLElement>(".timeline-node:not(.building)") ?? [])];
  return gapIndexIn(nodes.map((n) => n.getBoundingClientRect()), ev.clientX, ev.clientY);
}

// --- right-click context menu (shared engine in ui/menu.ts) --------------
function openMenu(e: MouseEvent, id: string, i: number) {
  e.preventDefault();
  // "Re-pick" only appears when THIS feature's last build reported an ambiguous
  // saved reference — offering it on a healthy feature would invite users to
  // overwrite references that are working.
  const repick = timeline.canRepick(id)
    ? [{ label: "Re-pick face…", onClick: () => timeline.repick(id) }]
    : [];
  contextMenu(e.clientX, e.clientY, [
    ...repick,
    { label: "Edit", onClick: () => timeline.edit(id) },
    {
      label: suppressed.value.has(id) ? "Unsuppress" : "Suppress",
      onClick: () => store.toggleSuppress(id),
    },
    { label: "Roll to here", onClick: () => store.setRollback(i) },
    { label: "Roll past here", onClick: () => store.setRollback(i + 1) },
    { separator: true, label: "" },
    { label: "Delete", danger: true, onClick: () => store.removeFeature(id) },
  ]);
}
</script>

<template>
  <footer id="timeline" class="timeline-shell">
    <div class="timeline-transport">
      <button class="tl-btn" title="Roll back to the start" :disabled="rollback <= 0" @click="store.setRollback(0)"><Icon name="skipStart" /></button>
      <button class="tl-btn" title="Step one feature back" :disabled="rollback <= 0" @click="store.setRollback(Math.max(0, rollback - 1))"><Icon name="stepBack" /></button>
      <button class="tl-btn" title="Step one feature forward" :disabled="rollback >= features.length" @click="store.setRollback(Math.min(features.length, rollback + 1))"><Icon name="stepForward" /></button>
      <button class="tl-btn" title="Roll forward to the end" :disabled="rollback >= features.length" @click="store.setRollback(features.length)"><Icon name="skipEnd" /></button>
    </div>

    <div ref="scroller" class="timeline-scroll" @wheel="onWheel" @dragover="onDragOverScroller">
      <div ref="track" class="timeline-track">
        <div v-if="showEmpty" class="timeline-empty">
          Your modeling history will appear here. Start with a Sketch.
        </div>
        <template v-else>
          <template v-for="(f, i) in features" :key="f.id">
            <div
              v-if="i === rollback"
              class="timeline-marker"
              title="Drag to roll the model back / forward"
              @pointerdown="onMarkerDown"
            ><span class="marker-grip"></span></div>
            <div
              class="timeline-node"
              :data-id="f.id"
              :class="{
                selected: selection.featureId === f.id,
                error: errors.has(f.id),
                rolled: i >= rollback,
                suppressed: suppressed.has(f.id),
                'drop-target': dropTarget === f.id,
              }"
              :title="chipTitle(f, i)"
              draggable="true"
              @click="timeline.select(f.id)"
              @dblclick="timeline.edit(f.id)"
              @contextmenu="openMenu($event, f.id, i)"
              @dragstart="onDragStart(f.id, $event)"
              @dragover="onDragOver(f.id, $event)"
              @dragleave="dropTarget = null"
              @drop="onDrop(f.id, i, $event)"
            >
              <span class="glyph"><Icon :name="metaFor(f.type).icon" :size="18" /></span>
            </div>
          </template>
          <div
            v-if="rollback >= features.length"
            class="timeline-marker"
            title="Drag to roll the model back / forward"
            @pointerdown="onMarkerDown"
          ><span class="marker-grip"></span></div>

          <div v-if="building" class="timeline-node building">
            <span class="t-build">{{ chip.label }}</span>
            <span class="t-bar"><i :style="{ width: `${chip.pct}%` }"></i></span>
          </div>
        </template>
      </div>
    </div>

    <!-- Cancel and the busy label are SIBLINGS of the track, never inside it.
         That mattered structurally before (a button detached between mousedown
         and mouseup fires no click at all, so one press in eight was swallowed
         by the once-a-second re-render); Vue patches in place, so the hazard is
         gone — but keeping them out here also keeps focus and the CSS. -->
    <div class="timeline-busy" :class="{ hidden: !showCancel }">{{ busyText }}</div>
    <button
      class="timeline-cancel"
      :class="{ hidden: !showCancel }"
      :disabled="cancelling"
      :title="busy.label || 'Stop the running operation'"
      @click="cancelBusy()"
    >Cancel</button>

    <button
      class="timeline-errbadge"
      :class="{ hidden: errors.size === 0 }"
      title="Failing features — click to jump to the next one"
      @click="jumpToNextError()"
    ><Icon name="warning" :size="14" /> {{ errors.size }}</button>
  </footer>
</template>
