// Single source of truth for keyboard shortcuts. keymap.ts dispatches from this
// table, commands.ts reads its hint column, and the `?` HUD renders it — so the
// three surfaces can never disagree again (they did: M/T were emitted but never
// dispatched, the palette advertised Fit on "F" while F ran Fillet, and the
// ribbon promised sketch Offset on "O" with no binding behind it).

import { useUiStore } from "../stores/ui";

export interface Shortcut {
  key: string; // normalized lowercase key ("b", "home", "f6", "?")
  shift?: boolean;
  action: string; // action id fed to main's handleAction (or a special-cased id)
  context: "model" | "sketch" | "global";
  label: string;
}

export const SHORTCUTS: Shortcut[] = [
  // --- model context ---
  { key: "s", action: "sketch", context: "model", label: "Sketch" },
  { key: "e", action: "extrude", context: "model", label: "Extrude" },
  { key: "q", action: "presspull", context: "model", label: "Press/Pull" },
  { key: "f", action: "fillet", context: "model", label: "Fillet" },
  { key: "b", action: "chamfer", context: "model", label: "Chamfer (bevel)" },
  { key: "m", action: "move", context: "model", label: "Move" },
  { key: "i", action: "measure", context: "model", label: "Measure" },
  { key: "k", action: "split", context: "model", label: "Split Body" },
  { key: "j", action: "combine", context: "model", label: "Combine (join)" },
  { key: "u", action: "clean-up", context: "model", label: "Clean Up" },
  { key: "o", action: "offset-plane", context: "model", label: "Offset Plane" },
  { key: "h", action: "hide-selected", context: "model", label: "Hide selected bodies" },
  { key: "h", shift: true, action: "show-all-bodies", context: "model", label: "Show all bodies" },
  { key: "1", action: "selmode-faces", context: "model", label: "Select faces" },
  { key: "2", action: "selmode-bodies", context: "model", label: "Select bodies" },
  // --- sketch context ---
  { key: "l", action: "line", context: "sketch", label: "Line" },
  { key: "c", action: "circle", context: "sketch", label: "Circle" },
  { key: "r", action: "rectangle", context: "sketch", label: "Rectangle" },
  { key: "a", action: "arc", context: "sketch", label: "Arc" },
  { key: "d", action: "dimension", context: "sketch", label: "Dimension" },
  { key: "t", action: "trim", context: "sketch", label: "Trim" },
  { key: "o", action: "offset", context: "sketch", label: "Offset" },
  { key: "f", action: "fillet-sketch", context: "sketch", label: "Sketch Fillet" },
  { key: "p", action: "project", context: "sketch", label: "Project" },
  // finish-and-go: E/Q inside a sketch commit it and start the 3D tool
  // (handleAction already finishes an active sketch before any 3D command)
  { key: "e", action: "extrude", context: "sketch", label: "Finish & Extrude" },
  { key: "q", action: "presspull", context: "sketch", label: "Finish & Press/Pull" },
  // sketch-start conveniences from model mode (L/C/R/A/P start a sketch with that tool)
  { key: "l", action: "line", context: "model", label: "Sketch: Line" },
  { key: "c", action: "circle", context: "model", label: "Sketch: Circle" },
  { key: "r", action: "rectangle", context: "model", label: "Sketch: Rectangle" },
  { key: "a", action: "arc", context: "model", label: "Sketch: Arc" },
  { key: "p", action: "project", context: "model", label: "Sketch: Project" },
  // --- global ---
  { key: "home", action: "fit", context: "global", label: "Fit view" },
  { key: "f6", action: "fit", context: "global", label: "Fit view" },
  { key: "?", action: "shortcut-help", context: "global", label: "Shortcut help" },
];

/** first key hint for an action ("Shift+H", "Home"), for menus/palette. */
export function keyHint(action: string): string | undefined {
  const s = SHORTCUTS.find((x) => x.action === action);
  if (!s) return undefined;
  const k = s.key.length === 1 ? s.key.toUpperCase() : s.key.charAt(0).toUpperCase() + s.key.slice(1);
  return s.shift ? `Shift+${k}` : k;
}

/** Resolve a keydown to an action for the current context (sketch keys win
 *  while sketching; model keys otherwise; global always). */
export function resolveShortcut(
  key: string,
  shift: boolean,
  context: "model" | "sketch",
): string | null {
  const k = key.toLowerCase();
  for (const s of SHORTCUTS) {
    if (s.key !== k || !!s.shift !== shift) continue;
    if (s.context === "global" || s.context === context) return s.action;
  }
  return null;
}

// --- the `?` cheat-sheet HUD: auto-generated, dismissed by any key/click ---

/** One rendered section of the HUD. Derived from SHORTCUTS so the cheat sheet
 *  cannot drift from what the dispatcher actually does — the whole point of this
 *  file being the single source of truth. */
export interface HudGroup {
  name: string;
  rows: { key: string; label: string }[];
}

/** Pure: the HUD's content. Exported so it is unit-testable without a DOM. */
export function shortcutHudGroups(): HudGroup[] {
  const fmt = (s: Shortcut) => (s.shift ? `Shift+${s.key.toUpperCase()}` : s.key.toUpperCase());
  const byContext = (ctx: Shortcut["context"]) =>
    SHORTCUTS.filter((s) => s.context === ctx).map((s) => ({ key: fmt(s), label: s.label }));
  return [
    { name: "Model", rows: byContext("model") },
    { name: "Sketch", rows: byContext("sketch") },
    { name: "Global", rows: byContext("global") },
    {
      name: "Always",
      rows: [
        { key: "Ctrl+K", label: "Command palette" },
        { key: "Ctrl+Z / Ctrl+Y", label: "Undo / Redo" },
        { key: "Ctrl+S / Ctrl+Shift+S", label: "Save / Save As" },
        { key: "Ctrl+N / Ctrl+O / Ctrl+E", label: "New / Open / Export" },
        { key: "Del", label: "Delete face (heal) / feature" },
        { key: "Esc", label: "Cancel / clear selection" },
      ],
    },
  ];
}

/** Toggle the HUD. Facade over stores/ui.ts, rendered by
 *  components/overlays/ShortcutHud.vue; the signature is unchanged for its two
 *  callers (the Help menu and the "shortcut-help" action). */
export function toggleShortcutHUD() {
  const ui = useUiStore();
  ui.shortcutHudOpen = !ui.shortcutHudOpen;
}
