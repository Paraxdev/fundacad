import { defineStore } from "pinia";
import { markRaw, ref } from "vue";

export interface CtxItem {
  label: string;
  onClick?: () => void; // omit for separators / pure submenu parents
  disabled?: boolean;
  separator?: boolean; // renders a divider; other fields ignored
  shortcut?: string | undefined; // right-aligned key hint, e.g. "Q" (undefined = no hint from keyHint)
  danger?: boolean; // destructive action (red)
  swatch?: string; // small color chip before the label (palette flyouts)
  children?: CtxItem[]; // one-level flyout submenu, opens on hover
}

/** The one shared right-click menu — viewport, timeline, browser tree, sketch
 *  mode and the ViewCube all pop it. At most one is open at a time, which is
 *  what the old module-level `activeClose` singleton enforced. */
export const useContextMenuStore = defineStore("contextMenu", () => {
  const open = ref(false);
  const x = ref(0);
  const y = ref(0);
  const items = ref<CtxItem[]>([]);
  /** Bumped on every open() so the host can re-run its position measurement
   *  even when a menu is popped at the same coordinates twice in a row. */
  const epoch = ref(0);

  function show(px: number, py: number, list: CtxItem[]) {
    // markRaw: every item carries an onClick closure over raw engine objects
    // (features, body ids, Three.js selectors). Proxying the tree per open would
    // be pure waste, and a Feature riding along inside one would be a hazard.
    items.value = markRaw(list);
    x.value = px;
    y.value = py;
    open.value = true;
    epoch.value++;
  }

  function close() {
    open.value = false;
    items.value = [];
  }

  return { open, x, y, items, epoch, show, close };
});
