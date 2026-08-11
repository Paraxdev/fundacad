<script setup lang="ts">
// Floating panel for the printed-Texture tool (knurl/hex/waves/ribs/voronoi/
// noise/image heightmap). Unlike the Text panel (cursor-anchored, one text
// object) this is DOCKED top-right: the tool can span a whole body, not one
// clicked point, so there is no natural anchor to follow.
//
// Replaces the DOM half of features/texturePanel.ts, which stays as the facade
// TextureTool calls. Which rows a given kind/profile shows is decided by
// textureRows() in textureForm.ts — pure, and tested, because that logic encodes
// real sidecar behaviour and has been wrong before.
//
// Escape is NOT handled here. TextureTool owns it for its whole active lifetime,
// which starts before this panel exists (the edit path rolls the model back
// first) and must outlast a refused commit. A panel-scoped handler left those
// windows with no way out.

import { computed, reactive, type CSSProperties } from "vue";
import {
  KIND_OPTIONS, basename, initialTextureForm, sharpnessLabel, textureRows, toTextureValues,
  type TextureMode,
} from "../../features/textureForm";
import Icon from "../shell/Icon.vue";
import { useToolPanelStore, type TextureReq } from "../../stores/toolPanels";

const props = defineProps<{ req: TextureReq }>();
const panels = useToolPanelStore();

// App.vue keys this on req.id, so reopening the tool remounts with fresh state.
const form = reactive(initialTextureForm(props.req.initial));
const rows = computed(() => textureRows(form));
const sharpLabel = computed(() => sharpnessLabel(form.profile));

function emitChange() {
  props.req.onChange(toTextureValues(form));
}

function chooseMode(m: TextureMode) {
  panels.textureMode = m;
  props.req.onModeChange(m);
}

function randomize() {
  form.seed = String(Math.floor(Math.random() * 1_000_000));
  emitChange();
}

const isTauri = () => "__TAURI_INTERNALS__" in window;

async function browse() {
  if (!isTauri()) {
    console.warn("texture image needs the native app (a real filesystem path)");
    return;
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({
    multiple: false,
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "bmp"] }],
  });
  if (typeof path !== "string") return;
  form.imagePath = path;
  emitChange();
}

// --- inline styles, carried over from the class verbatim ------------------
const root: CSSProperties = {
  position: "fixed", top: "60px", right: "16px", zIndex: "50",
  padding: "8px", background: "#20242c", border: "1px solid #3a4150", borderRadius: "6px",
  boxShadow: "0 6px 20px rgba(0,0,0,0.4)", font: "12px system-ui, sans-serif",
  color: "#dce3ee", width: "270px", maxWidth: "calc(100vw, 24px)", boxSizing: "border-box",
  maxHeight: "calc(100vh, 80px)", overflowY: "auto",
  colorScheme: "dark", // native <select>/checkbox/number-spinner render dark
};
const row: CSSProperties = { display: "flex", gap: "6px", alignItems: "center", marginBottom: "6px" };
const field: CSSProperties = {
  background: "#161a20", color: "#dce3ee", border: "1px solid #3a4150",
  borderRadius: "3px", padding: "3px 5px", font: "inherit",
};
const lbl: CSSProperties = { whiteSpace: "nowrap", cursor: "pointer" };
const grow: CSSProperties = { ...field, flex: "1" };
const num: CSSProperties = { ...field, width: "64px" };
const title: CSSProperties = { fontWeight: "600", marginBottom: "6px" };
const muted: CSSProperties = { color: "#8b93a3", marginBottom: "6px" };
const modeBtn: CSSProperties = {
  flex: "1", border: "1px solid #3a4150", borderRadius: "3px", padding: "4px 6px",
  cursor: "pointer", font: "inherit",
};
const modeOn: CSSProperties = { background: "#2b6", borderColor: "#2b6", color: "#fff" };
const modeOff: CSSProperties = { background: "transparent", borderColor: "#3a4150", color: "#dce3ee" };
const smallBtn: CSSProperties = {
  border: "1px solid #3a4150", borderRadius: "3px", padding: "3px 8px", cursor: "pointer", font: "inherit",
};
const pathLabel: CSSProperties = {
  flex: "1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#8b93a3",
};
const summaryStyle: CSSProperties = { cursor: "pointer", marginBottom: "4px" };
const offsetRow: CSSProperties = { display: "flex", gap: "6px", alignItems: "center" };
const note: CSSProperties = { color: "#8b93a3", fontStyle: "italic", margin: "8px 0" };
const btnRow: CSSProperties = { ...row, marginBottom: "0", justifyContent: "flex-end" };
const btn: CSSProperties = { color: "#fff", border: "none", borderRadius: "4px", padding: "4px 10px", cursor: "pointer", font: "inherit" };
const okBtn: CSSProperties = { ...btn, background: "#2b6" };
const noBtn: CSSProperties = { ...btn, background: "#555" };
</script>

<template>
  <Teleport to="body">
    <div :style="root">
      <div :style="title">Texture</div>
      <!-- Live selection summary. Bound straight to the store rather than
           carried on the request, so refreshing it (the tool rewrites it on
           every rAF tick) cannot re-render the form and steal focus from
           whatever field is being typed into. -->
      <div :style="muted">{{ panels.textureSummary }}</div>

      <!-- [Faces] / [Whole Body] mode toggle — a segmented pair of buttons. -->
      <div :style="row">
        <button :style="[modeBtn, panels.textureMode === 'faces' ? modeOn : modeOff]" @click="chooseMode('faces')">Faces</button>
        <button :style="[modeBtn, panels.textureMode === 'body' ? modeOn : modeOff]" @click="chooseMode('body')">Whole Body</button>
      </div>

      <div :style="row">
        <label :style="lbl">Kind</label>
        <select v-model="form.kind" :style="grow" @change="emitChange">
          <option v-for="[value, text] in KIND_OPTIONS" :key="value" :value="value">{{ text }}</option>
        </select>
      </div>

      <!-- Hard surface is the default: planar facets and real creases are what a
           printer can actually reproduce. "Smooth" restores the original fields. -->
      <div :style="row">
        <label :style="lbl">Profile</label>
        <select v-model="form.profile" :style="grow" @input="emitChange" @change="emitChange">
          <option value="facet">Faceted (hard surface)</option>
          <option value="round">Smooth</option>
        </select>
      </div>

      <div :style="row">
        <label :style="lbl">Depth</label>
        <input v-model="form.depth" type="number" step="0.01" :style="num" @input="emitChange" @change="emitChange" />
        <label :style="lbl">Scale</label>
        <input v-model="form.scale" type="number" step="0.01" :style="num" @input="emitChange" @change="emitChange" />
      </div>

      <div v-show="rows.angle" :style="row">
        <label :style="lbl">Angle°</label>
        <input v-model="form.angle" type="number" step="1" :style="num" @input="emitChange" @change="emitChange" />
        <label v-show="rows.sharpness" :style="lbl" :title="sharpLabel.title">{{ sharpLabel.text }}</label>
        <input
          v-show="rows.sharpness" v-model="form.sharpness" type="number" step="0.05" min="0" max="1"
          :style="num" @input="emitChange" @change="emitChange"
        />
      </div>

      <!-- Direction is NOT an angle-kind thing: the sidecar applies it to the
           height field itself (out = h, in = h-1, both = centred), so every kind
           honours it. Gating it behind ANGLE_KINDS left noise/voronoi/image able
           only to GROW the part — changing its dimensions instead of texturing
           the surface it sits on. -->
      <div :style="row">
        <label :style="lbl">Direction</label>
        <select v-model="form.direction" :style="grow" @input="emitChange" @change="emitChange">
          <option value="out">Out (emboss)</option>
          <option value="in">In (deboss)</option>
          <option value="both">Both</option>
        </select>
      </div>

      <div v-show="rows.seed" :style="row">
        <label :style="lbl">Seed</label>
        <input v-model="form.seed" type="number" step="1" :style="num" @input="emitChange" @change="emitChange" />
        <button :style="smallBtn" @click="randomize"><Icon name="dice" :size="13" /> Randomize</button>
      </div>

      <div v-show="rows.image" :style="row">
        <button :style="smallBtn" @click="browse">Browse…</button>
        <span :style="pathLabel">{{ form.imagePath ? basename(form.imagePath) : "No file chosen" }}</span>
      </div>
      <div v-show="rows.image" :style="row">
        <label :style="lbl">Invert</label>
        <input v-model="form.invert" type="checkbox" @input="emitChange" @change="emitChange" />
      </div>

      <!-- Inlay colour: which palette slot the textured faces print in
           (two-tone). Only shown when the caller passed a palette, i.e. in a
           document that has bodies. -->
      <div v-show="req.palette.length" :style="row">
        <label :style="lbl">Print color</label>
        <select v-model="form.colorSlot" :style="grow" @input="emitChange" @change="emitChange">
          <option value="">Body color</option>
          <option v-for="(s, i) in req.palette" :key="i" :value="String(i)">{{ s.name }} (slot {{ i + 1 }})</option>
        </select>
      </div>

      <details>
        <summary :style="summaryStyle">Advanced</summary>
        <div
          :style="offsetRow"
          title="Edge blend: mm the pattern fades over at a face boundary. 0 = a clean machined cut-off."
        >
          <label :style="lbl">Offset</label>
          <input v-model="form.offset" type="number" step="0.01" :style="num" @input="emitChange" @change="emitChange" />
          <label :style="lbl">Edge blend</label>
          <input v-model="form.edgeBlend" type="number" step="0.05" min="0" :style="num" @input="emitChange" @change="emitChange" />
        </div>
      </details>

      <div :style="note">Preview is real geometry at display resolution, exports keep full detail.</div>

      <div :style="btnRow">
        <button :style="okBtn" @pointerdown.prevent.stop="panels.commitTexture(toTextureValues(form))">
          <Icon name="check" :size="13" /> {{ req.editing ? "Apply" : "Add" }}
        </button>
        <button :style="noBtn" @pointerdown.prevent.stop="panels.cancelTexture()"><Icon name="close" :size="13" /> Cancel</button>
      </div>
    </div>
  </Teleport>
</template>
