<script setup lang="ts">
// MCAD-style icon ribbon. Two contexts — modeling and sketch — each a row of
// grouped icon buttons (CREATE / MODIFY / …) with the group name underneath.
// The sketch context ends with the green Finish Sketch + a Sketch Palette toggle.

import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from "vue";
import { useRibbonStore } from "../../stores/ribbon";
import { MODEL, SKETCH, PRIORITY, PINNED, leavesOf } from "../../ui/ribbonDefs";
import type { Group, Item, RibbonContext, ToolItem } from "../../ui/ribbonDefs";
import Icon from "./Icon.vue";
import RibbonPopup from "./RibbonPopup.vue";
import { layoutPrefs, onLayoutPrefsChange } from "../../ui/layoutPrefs";

const ribbon = useRibbonStore();
// Two elements, two jobs, exactly as the class had them: the ResizeObserver
// watches #ribbon (the container that actually changes size with the window),
// while the packing measures .ribbon-context — #ribbon is an overflow-x:auto
// scroller, so once the tools no longer fit, its clientWidth is the VIEWPORT
// width, not the row's.
const root = useTemplateRef<HTMLElement>("root");
const ctx = useTemplateRef<HTMLElement>("ctx");

// The sketch context's two pinned groups live outside the SKETCH table because
// they are chrome, not tools — a spacer pushes them to the right-hand end.
const PALETTE_GROUP: Group = {
  label: "PALETTE",
  items: [{ action: "palette", label: "Sketch Palette", iconName: "palette", kind: "toggle" }],
};
const FINISH_GROUP: Group = {
  label: "FINISH",
  items: [{ action: "finish", label: "Finish Sketch", iconName: "check", kind: "finish" }],
};

const groups = computed<Group[]>(() =>
  ribbon.context === "sketch" ? [...SKETCH, PALETTE_GROUP, FINISH_GROUP] : MODEL,
);

const priorityOf = (label: string) => (PINNED.has(label) ? Infinity : (PRIORITY[label] ?? 50));

// --- split buttons: last-used-wins primary -------------------------------
// Keyed by the split's label, so a primary chosen in one context survives a
// trip through the other. setActiveSketchTool ALSO writes here: arming a
// constraint from the keymap has to put it on the button face, or the .active
// highlight below would have nothing to land on.
const primaryOf = ref<Record<string, string>>({});

function primaryTool(it: Item & { children: ToolItem[] }): ToolItem {
  const chosen = primaryOf.value[it.label];
  return (chosen && it.children.find((c) => c.action === chosen)) || it.children[0]!;
}

watch(
  () => ribbon.activeSketchTool,
  (tool) => {
    if (!tool) return;
    for (const g of SKETCH) {
      for (const it of g.items) {
        if ("children" in it && it.children.some((c) => c.action === tool)) {
          primaryOf.value = { ...primaryOf.value, [it.label]: tool };
        }
      }
    }
  },
);

// --- overflow packing ----------------------------------------------------
// Natural group sizes ALONG THE BAR, measured with every group shown, cached
// per context. Re-measuring on each reflow would mean un-collapsing, awaiting a
// frame and re-collapsing — a visible flicker during a resize drag. The sizes
// only change when the context, the font, the zoom or the bar's axis changes,
// none of which is a container resize, so the cache is invalidated on those.
const naturalWidths = new Map<RibbonContext, number[]>();
const collapsedLabels = ref<Set<string>>(new Set());

// Which way the bar runs (ui/layoutPrefs.ts). Everything below is written in
// terms of "along the bar" rather than "wide", because a side ribbon overflows
// DOWNWARD: measuring widths there compares each full-width group against a
// column of its own width and collapses almost all of them into the ⋯ button.
const vertical = ref(layoutPrefs().ribbon === "left");

function measure(): number[] {
  const el = ctx.value;
  if (!el) return [];
  const along = (g: HTMLElement) => (vertical.value ? g.offsetHeight : g.offsetWidth);
  return [...el.querySelectorAll<HTMLElement>(".ribbon-group")].map(along);
}

async function naturalFor(context: RibbonContext): Promise<number[]> {
  const cached = naturalWidths.get(context);
  if (cached?.length) return cached;
  // Measure with nothing collapsed — the one frame we cannot avoid, paid once
  // per context rather than once per resize event.
  const had = collapsedLabels.value;
  if (had.size) {
    collapsedLabels.value = new Set();
    await nextTick();
  }
  const w = measure();
  if (w.length) naturalWidths.set(context, w);
  return w;
}

async function reflow() {
  const el = ctx.value;
  if (!el) return;
  const list = groups.value;
  const widths = await naturalFor(ribbon.context);
  if (widths.length !== list.length) return; // mid-swap; the context watcher re-runs it

  const available = (vertical.value ? el.clientHeight : el.clientWidth) - 12;
  let total = widths.reduce((a, b) => a + b, 0);
  if (total <= available) {
    collapsedLabels.value = new Set();
    closePopup();
    return;
  }
  total += 40; // reserve the overflow button

  // low priority first, then rightmost — same order the class used
  const order = list
    .map((g, i) => ({ g, i }))
    .filter((x) => !PINNED.has(x.g.label))
    .sort((a, b) => priorityOf(a.g.label) - priorityOf(b.g.label) || b.i - a.i);

  const next = new Set<string>();
  for (const { g, i } of order) {
    if (total <= available) break;
    const w = widths[i];
    if (w === undefined) continue;
    next.add(g.label);
    total -= w;
  }
  collapsedLabels.value = next;
  // A reflow moves or hides split-arrow anchors, so a split dropdown would be
  // pointing at nothing. The overflow popup is fine — its contents are derived.
  if (popup.value?.kind === "split") closePopup();
}

const collapsedGroups = computed(() =>
  groups.value
    .filter((g) => collapsedLabels.value.has(g.label))
    // split buttons flatten: every child tool stays reachable from the overflow
    .map((g) => ({ label: g.label, items: g.items.flatMap(leavesOf) })),
);

let ro: ResizeObserver | null = null;
let offLayout: (() => void) | null = null;
onMounted(() => {
  ro = new ResizeObserver(() => void reflow());
  if (root.value) ro.observe(root.value);
  // Turning the bar on its side changes which dimension the cached sizes are,
  // so they have to go — a column of heights compared against a row's width
  // collapses everything. The ResizeObserver fires too, but only after the
  // layout settles, and it would reflow against the stale cache first.
  offLayout = onLayoutPrefsChange(async () => {
    const next = layoutPrefs().ribbon === "left";
    if (next === vertical.value) return; // the history side moved, not ours
    vertical.value = next;
    naturalWidths.clear();
    collapsedLabels.value = new Set();
    closePopup();
    await nextTick();
    void reflow();
  });
  void reflow();
});
onUnmounted(() => { ro?.disconnect(); offLayout?.(); });

// A context switch swaps the whole group list, so the cache key changes and the
// packing has to be redone against the new set.
watch(
  () => ribbon.context,
  async () => {
    closePopup();
    collapsedLabels.value = new Set();
    await nextTick();
    void reflow();
  },
);

// --- popups --------------------------------------------------------------
// At most one is open, which is what the class's single overflowPopup field
// enforced. `anchor` is the element it hangs off, for positioning and for
// letting a second click on the same button toggle it shut.
const popup = shallowRef<
  | { kind: "overflow"; anchor: HTMLElement }
  | { kind: "split"; anchor: HTMLElement; label: string; items: ToolItem[] }
  | null
>(null);

const overflowBtn = useTemplateRef<HTMLButtonElement>("overflowBtn");

function closePopup() {
  popup.value = null;
}

function toggleOverflow() {
  const wasOpen = popup.value?.kind === "overflow";
  closePopup();
  if (!wasOpen && overflowBtn.value) popup.value = { kind: "overflow", anchor: overflowBtn.value };
}

function toggleSplit(ev: MouseEvent, it: Item & { children: ToolItem[] }) {
  const anchor = ev.currentTarget as HTMLElement;
  const wasMine = popup.value?.kind === "split" && popup.value.anchor === anchor;
  closePopup();
  if (wasMine) return; // second click on the same arrow just closes
  popup.value = { kind: "split", anchor, label: it.label, items: it.children };
}

function pickFromPopup(it: ToolItem) {
  const p = popup.value;
  // A split pick also becomes that button's primary (last-used-wins); an
  // overflow pick just runs, because the group is collapsed anyway.
  if (p?.kind === "split") primaryOf.value = { ...primaryOf.value, [p.label]: it.action };
  closePopup();
  ribbon.act(it.action);
}

function title(it: ToolItem) {
  return it.key ? `${it.label} (${it.key})` : it.label;
}
</script>

<template>
  <div id="ribbon" ref="root">
    <div ref="ctx" class="ribbon-context">
      <template v-for="g in groups" :key="g.label">
        <!-- the spacer pushes PALETTE/FINISH to the right in sketch context -->
        <div v-if="g.label === 'PALETTE'" class="ribbon-spacer"></div>
        <div class="ribbon-group" :class="{ collapsed: collapsedLabels.has(g.label) }">
          <div class="ribbon-tools">
            <template v-for="it in g.items" :key="'children' in it ? it.label : it.action">
              <div v-if="'children' in it" class="ribbon-split">
                <button
                  class="ribbon-btn"
                  :data-action="primaryTool(it).action"
                  :class="{ active: ribbon.activeSketchTool === primaryTool(it).action }"
                  :title="title(primaryTool(it))"
                  @click="ribbon.act(primaryTool(it).action)"
                >
                  <Icon :name="primaryTool(it).iconName" /><span>{{ primaryTool(it).label }}</span>
                </button>
                <button
                  class="ribbon-split-arrow"
                  :title="`More ${it.label} tools`"
                  @click.stop="toggleSplit($event, it)"
                ><Icon name="caretDown" :size="11" /></button>
              </div>
              <button
                v-else
                class="ribbon-btn"
                :class="{ finish: it.kind === 'finish', active: ribbon.activeSketchTool === it.action }"
                :data-action="it.action"
                :title="title(it)"
                @click="ribbon.act(it.action)"
              >
                <Icon :name="it.iconName" /><span>{{ it.label }}</span>
              </button>
            </template>
          </div>
          <div class="ribbon-group-label">{{ g.label }}</div>
        </div>
      </template>

      <button
        ref="overflowBtn"
        class="ribbon-overflow"
        :class="{ hidden: !collapsedGroups.length }"
        title="More tools"
        @click.stop="toggleOverflow()"
      >⋯</button>
    </div>

    <RibbonPopup
      v-if="popup"
      :anchor="popup.anchor"
      :align="popup.kind === 'overflow' ? 'right' : 'left'"
      :items="popup.kind === 'split' ? popup.items : []"
      :groups="popup.kind === 'overflow' ? collapsedGroups : undefined"
      @pick="pickFromPopup"
      @dismiss="closePopup"
    />
  </div>
</template>
