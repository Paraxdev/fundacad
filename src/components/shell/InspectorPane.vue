<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from "vue";
import { useEngine } from "../../app/engineKey";
import { useDocValue } from "../../app/useDoc";
import { useSelectionStore } from "../../stores/selection";
import ValidatedRow from "./ValidatedRow.vue";
import FeatureProperties from "./FeatureProperties.vue";
import { getUnit, onUnitChange, toDisplay, round, fromDisplay } from "../../ui/units";
import { FEATURE_META } from "../../ui/featureMeta";
import { isInspectorEditable } from "../../document/numFields";

const engine = useEngine();
const store = engine.store;
const selection = useSelectionStore();
const root = useTemplateRef<HTMLElement>("root");

// WebKitGTK quirk, carried over verbatim from mountUi's `for (const id of
// ["browser", "inspector"])` loop: wheel events over an overflow panel don't
// reliably reach the native scroller (GTK kinetic scrolling eats them — fine in
// Chromium, dead in the webview), so drive the scroll explicitly, deltaMode-
// normalized like the viewport's zoom wheel.
//
// Attached by hand rather than with @wheel because it MUST be non-passive:
// preventDefault is the whole point, and a passive listener would silently
// no-op it. BrowserPane.vue carries the twin of this.
function onWheel(ev: WheelEvent) {
  const el = root.value;
  if (!el || el.scrollHeight <= el.clientHeight) return;
  const step = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 100 : 1;
  el.scrollTop += ev.deltaY * step;
  ev.preventDefault();
}
onMounted(() => root.value?.addEventListener("wheel", onWheel, { passive: false }));
onUnmounted(() => root.value?.removeEventListener("wheel", onWheel));

// units.ts is its own module-level observable (read synchronously by the
// viewport and eight tools, none of which are Vue), so mirror it into a ref
// rather than moving the state.
const unit = ref(getUnit());
let offUnit: (() => void) | null = null;
onMounted(() => { offUnit = onUnitChange(() => { unit.value = getUnit(); }); });
onUnmounted(() => offUnit?.());

// --- user parameters (model params dN live in the Change Parameters dialog) ---
const params = useDocValue((doc) => {
  const defs = doc.paramDefs ?? {};
  return Object.entries(doc.parameters)
    .filter(([name]) => !defs[name]?.target)
    .map(([name, value]) => ({ name, value: round(toDisplay(value)) }));
});
// paramIssues is a plain public field on the store, rewritten inside the same
// pass that emits the doc change — so it rides the doc version, as before.
const issues = useDocValue(() => ({ ...store.paramIssues }));

const selected = useDocValue((doc) =>
  selection.featureId ? (doc.features.find((f) => f.id === selection.featureId) ?? null) : null,
);



// A selected feature whose type has neither sketch entities nor numeric fields
// (an import, say) gets no section at all — not a title over an empty list.
// Same predicate the context menu uses to decide "Edit" vs "Select".
const hasEditor = computed(() => {
  const f = selected.value;
  return !!f && isInspectorEditable(f.type);
});

const featureTitle = computed(() => {
  const f = selected.value;
  if (!f) return "";
  return f.type === "sketch"
    ? `Sketch · ${f.id}`
    : `${FEATURE_META[f.type as keyof typeof FEATURE_META].label} · ${f.id}`;
});


function commitParam(name: string, raw: string): string | null {
  const v = parseFloat(raw);
  if (Number.isNaN(v)) return "not a number";
  store.setParam(name, fromDisplay(v));
  return null;
}
</script>

<template>
  <aside id="inspector" ref="root">
    <div class="panel-title">Parameters ({{ unit }})</div>
    <ValidatedRow
      v-for="p in params"
      :key="p.name"
      :label="p.name"
      :value="String(p.value)"
      :row-class="issues[p.name] ? 'param-stale' : undefined"
      :row-title="issues[p.name]"
      :commit="(raw) => commitParam(p.name, raw)"
    />

    <div v-if="!selected" class="empty-state">
      Select a feature in the timeline or browser to edit its values.
    </div>

    <template v-else-if="hasEditor && selected">
      <div class="panel-title" style="margin-top: 14px">{{ featureTitle }}</div>
      <FeatureProperties :feature-id="selected.id" :unit="unit" />
    </template>
  </aside>
</template>
