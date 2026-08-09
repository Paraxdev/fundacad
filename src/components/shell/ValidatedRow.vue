<script setup lang="ts">
import { ref, useTemplateRef } from "vue";
import { useDraft } from "../../composables/useDraft";

const props = defineProps<{
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

// The replacement for keystrokeGuard: a background doc change re-runs `value`,
// but the draft ignores it while this input has focus, so uncommitted
// keystrokes survive an async param commit landing from elsewhere.
const el = useTemplateRef<HTMLInputElement>("el");
const { draft, resync } = useDraft(() => props.value, el);
const error = ref<string | null>(null);

function onChange() {
  const err = props.commit(draft.value.trim());
  error.value = err;
  // On success, re-read: the panel may re-spell what we sent (fx badge,
  // canonical rounding). On failure keep the rejected text so it can be fixed.
  if (!err) resync();
}
</script>

<template>
  <div class="param-row" :class="rowClass" :title="rowTitle">
    <label>{{ label }}</label>
    <input
      ref="el"
      type="text"
      v-model="draft"
      :class="{ 'input-error': !!error }"
      :title="error ?? hint"
      @input="error = null"
      @change="onChange"
    />
  </div>
</template>
