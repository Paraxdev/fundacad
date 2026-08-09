import { solveSketch } from "../sketch/solver";
import { isChoiceOpen, choose } from "../ui/choice";
import { toast } from "../ui/toast";
import type { Engine } from "./engine";

/** Debug handles for console + headless frontend-logic tests. Gated to DEV so
 *  they're absent from production bundles — a post-XSS attacker shouldn't be
 *  handed the live store/geometry API for free (the vite dev server is DEV, so
 *  the localhost:5173 test workflow keeps them).
 *
 *  The e2e scripts in e2e/*.cjs drive the app entirely through these, so the
 *  names here are a contract: `store`, `tree`, `viewport` and `geometry` are all
 *  waited on by `page.waitForFunction` before any test step runs. */
export function installDevGlobals(e: Engine): void {
  if (!import.meta.env.DEV) return;
  const w = window as any;
  w.viewport = e.viewport;
  w.store = e.store;
  w.geometry = e.geometry;
  w.sketch = e.sketch;
  w.overlay = e.overlay;
  w.extrude = e.tools.extrude;
  w.edgeFeature = e.tools.edgeFeature;
  w.pressPull = e.tools.pressPull;
  w.textureTool = e.tools.texture;
  w.solveSketch = solveSketch;
  w.tree = e.ui.tree;
  // DEV-only handle for driving the app from outside (demo capture, e2e).
  w.__sindri = {
    store: e.store,
    viewport: e.viewport,
    sketch: e.sketch,
    handleAction: (a: string) => e.handleAction(a),
    extrude: e.tools.extrude,
    overlay: e.overlay,
    toolBusy: () => e.toolBusy(),
    // Direct handles on the two global overlay facades, so a harness can drive
    // them without needing an operation that happens to raise one.
    toast,
    choose,
    busyWhy: () => ({
      sketch: e.sketch.active,
      extrude: e.tools.extrude.active,
      edgeFeature: e.tools.edgeFeature.active,
      pressPull: e.tools.pressPull.active,
      faceOffset: e.tools.faceOffset.active,
      loft: e.tools.loft.active,
      planeOffset: e.tools.planeOffset.active,
      move: e.tools.move.active,
      measure: e.tools.measure.active,
      section: e.tools.section.active,
      texture: e.tools.texture.active,
      planePick: e.planePick,
      choice: isChoiceOpen(),
    }),
  };
}
