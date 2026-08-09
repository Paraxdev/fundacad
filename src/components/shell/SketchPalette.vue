<script setup lang="ts">
import { useSketchPaletteStore, PALETTE_TOGGLES } from "../../stores/sketchPalette";

const palette = useSketchPaletteStore();
</script>

<template>
  <!-- `.hidden` rather than v-if, matching setVisible()'s classList.toggle: the
       panel keeps its DOM (and so its CSS transition) between sketches. -->
  <aside id="palette" class="palette" :class="{ hidden: !palette.visible }">
    <div class="palette-title">SKETCH PALETTE</div>
    <div class="palette-section">Options</div>
    <button
      class="palette-btn"
      title="Square the view to the sketch plane"
      @click="palette.lookAt()"
    >Look At</button>
    <label v-for="t in PALETTE_TOGGLES" :key="t.key" class="palette-row">
      <span>{{ t.label }}</span>
      <input
        type="checkbox"
        class="palette-switch"
        :checked="palette.state[t.key]"
        @change="palette.set(t.key, ($event.target as HTMLInputElement).checked)"
      />
    </label>
  </aside>
</template>
