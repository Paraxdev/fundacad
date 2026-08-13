<script setup lang="ts">
// One feature's editable values.
//
// Lifted out of the docked Parameters panel so the history can show these rows under
// the feature you clicked. Both surfaces render THIS, rather than each building
// its own list: the rows are not a display of the feature, they are the write
// path into it (a bound field edits its expression, a sketch dimension
// re-serialises one entity), and two copies of that would drift the moment a
// field type was added.
//
// The title is the caller's business — the history heads it with the feature
// name, the timeline already has the chip you clicked.

import { computed } from "vue";
import { useEngine } from "../../app/engineKey";
import { useDocValue } from "../../app/useDoc";
import ValidatedRow from "./ValidatedRow.vue";
import { toDisplay, round, displayValue, isPlainNumber, parseField } from "../../ui/units";
import { resolveEntities, toSketchEntity } from "../../sketch/resolve";
import { entityDims } from "../../sketch/entityDims";
import { FEATURE_NUM_FIELDS as NUM_FIELDS, type FieldKind } from "../../document/numFields";
import type { Feature, Num, ParamTarget } from "../../types";

const props = defineProps<{ featureId: string; unit: string }>();

const engine = useEngine();
const store = engine.store;

const feature = useDocValue((doc) => doc.features.find((f) => f.id === props.featureId) ?? null);

// --- sketch: editable per-entity dimensions (same descriptors as the in-canvas
// labels). Editing entity i serialises just that entity back to numbers and
// leaves the others (and their parameter references) untouched. ---
const sketchRows = useDocValue((doc) => {
  const f = feature.value;
  if (f?.type !== "sketch") return [];
  const resolved = resolveEntities(f, doc.parameters);
  const out: { key: string; label: string; value: string; index: number; field: string }[] = [];
  resolved.forEach((e, i) => {
    for (const d of entityDims(e)) {
      out.push({
        key: `${i}:${d.field}`,
        label: `${d.label} ${props.unit}`,
        value: String(displayValue(d.valueMm)),
        index: i,
        field: d.field,
      });
    }
  });
  return out;
});

function commitSketchDim(row: { index: number; field: string }, raw: string): string | null {
  const v = parseField(raw, "length");
  if (v == null) return "not a value";
  const f = feature.value;
  if (f?.type !== "sketch") return null;
  const copy = resolveEntities(f, store.document.parameters)[row.index];
  if (!copy) return null;
  entityDims(copy).find((x) => x.field === row.field)?.write(v);
  const entities = f.entities.map((ent, j) => (j === row.index ? toSketchEntity(copy) : ent));
  store.updateFeature(f.id, { entities } as Partial<Feature>);
  return null;
}

// --- numeric feature fields ---
const featureRows = computed(() => {
  const f = feature.value;
  if (!f || f.type === "sketch") return [];
  const fields = NUM_FIELDS[f.type];
  if (!fields) return [];
  return fields.map(([field, label, kind]) => {
    const cur = (f as unknown as Record<string, Num | undefined>)[field];
    const target: ParamTarget = { kind: "feature", feature: f.id, field };
    const bound = store.boundExpr(target);
    const suffix = kind === "length" ? ` ${props.unit}` : kind === "angle" ? "°" : "";
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

/** Route raw field input: plain number → display-unit value write (keeps a
 *  bound field's model param as a literal); anything else → expression in
 *  CANONICAL units (mm/deg) via the params engine. Deliberate semantics fork
 *  (plan decision R4): bare literals in expressions are canonical so the same
 *  file evaluates identically on every machine, unit suffixes (0.5 in) are
 *  the display-unit spelling inside expressions. */
function commitField(target: ParamTarget, kind: FieldKind, raw: string): string | null {
  if (isPlainNumber(raw)) {
    store.setTargetValue(target, parseField(raw, kind)!, kind);
    return null;
  }
  return store.setTargetExpr(target, raw, kind);
}

</script>

<template>
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
    hint="a value with any unit (2mm, 1 inch, 1/2&quot;), a parameter, or an expression"
    :commit="(raw) => commitField(r.target, r.kind, raw)"
  />
</template>
