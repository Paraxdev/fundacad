<script setup lang="ts">
// The one sanctioned v-html in the app.
//
// It is safe for a reason that has to hold for it to stay safe: every value in
// icons.ts's PATHS table is a compile-time string constant in that file. No
// document data, no file name, no network payload ever reaches it. Nothing else
// may use v-html — see the CI grep.
//
// Renders the <svg> element ITSELF rather than wrapping one, because the layout
// rules select `.ribbon-btn svg` / `.ctx-item svg` directly and a wrapper span
// would sit between them and break the flex sizing.

import { computed } from "vue";
import { iconPaths } from "../../ui/icons";

const props = defineProps<{ name: string }>();
const paths = computed(() => iconPaths(props.name));
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    v-html="paths"
  />
</template>
