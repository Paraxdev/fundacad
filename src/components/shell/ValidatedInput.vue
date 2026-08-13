<script setup lang="ts">
// A text input that commits on `change` (Enter / blur): `commit` returns an
// error message to show — the input turns red and KEEPS the rejected text so
// the user can fix it — or null on success. Typing clears the error.
//
// Replaces liveInputs.ts's validatedInput. Bare on purpose: ValidatedRow wraps
// it in a labelled row (ValidatedRow), while the Parameters dialog drops it
// straight into a grid cell, and those two layouts have nothing in common
// beyond this behaviour.

import { nextTick, ref, useTemplateRef, watch } from "vue";
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

/** A commit succeeded and the field is waiting to be told how the panel spells
 *  the result. Cleared by the next keystroke, which means the user has moved on
 *  and their text outranks the answer to the previous edit. */
let settling = false;

async function onChange() {
  const err = props.commit(draft.value.trim());
  error.value = err;
  // On failure keep the rejected text so it can be fixed rather than retyped.
  if (err) return;
  settling = true;
  // On success, re-read: the panel may re-spell what we sent (fx badge,
  // canonical rounding, a unit the row adopted). AFTER a tick, because `value`
  // is a prop and props do not update until the re-render, so reading it here
  // resyncs the field to the value that was just replaced.
  await nextTick();
  resync();
}

// The draft ignores the source while this input has focus, which is right for an
// edit landing from somewhere else and wrong for the answer to the edit made
// here: a parameter expression commits on a promise chain and arrives several
// frames after the change event, long past the tick above. Skipped rather than
// deferred, the field sat on its pre-edit number for as long as it kept focus,
// so typing "20+5" and pressing Enter looked like it had done nothing.
watch(
  () => props.value,
  () => {
    if (!settling) return;
    settling = false;
    resync();
  },
);
</script>

<template>
  <input
    ref="el"
    v-model="draft"
    type="text"
    :class="{ 'input-error': !!error }"
    :title="error ?? hint"
    :placeholder="placeholder"
    @input="error = null; settling = false"
    @change="onChange"
  />
</template>
