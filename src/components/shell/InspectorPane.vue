<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from "vue";
import { useEngine } from "../../app/engineKey";
import { useDocValue } from "../../app/useDoc";
import { useSelectionStore } from "../../stores/selection";
import ValidatedRow from "./ValidatedRow.vue";
import {
  getUnit, onUnitChange, toDisplay, round, displayValue,
  isPlainNumber, parseField, fromDisplay,
} from "../../ui/units";
import { FEATURE_META } from "../../ui/featureMeta";
import { resolveEntities, toSketchEntity } from "../../sketch/resolve";
import { entityDims } from "../../sketch/entityDims";
import {
  FEATURE_NUM_FIELDS as NUM_FIELDS, isInspectorEditable, type FieldKind,
} from "../../document/numFields";
import type { Feature, Num, ParamTarget } from "../../types";

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

// --- sketch: editable per-entity dimensions (same descriptors as the in-canvas
// labels). Editing entity i serializes just that entity back to numbers and
// leaves the others (and their parameter references) untouched. ---
const sketchRows = useDocValue((doc) => {
  const f = selected.value;
  if (f?.type !== "sketch") return [];
  const resolved = resolveEntities(f, doc.parameters);
  const out: { key: string; label: string; value: string; index: number; field: string }[] = [];
  resolved.forEach((e, i) => {
    for (const d of entityDims(e)) {
      out.push({
        key: `${i}:${d.field}`,
        label: `${d.label} ${unit.value}`,
        value: String(displayValue(d.valueMm)),
        index: i,
        field: d.field,
      });
    }
  });
  return out;
});

function commitSketchDim(row: { index: number; field: string }, raw: string): string | null {
  const v = parseFloat(raw);
  if (Number.isNaN(v)) return "not a number";
  const f = selected.value;
  if (f?.type !== "sketch") return null;
  const copy = resolveEntities(f, store.document.parameters)[row.index];
  if (!copy) return null;
  entityDims(copy).find((x) => x.field === row.field)?.write(fromDisplay(v));
  const entities = f.entities.map((ent, j) => (j === row.index ? toSketchEntity(copy) : ent));
  store.updateFeature(f.id, { entities } as Partial<Feature>);
  return null;
}

// --- numeric feature fields ---
const featureRows = computed(() => {
  const f = selected.value;
  if (!f || f.type === "sketch") return [];
  const fields = NUM_FIELDS[f.type];
  if (!fields) return [];
  return fields.map(([field, label, kind]) => {
    const cur = (f as any)[field] as Num | undefined;
    const target: ParamTarget = { kind: "feature", feature: f.id, field };
    const bound = store.boundExpr(target);
    const suffix = kind === "length" ? ` ${unit.value}` : kind === "angle" ? "°" : "";
    // a bound field edits its EXPRESSION (canonical units); a plain field shows
    // its number in display units (lengths convert, angles/counts raw)
    const shown = bound
      ? bound.expr
      : typeof cur === "number"
        ? String(kind === "length" ? round(toDisplay(cur)) : cur)
        : (cur ?? "");
    const fx = bound && store.isParamBound(target);
    return {
      key: field,
      label: `${label}${suffix}`,
      value: String(shown),
      target,
      kind,
      rowClass: fx ? "fx-row" : undefined,
      rowTitle: fx && bound ? `${bound.name} = ${bound.expr} = ${round(bound.value)}` : undefined,
    };
  });
});

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

/** Route raw field input: plain number → display-unit value write (keeps a
 *  bound field's model param as a literal); anything else → expression in
 *  CANONICAL units (mm/deg) via the params engine. Deliberate semantics fork
 *  (plan decision R4): bare literals in expressions are canonical so the same
 *  file evaluates identically on every machine — unit suffixes (0.5 in) are
 *  the display-unit spelling inside expressions. */
function commitField(target: ParamTarget, kind: FieldKind, raw: string): string | null {
  if (isPlainNumber(raw)) {
    store.setTargetValue(target, parseField(raw, kind)!, kind);
    return null;
  }
  return store.setTargetExpr(target, raw, kind);
}

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

    <template v-else-if="hasEditor">
      <div class="panel-title" style="margin-top: 14px">{{ featureTitle }}</div>
      <ValidatedRow
        v-for="r in sketchRows"
        :key="r.key"
        :label="r.label"
        :value="r.value"
        :commit="(raw) => commitSketchDim(r, raw)"
      />
      <ValidatedRow
        v-for="r in featureRows"
        :key="r.key"
        :label="r.label"
        :value="r.value"
        :row-class="r.rowClass"
        :row-title="r.rowTitle"
        hint="number, parameter name, or expression (e.g. width/2 + 5)"
        :commit="(raw) => commitField(r.target, r.kind, raw)"
      />
    </template>
  </aside>
</template>
