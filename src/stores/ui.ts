import { defineStore } from "pinia";
import { ref } from "vue";

/** Chrome state that used to live as imperative writes to element ids in
 *  index.html — `statusEl.textContent`, `docnameEl.classList.toggle("dirty")`,
 *  `projBtn.textContent`, `selBtn.classList.toggle("active")` and so on.
 *
 *  Everything here is a primitive. Nothing from the document, the build result
 *  or Three.js may be put in a Pinia store: Pinia deep-reactive()s its state,
 *  and a Proxy inside the document breaks structuredClone in the undo snapshot
 *  (store.ts:434) and the reference-identity checks the delta wire protocol
 *  relies on (store.ts:625-636). */
export const useUiStore = defineStore("ui", () => {
  // --- status pill (right of the titlebar) ---
  const statusText = ref("connecting…");
  const statusClass = ref<"" | "connected" | "error">("");
  function setStatus(text: string, cls: "" | "connected" | "error") {
    statusText.value = text;
    statusClass.value = cls;
  }

  // --- document name + dirty marker ---
  const docName = ref("Untitled");
  const dirty = ref(false);

  // --- undo/redo button enablement ---
  const canUndo = ref(false);
  const canRedo = ref(false);

  // --- SOLID / SKETCH context tab ---
  const sketchActive = ref(false);

  // --- view-control pill labels ---
  // Projection cycles Auto -> Persp -> Ortho; the label is the CURRENT mode.
  const projLabel = ref("Auto");
  const selMode = ref<"faces" | "bodies">("faces");

  // --- the `?` keyboard cheat sheet ---
  const shortcutHudOpen = ref(false);

  return {
    statusText, statusClass, setStatus,
    docName, dirty,
    canUndo, canRedo,
    sketchActive,
    projLabel, selMode,
    shortcutHudOpen,
  };
});
