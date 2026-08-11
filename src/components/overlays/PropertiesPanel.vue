<script setup lang="ts">
// Inspect → Properties: volume / area / mass / centre of mass / bounding box.
// The numbers are computed and unit-formatted by ui/panels.ts at open time (a
// one-shot readout of the CURRENT selection, not a live view), so this is pure
// presentation.

import { usePanelsStore } from "../../stores/panels";
import FloatingPanel from "./FloatingPanel.vue";

const panels = usePanelsStore();
</script>

<template>
  <FloatingPanel :open="!!panels.properties" close-on-esc @close="panels.properties = null">
    <template v-if="panels.properties">
      <div class="measure-title">Properties, {{ panels.properties.title }}</div>
      <div v-for="r in panels.properties.rows" :key="r.k" class="measure-row">
        <span class="measure-k">{{ r.k }}</span>
        <span class="measure-v">{{ r.v }}</span>
      </div>
      <div class="measure-hint">Select a body for its own properties · Esc to close</div>
    </template>
  </FloatingPanel>
</template>
