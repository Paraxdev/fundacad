<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useEngine } from "../../app/engineKey";
import { useUiStore } from "../../stores/ui";
import { getUnit, setUnit, asUnit, onUnitChange, type Unit } from "../../ui/units";
import brandLockup from "../../../assets/brand/sindricad-lockup-app.svg";

const engine = useEngine();
const ui = useUiStore();

// units.ts is a module-level observable with its own listener set and a
// localStorage backing. Rather than move that state into Pinia (it is read
// synchronously at draw time by the viewport, eight feature tools and the
// sketch dimension labels, none of which are Vue), mirror it into a ref.
const unit = ref<Unit>(getUnit());
let offUnit: (() => void) | null = null;
onMounted(() => { offUnit = onUnitChange(() => { unit.value = getUnit(); }); });
onUnmounted(() => offUnit?.());

function onUnitInput(ev: Event) {
  // asUnit is a mandatory narrowing gate, not a formality — see units.ts:15-22.
  const u = asUnit((ev.target as HTMLSelectElement).value);
  if (u) setUnit(u);
}
</script>

<template>
  <header id="titlebar">
    <span class="brand"><img :src="brandLockup" alt="SindriCAD" /></span>
    <!-- Menubar is still the imperative ui/menu.ts class; it mounts in here. -->
    <nav id="menubar"></nav>
    <button
      id="undo-btn"
      class="tb-btn"
      title="Undo (Ctrl+Z)"
      :disabled="!ui.canUndo"
      @click="engine.doUndo()"
    >↶</button>
    <button
      id="redo-btn"
      class="tb-btn"
      title="Redo (Ctrl+Y)"
      :disabled="!ui.canRedo"
      @click="engine.doRedo()"
    >↷</button>
    <span id="context-tab" class="context-tab" :class="{ sketch: ui.sketchActive }">
      {{ ui.sketchActive ? "SKETCH" : "SOLID" }}
    </span>
    <span id="docname" class="docname" :class="{ dirty: ui.dirty }">
      {{ (ui.dirty ? "● " : "") + ui.docName }}
    </span>
    <div class="spacer"></div>
    <label class="units" title="Display units (geometry is stored in mm)">
      Units
      <select id="unit" :value="unit" @change="onUnitInput">
        <option value="mm">mm</option>
        <option value="cm">cm</option>
        <option value="in">in</option>
      </select>
    </label>
    <span id="status" class="status" :class="ui.statusClass">{{ ui.statusText }}</span>
  </header>
</template>
