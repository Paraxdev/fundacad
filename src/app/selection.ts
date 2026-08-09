import { setPrompt } from "../ui/prompt";
import { useSelectionStore } from "../stores/selection";
import type { Engine } from "./engine";
import type { Feature } from "../types";

export function createSelection(
  e: Engine,
): Pick<Engine, "selectFeature" | "editFeature" | "featureForFace" | "deleteSelectedFace"> {
  const selectFeature = (id: string | null) => {
    // Writing the store is what updates the inspector — it renders from this
    // rather than being pushed at. The timeline and tree are still imperative
    // classes, so they keep their explicit select() calls until converted.
    useSelectionStore().featureId = id;
    e.ui.timeline?.select(id);
    e.ui.tree?.select(id);
    e.viewport.highlightDatum(id); // brighten the matching construction plane (if any)
  };

  // Click a model FACE → select the feature that created it, so Del deletes that
  // feature (and the timeline/params show which one owns the face). Provenance is the
  // per-face `faceOwners` the sidecar attaches to each body in the build result.
  const featureForFace = (faceId: number): string | null => {
    for (const b of e.store.buildState.result?.bodies ?? []) {
      if (faceId >= b.faceStart && faceId < b.faceStart + b.faceCount) {
        return b.faceOwners?.[faceId - b.faceStart] ?? null;
      }
    }
    return null;
  };

  // Remove the currently-selected face(s) and heal the solid (defeature). Returns
  // false when no face is selected (so the caller can fall back to feature-delete).
  const deleteSelectedFace = (): boolean => {
    const fsel = e.viewport.selectedFacesForPressPull();
    if (!fsel) return false;
    e.store.addFeature({
      id: e.store.nextId(),
      type: "deleteFace",
      face: fsel.selectors.length === 1 ? fsel.selectors[0] : fsel.selectors,
      ...(fsel.bodyId ? { body: fsel.bodyId } : {}),
    } as Feature);
    e.viewport.clearSelection();
    e.setStatus("Deleting face…", ""); // real outcome (healed, or an error) comes from the rebuild
    setPrompt(null);
    return true;
  };

  const editFeature = (id: string) => {
    selectFeature(id);
    if (e.toolBusy()) return; // never open a second interactive tool on top of one
    const f = e.store.document.features.find((x) => x.id === id);
    if (!f) return;
    if (e.store.isSuppressed(id)) {
      e.setStatus("Unsuppress the feature to edit it", "");
      return;
    }
    const idx = e.store.document.features.findIndex((x) => x.id === id);
    if (idx >= e.store.rollbackIndex) {
      e.setStatus("Roll the timeline forward to edit this feature", "");
      return;
    }
    const done = (cid: string | null) => {
      e.noteCommitted(cid);
      if (cid) selectFeature(cid);
    };
    switch (f.type) {
      case "sketch":
        e.sketch.enter(f.plane, e.store, id);
        break;
      case "fillet":
      case "chamfer":
        // false = not tool-editable (parameter value / structural selectors) —
        // the inspector is already focused via selectFeature above.
        if (!e.tools.edgeFeature.startEdit(id, done)) e.setStatus("Edit the value in the inspector (right panel)", "");
        break;
      case "extrude":
        if (!e.tools.extrude.startEdit(id, done)) e.setStatus("Edit the value in the inspector (right panel)", "");
        break;
      case "texture":
        if (!e.tools.texture.startEdit(id, done)) e.setStatus("Edit the value in the inspector (right panel)", "");
        break;
      default:
        break; // inspector focus (selectFeature above) is the edit surface for the rest
    }
  };

  return { selectFeature, editFeature, featureForFace, deleteSelectedFace };
}
