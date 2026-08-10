<script setup lang="ts">
import { markRaw, ref, onMounted, onUnmounted } from "vue";
import { useEngine } from "../../app/engineKey";
import { useUiStore } from "../../stores/ui";
import { getUnit, setUnit, asUnit, onUnitChange, type Unit } from "../../ui/units";
import { buildMenubar } from "../../app/menubarDef";
import Icon from "./Icon.vue";
import MenuBar from "./MenuBar.vue";
import brandLockup from "../../../assets/brand/sindricad-lockup-app.svg";

const engine = useEngine();
const ui = useUiStore();

// Built once. The tree is static; everything dynamic about it (Undo greying
// out, the SpaceMouse mode checkmarks, Sign in/out) is a thunk that MenuBar
// re-evaluates each time a menu opens. markRaw because every onClick closes
// over the raw engine.
const menus = markRaw(buildMenubar(engine));

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
    <MenuBar :menus="menus" />
    <button
      id="undo-btn"
      class="tb-btn"
      title="Undo (Ctrl+Z)"
      :disabled="!ui.canUndo"
      @click="engine.doUndo()"
    ><Icon name="undo" :size="15" /></button>
    <button
      id="redo-btn"
      class="tb-btn"
      title="Redo (Ctrl+Y)"
      :disabled="!ui.canRedo"
      @click="engine.doRedo()"
    ><Icon name="redo" :size="15" /></button>
    <span id="context-tab" class="context-tab" :class="{ sketch: ui.sketchActive }">
      {{ ui.sketchActive ? "SKETCH" : "SOLID" }}
    </span>
    <span id="docname" class="docname" :class="{ dirty: ui.dirty }">
      <!-- The unsaved mark is an ICON in its own slot, not a character glued
           to the front of the name: as a prefix it moved the whole filename
           sideways the instant the document went dirty, which is a jump the eye
           reads as the name having changed. -->
      <Icon v-if="ui.dirty" name="dot" :size="8" class="dirty-dot" />{{ ui.docName }}
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
