<script setup lang="ts">
// A text input that commits on `change` (Enter / blur): `commit` returns an
// error message to show — the input turns red and KEEPS the rejected text so
// the user can fix it — or null on success. Typing clears the error.
//
// Replaces liveInputs.ts's validatedInput. Bare on purpose: the inspector wraps
// it in a labelled row (ValidatedRow), while the Parameters dialog drops it
// straight into a grid cell, and those two layouts have nothing in common
// beyond this behaviour.

import { ref, useTemplateRef } from "vue";
import { useDraft } from "../../composables/useDraft";

const props = defineProps<{
  /** Current committed value, in whatever spelling the panel wants shown. */
  value: string;
  commit: (raw: string) => string | null;
  /** Tooltip while there is no error; the error replaces it when there is one. */
  hint?: string | undefined;
  placeholder?: string | undefined;
}>();

// The keystrokeGuard replacement: a background doc change re-runs `value`, but
// the draft ignores it while this input has focus, so uncommitted keystrokes
// survive an async param commit landing from elsewhere.
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
  <input
    ref="el"
    v-model="draft"
    type="text"
    :class="{ 'input-error': !!error }"
    :title="error ?? hint"
    :placeholder="placeholder"
    @input="error = null"
    @change="onChange"
  />
</template>
