import { defineStore } from "pinia";
import { markRaw, ref, shallowRef } from "vue";
import type { TextValues } from "../sketch/textForm";
import type { ProjectFilter } from "../sketch/projectPanel";
import type { TextureMode, TextureValues } from "../features/textureForm";
import type { MeasureRow } from "../features/measureRows";

/** The four floating overlays a TOOL owns while it is running: the sketch Text
 *  panel, the sketch Project filter chips, the docked Texture panel and the
 *  Measure readout. All four teleport to body, all four are opened and closed by
 *  imperative tool code through a facade whose signature did not change.
 *
 *  Independent fields rather than one discriminant, matching panels.ts: they
 *  belong to different tools and nothing here arbitrates between tools —
 *  toolBusy() does, and it stays a plain function.
 *
 *  markRaw on every request: each carries onCommit/onCancel/onChange closures
 *  over the tool instance, which closes over the Viewport and the DocumentStore.
 *  None of that may become a Proxy. */

export interface TextReq {
  /** bumped per show() so the component remounts with fresh form state */
  id: number;
  screen: { x: number; y: number };
  fonts: string[];
  initial: Partial<TextValues>;
  onCommit: (v: TextValues) => void;
  onCancel: () => void;
  onChange: (v: TextValues) => void;
}

export interface TextureReq {
  id: number;
  editing: boolean;
  initial: Partial<TextureValues>;
  palette: { name: string; color: string }[];
  onCommit: (v: TextureValues) => void;
  onCancel: () => void;
  onChange: (v: TextureValues) => void;
  onModeChange: (mode: TextureMode) => void;
}

export const useToolPanelStore = defineStore("toolPanels", () => {
  let nextId = 1;

  // --- sketch Text tool ---------------------------------------------------
  const text = shallowRef<TextReq | null>(null);

  function openText(req: Omit<TextReq, "id">) {
    text.value = markRaw({ ...req, id: nextId++ });
  }

  /** Commit, with the class's exact ordering: read the callback, tear the panel
   *  down, THEN call it — an onCommit that reopens the panel must not be undone
   *  by our own hide. Empty text is dropped rather than committed. */
  function commitText(v: TextValues) {
    const cb = text.value?.onCommit;
    text.value = null;
    if (v.text.trim()) cb?.(v);
  }

  function cancelText() {
    const cb = text.value?.onCancel;
    text.value = null;
    cb?.();
  }

  // --- sketch Project tool ------------------------------------------------
  /** Survives hide/show: the chosen filter is tool state, not panel state. */
  const projectFilter = ref<ProjectFilter>("edges");
  /** The canvas rect the chips centre themselves over, or null when hidden. */
  const projectAnchor = shallowRef<DOMRect | null>(null);
  const projectChange = shallowRef<((f: ProjectFilter) => void) | null>(null);

  // --- printed Texture tool -----------------------------------------------
  const texture = shallowRef<TextureReq | null>(null);
  /** Live selection summary, rewritten on every rAF tick of the tool. Separate
   *  from the request so refreshing it cannot re-render the form and steal focus
   *  from a field being typed into. */
  const textureSummary = ref("");
  const textureMode = ref<TextureMode>("faces");

  function openTexture(req: Omit<TextureReq, "id">) {
    texture.value = markRaw({ ...req, id: nextId++ });
  }

  /** Deliberately does NOT close the panel. The tool REFUSES a commit with no
   *  target and leaves itself active — closing first stranded the user in an
   *  invisible modal: the panel was gone, the tool still owned face-picking, and
   *  toolBusy() blocked every other Esc handler. The tool's own cleanup() closes
   *  it once the commit is actually accepted. */
  function commitTexture(v: TextureValues) {
    texture.value?.onCommit(v);
  }

  function cancelTexture() {
    const cb = texture.value?.onCancel;
    texture.value = null;
    cb?.();
  }

  // --- Measure (Inspect) readout ------------------------------------------
  /** null = the tool is not running; [] would be an empty panel. */
  const measure = shallowRef<readonly MeasureRow[] | null>(null);

  return {
    text, openText, commitText, cancelText,
    projectFilter, projectAnchor, projectChange,
    texture, textureSummary, textureMode, openTexture, commitTexture, cancelTexture,
    measure,
  };
});
