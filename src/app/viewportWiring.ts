import { setPrompt } from "../ui/prompt";
import { dismissContextMenu } from "../ui/menu";
import { useBrowserStore } from "../stores/browser";
import { edgeNudgePlacement } from "../features/edgeNudge";
import { faceNudgePlacement } from "../features/faceNudge";
import type { Engine } from "./engine";

/** Viewport callbacks and the two Escape listeners that clear its selections.
 *
 *  The Viewport publishes through public callback FIELDS rather than events, so
 *  each of these is a single-slot assignment — last writer wins, and there is
 *  exactly one writer for each. */
export function installViewportWiring(e: Engine): void {
  // clicking a construction plane in the viewport selects it (so it can be cut by)
  e.viewport.onPickDatum = (id) => e.selectFeature(id);

  e.viewport.onHit = (hit) => {
    if (e.toolBusy()) return;
    // No prompt here any more: onSelectionChange fires straight after this and
    // owns the face line, now that a face selection offers a handle rather than
    // a list of commands to go and find.
    if (hit?.kind === "face") {
      const owner = e.featureForFace(hit.faceId);
      if (owner) e.selectFeature(owner); // show which feature this face came from
    }
  };

  // -------------------------------------------------------------------------
  // Viewport right-click: context-aware menus — one provider per target (datum
  // plane / edge / face / whole body / empty space), all on the shared engine in
  // ui/menu.ts. The viewport owns the click-vs-pan gesture (right button is
  // camera pan) and fires onContextClick only for a genuine click; toolBusy
  // gates it — an active tool (or sketch mode, which has its own canvas menu)
  // owns the gesture.
  // -------------------------------------------------------------------------
  e.viewport.shouldOpenContextMenu = () => !e.toolBusy();
  e.viewport.onContextClick = (x, y) => e.menus.openCanvasMenu(x, y);

  // A context menu holds targets captured at open time (faceId, edge line, body
  // id) — a completed rebuild renumbers topology and replaces the mesh, and any
  // document change can invalidate the owning feature. Dismiss rather than let a
  // click act on stale targets ("Delete face" healing the WRONG face).
  e.store.onDocChange(() => dismissContextMenu());
  e.store.onBuild((s) => {
    if (s.result && !s.building) dismissContextMenu();
  });

  // SOLID-mode direct selection of a visible sketch's profile AREAS (MCAD-style):
  // click a shown sketch's cell to (pre)select it, then Extrude (E) uses it. Only
  // fires when a sketch is visible (overlay.regions is empty otherwise), so normal
  // face/body picking is untouched the rest of the time.
  e.viewport.regionHoverAt = (x, y) => {
    if (e.sketch.active || e.toolBusy()) { e.overlay.setHoverRegion(null); return false; }
    const wr = e.overlay.committedRegionAtRay(e.viewport.rayFrom(x, y).ray);
    e.overlay.setHoverRegion(wr);
    return !!wr;
  };
  e.viewport.regionPickAt = (x, y, additive) => {
    if (e.sketch.active || e.toolBusy()) return false;
    const wr = e.overlay.committedRegionAtRay(e.viewport.rayFrom(x, y).ray);
    if (!wr) return false;
    e.overlay.toggleRegionSelection(wr, additive);
    const n = e.overlay.selectedRegions().length;
    setPrompt(n ? `${n} profile area${n > 1 ? "s" : ""} selected — Extrude (E) · Ctrl-click adds · Esc clears` : null);
    return true;
  };
  // Esc clears a pre-selected profile-area selection (when not in a tool/sketch)
  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !e.toolBusy() && !e.sketch.active && e.overlay.selectedRegions().length) {
      e.overlay.clearRegionSelection();
      setPrompt(null);
    }
  });

  // The Viewport owns the body selection and is not reactive, so mirror it into
  // the browser store on every change. That is also what killed the tree's old
  // `isBodySelected(id)` predicate, which allocated a fresh array and scanned it
  // once PER BODY on every doc change and every build.
  const browser = useBrowserStore();
  browser.setSelectedBodies(e.viewport.getSelectedBodies());
  e.viewport.onBodySelectionChange = () => {
    browser.setSelectedBodies(e.viewport.getSelectedBodies());
    if (e.toolBusy()) return;
    const n = e.viewport.getSelectedBodies().length;
    setPrompt(n ? `${n} bod${n > 1 ? "ies" : "y"} selected — Move (M) to drag · Esc to clear` : null);
  };
  // Esc clears the body selection while in Bodies mode
  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && e.viewport.selecting === "bodies" && !e.toolBusy() && e.viewport.getSelectedBodies().length) {
      e.viewport.setSelectedBodies([]);
    }
  });

  // --- sketch overlays follow the document (when not actively sketching) ---
  e.store.onDocChange(() => {
    if (!e.sketch.active) e.overlay.update(e.store.document);
  });

  // --- selecting offers the drag handle straight away -----------------------
  // The old behaviour was a prompt line and nothing else: the entity lit up,
  // and you were expected to know that Fillet, Chamfer or Press/Pull would
  // consume it. The handle puts the offer where the geometry is; the prompt now
  // explains the handle rather than substituting for it.
  //
  // Edges outrank faces when a Ctrl-click has managed to select both, matching
  // the picker's own precedence — an edge hit is the more specific answer, so
  // it is the one the user most likely meant to act on.
  e.viewport.onSelectionChange = () => {
    const edges = e.viewport.selectedEdgeLines();
    const faces = edges.length ? null : e.viewport.selectedFacesForPressPull();
    e.nudge.show(
      edges.length
        ? edgeNudgePlacement(edges, (x, y, tangent) => e.starters.grabEdgeHandle(x, y, tangent))
        : faceNudgePlacement(faces, (x, y) => e.starters.grabFaceHandle(x, y)),
    );
    if (e.toolBusy()) return;
    if (edges.length) {
      const n = edges.length;
      setPrompt(
        `${n} edge${n > 1 ? "s" : ""} selected — drag the arrow to round it off (Tab switches to a chamfer) · Esc to clear`,
      );
      return;
    }
    const n = faces?.faceIds.length ?? 0;
    setPrompt(
      n
        ? `${n} face${n > 1 ? "s" : ""} selected — drag the arrow to push or pull (out adds, in cuts) · ` +
            `Del removes it and heals · Esc to clear`
        : null,
    );
  };

  // A rebuild used to be the end of the handle: setModel built a fresh
  // Highlighter, the edge selection went with it, and the only safe response
  // was to drop the handle rather than let it act on a stale anchor. Cancelling
  // a fillet therefore left you looking at the sharp edge you started from with
  // nothing selected and no arrow — the preview's OWN rebuild had eaten the
  // selection the gesture was standing on.
  //
  // setModel now carries the selection across (viewport.ts captureSelection /
  // restoreSelection) and fires onSelectionChange either way, so the handler
  // above already re-places the handle on the rebuilt edge, or hides it when
  // the edge genuinely did not survive. Nothing to do here.
}
