import { installKeymap } from "../input/keymap";
import { isEditableTarget } from "../ui/focus";
import { saveDocument, saveDocumentAs, exportModel } from "../io/files";
import { SKETCH_TOOLS } from "./actionTables";
import { currentPie, dismissPie, openPie } from "../ui/pieMenu";
import { viewPie } from "../ui/viewPie";
import type { Engine } from "./engine";

/** Global keyboard: the MCAD keymap plus the two window-level handlers that
 *  don't go through it (Delete, and the Ctrl-file shortcuts that must work even
 *  mid-sketch). */
export function installKeyboard(e: Engine): void {
  installKeymap(
    (a) => {
      // while sketching, the sketch tool owns its tool keys + Esc/Enter
      if (e.sketch.active && SKETCH_TOOLS.has(a)) return;
      if (a === "escape") {
        const t = e.tools;
        if (!e.sketch.active && !t.extrude.active && !t.edgeFeature.active && !t.pressPull.active && !t.loft.active && !t.planeOffset.active) {
          e.viewport.clearSelection();
          e.selectFeature(null);
        }
        return;
      }
      // everything else — including the once-dead M/Move and T/Trim keys — routes
      // through the same dispatcher the ribbon and command palette use
      e.handleAction(a);
    },
    () => (e.sketch.active ? "sketch" : "model"),
  );

  // delete: a selected FACE → remove it and heal the solid (defeature — works on
  // imported geometry, where there's no feature to delete); otherwise delete the
  // selected timeline feature.
  window.addEventListener("keydown", (ev) => {
    if (isEditableTarget(ev.target)) return; // typing in a field, not a shortcut
    if (e.toolBusy()) return;
    if (ev.key !== "Delete" && ev.key !== "Backspace") return;
    if (e.deleteSelectedFace()) return;
    if (e.selectedFeature) {
      e.store.removeFeature(e.selectedFeature);
      e.selectFeature(null);
    }
  });

  // The orientation wheel, on backquote. Squaring up the view is the most
  // repeated non-modelling action in the app and every existing route to it —
  // the cube's faces, the Look submenu, the palette — asks you to find a target
  // and hit it. A pie asks for a direction instead, which is a wrist movement
  // and needs no aim once it is learned.
  //
  // Backquote rather than a letter because every letter worth having is a tool,
  // and because it is the key this gesture already lives on for anyone who has
  // met a pie menu before. It is deliberately live mid-sketch: looking at the
  // part from somewhere else is not an edit, and refusing it there would make
  // the wheel feel like a mode rather than a camera.
  //
  // Opened at the pointer, so the flick starts where the hand already is. The
  // position is tracked here rather than read from the viewport because the
  // wheel works over the whole window, including the panes.
  let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  window.addEventListener(
    "pointermove",
    (ev) => {
      lastPointer = { x: ev.clientX, y: ev.clientY };
    },
    { passive: true, capture: true },
  );
  window.addEventListener("keydown", (ev) => {
    if (ev.key !== "`" && ev.code !== "Backquote") return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (isEditableTarget(ev.target)) return;
    if (currentPie()) return dismissPie(); // a second press closes it
    ev.preventDefault();
    openPie(viewPie(lastPointer.x, lastPointer.y, e.viewport));
  });

  // file shortcuts (work everywhere, even mid-sketch)
  window.addEventListener("keydown", (ev) => {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    const k = ev.key.toLowerCase();
    if (k === "n") { ev.preventDefault(); void e.newDocument(); }
    else if (k === "o") { ev.preventDefault(); void e.openDoc(); }
    else if (k === "s" && ev.shiftKey) { ev.preventDefault(); void saveDocumentAs(e.store); }
    else if (k === "s") { ev.preventDefault(); void saveDocument(e.store); }
    else if (k === "e") { ev.preventDefault(); void exportModel(e.store, e.geometry); }
  });
}
