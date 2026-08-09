import { defineStore } from "pinia";
import { ref } from "vue";

export type PaletteToggle =
  | "lockView" | "construction" | "reference" | "grid"
  | "snap" | "profile" | "dimensions" | "constraints";

interface ToggleDef {
  key: PaletteToggle;
  label: string;
  default: boolean;
}

export const PALETTE_TOGGLES: ToggleDef[] = [
  { key: "lockView", label: "Lock to Plane", default: true },
  { key: "construction", label: "Construction", default: false },
  { key: "reference", label: "Reference Dim", default: false },
  { key: "grid", label: "Sketch Grid", default: true },
  { key: "snap", label: "Snap", default: true },
  { key: "profile", label: "Show Profile", default: true },
  { key: "dimensions", label: "Show Dimensions", default: true },
  { key: "constraints", label: "Show Constraints", default: true },
];

/** The Sketch Palette (mainstream MCAD's right-docked panel shown while
 *  sketching). Toggle values live here rather than in the component because
 *  they must survive the panel being hidden between sketches, and because
 *  emitAll() replays them into SketchMode on every sketch entry. */
export const useSketchPaletteStore = defineStore("sketchPalette", () => {
  const visible = ref(false);
  const state = ref<Record<PaletteToggle, boolean>>(
    Object.fromEntries(PALETTE_TOGGLES.map((t) => [t.key, t.default])) as Record<PaletteToggle, boolean>,
  );

  /** Assigned by the engine; the component and emitAll() both fire it. */
  let onToggle: ((key: PaletteToggle, value: boolean) => void) | null = null;
  let onLookAt: (() => void) | null = null;
  function bind(handlers: {
    onToggle: (key: PaletteToggle, value: boolean) => void;
    onLookAt: () => void;
  }) {
    onToggle = handlers.onToggle;
    onLookAt = handlers.onLookAt;
  }

  function set(key: PaletteToggle, value: boolean) {
    state.value[key] = value;
    onToggle?.(key, value);
  }
  function lookAt() {
    onLookAt?.();
  }
  /** Push every toggle's current value to the listener (called on sketch entry). */
  function emitAll() {
    for (const t of PALETTE_TOGGLES) onToggle?.(t.key, state.value[t.key]);
  }

  return { visible, state, bind, set, lookAt, emitAll };
});
