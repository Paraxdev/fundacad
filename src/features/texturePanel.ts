// Floating panel for the printed-Texture tool (knurl/hex/waves/ribs/voronoi/
// noise/image heightmap). Unlike TextPanel (cursor-anchored, one text object)
// this is DOCKED top-right: the tool can span a whole body, not one clicked
// point, so there's no natural anchor to follow. Every edit fires onChange for a
// live preview; Add/Apply commits, Cancel cancels.
//
// This is now a FACADE over stores/toolPanels.ts +
// components/overlays/TextureToolPanel.vue. show/hide/setSummary/setMode/
// isActive keep their signatures, and the value shape, the field defaults and
// the conditional-row rules moved to textureForm.ts — pure and tested. The
// re-exports below keep textureTool.ts:15's import bit-identical.

import { useToolPanelStore } from "../stores/toolPanels";
import type { TextureMode, TextureValues } from "./textureForm";

export { ANGLE_KINDS, SEED_KINDS } from "./textureForm";
export type { TextureKind, TextureMode, TextureValues } from "./textureForm";

export class TexturePanel {
  get isActive() {
    return !!useToolPanelStore().texture;
  }

  show(
    opts: {
      editing: boolean;
      mode: TextureMode;
      summary: string;
      initial: Partial<TextureValues>;
      palette?: { name: string; color: string }[];
    },
    handlers: {
      onCommit: (v: TextureValues) => void;
      onCancel: () => void;
      onChange: (v: TextureValues) => void;
      onModeChange: (mode: TextureMode) => void;
    },
  ) {
    const panels = useToolPanelStore();
    panels.textureSummary = opts.summary;
    panels.textureMode = opts.mode;
    // openTexture markRaws the request: all four handlers close over TextureTool,
    // which closes over the Viewport and the DocumentStore.
    panels.openTexture({
      editing: opts.editing,
      initial: opts.initial,
      palette: opts.palette ?? [],
      ...handlers,
    });
  }

  /** Live selection-summary line (rewritten every rAF tick as the ambient
   *  selection changes) — its own store field, not part of the request, so it
   *  never re-renders the form and never steals focus from a field being typed
   *  into. */
  setSummary(text: string) {
    useToolPanelStore().textureSummary = text;
  }

  /** Reflect which mode is active in the toggle buttons (called both from a
   *  button click and when the tool switches mode some other way). */
  setMode(mode: TextureMode) {
    useToolPanelStore().textureMode = mode;
  }

  hide() {
    useToolPanelStore().texture = null;
  }
}
