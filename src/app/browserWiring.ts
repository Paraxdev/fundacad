import type { Engine } from "./engine";
import type { Feature } from "../types";

/** The BrowserTree's ~18 callback fields. The tree pulls display state through
 *  `is*` predicates at render time (visibility, selection) rather than being
 *  handed props, which is why several of these read live viewport state and why
 *  every mutation is followed by an explicit `tree.refresh()`. */
export function installBrowserWiring(e: Engine): void {
  const tree = e.ui.tree;

  tree.onSelect = (id) => e.selectFeature(id);
  tree.onEditSketch = (id) => e.editFeature(id);
  tree.onSketchOnPlane = (plane) => {
    const t = e.tools;
    if (!e.sketch.active && !t.extrude.active && !t.edgeFeature.active && !t.pressPull.active && !t.loft.active && !t.planeOffset.active) {
      // Answering "select a plane" from the Browser instead of the viewport: end
      // the interactive pick, or its planePick flag stays set and toolBusy() is
      // true forever, silently disabling every tool from here on.
      e.starters.cancelPlanePick();
      e.sketch.enter(plane, e.store);
    }
  };

  e.overlay.sketchVisible = (id) => e.isSketchVisible(id);
  tree.isSketchVisible = (id) => e.isSketchVisible(id);
  tree.onToggleSketch = (id) => {
    e.store.setSketchVisibility(id, !e.isSketchVisible(id));
    if (!e.sketch.active) e.overlay.update(e.store.document);
    tree.refresh();
  };

  // per-body show/hide (MCAD-style eye toggle); re-renders without a sidecar rebuild
  tree.isBodyVisible = (id) => e.store.isBodyVisible(id);
  tree.onToggleBody = (id) => {
    e.store.setBodyVisibility(id, !e.store.isBodyVisible(id));
    tree.refresh();
  };

  // per-construction-plane show/hide (eye toggle); re-syncs the datum quads, no rebuild
  tree.isPlaneVisible = (id) => e.store.isPlaneVisible(id);
  tree.onTogglePlane = (id) => {
    e.store.setPlaneVisibility(id, !e.store.isPlaneVisible(id));
    e.syncDatumPlanes();
    tree.refresh();
  };

  // body multi-selection (Bodies select mode) — viewport ↔ tree kept in sync
  tree.isBodySelected = (id) => e.viewport.getSelectedBodies().includes(id);
  // preferred by the tree: one call per render rather than one per body
  tree.selectedBodyIds = () => e.viewport.getSelectedBodies();
  tree.onSelectBody = (id, additive) => {
    const cur = new Set(e.viewport.getSelectedBodies());
    if (additive) cur.has(id) ? cur.delete(id) : cur.add(id);
    else { cur.clear(); cur.add(id); }
    e.viewport.setSelectedBodies([...cur]);
  };
  tree.onCutPlane = (id) => void e.starters.startCutByPlane(id);

  // rename / delete from the browser tree. Sketches & planes are features → patch
  // or remove them; body names are display-only overrides; deleting a body appends
  // a removeBody feature (see store). All paths re-emit and re-render the tree.
  tree.onRenameSketch = (id, name) => e.store.updateFeature(id, { name } as Partial<Feature>);
  tree.onDeleteSketch = (id) => e.store.removeFeature(id);
  tree.onRenamePlane = (id, name) => e.store.updateFeature(id, { name } as Partial<Feature>);
  tree.onDeletePlane = (id) => e.store.removeFeature(id);
  tree.onRenameBody = (id, name) => e.store.setBodyName(id, name);
  tree.onDeleteBody = (id) => e.store.removeBody(id);
}
