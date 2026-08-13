<script setup lang="ts">
// A labelled row of feature values: label on the left, a committing text input
// on the right. The input's behaviour (and the mid-edit guard) lives in
// ValidatedInput; this only adds the row chrome — the fx-row / param-stale
// classes and the row tooltip.

import ValidatedInput from "./ValidatedInput.vue";

defineProps<{
  label: string;
  /** Current committed value, in whatever spelling the panel wants shown. */
  value: string;
  /** Return an error message to show, or null on success. */
  commit: (raw: string) => string | null;
  /** Extra classes for the row (fx-row, param-stale, …). */
  rowClass?: string | undefined;
  /** Tooltip for the row; the input's own title is the error, when there is one. */
  rowTitle?: string | undefined;
  hint?: string | undefined;
}>();
</script>

<template>
  <div class="param-row" :class="rowClass" :title="rowTitle">
    <label>{{ label }}</label>
    <ValidatedInput :value="value" :commit="commit" :hint="hint" />
  </div>
</template>
