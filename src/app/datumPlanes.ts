import { SketchPlane } from "../sketch/plane";
import type { Engine } from "./engine";
import type { Feature } from "../types";

export function createDatumPlanes(e: Engine): Pick<Engine, "datumPlaneDef" | "syncDatumPlanes"> {
  /** A datum plane's world placement (source spec + offset along its normal) as a
   *  PlaneDef — lets "Sketch on plane" / "Offset plane" work straight off the quad. */
  const datumPlaneDef = (f: Extract<Feature, { type: "datumPlane" }>) => {
    const sp = new SketchPlane(f.plane);
    const off = f.offset ?? 0;
    return {
      origin: [sp.origin.x + sp.n.x * off, sp.origin.y + sp.n.y * off, sp.origin.z + sp.n.z * off],
      normal: [sp.n.x, sp.n.y, sp.n.z],
      xdir: [sp.u.x, sp.u.y, sp.u.z],
    } as ReturnType<Engine["datumPlaneDef"]>;
  };

  // reflect the document's datum/construction planes as selectable quads in 3D.
  // Resolved client-side (source plane + offset along its normal) so no rebuild is
  // needed just to move/show a plane.
  const syncDatumPlanes = () => {
    const planes = e.store.document.features
      .filter((f): f is Extract<Feature, { type: "datumPlane" }> => f.type === "datumPlane")
      .filter((f) => e.store.isPlaneVisible(f.id)) // hidden planes: not drawn, not pickable
      .map((f) => {
        const def = datumPlaneDef(f); // one formula for quad, sketch and offset targets
        return { id: f.id, origin: def.origin, normal: def.normal };
      });
    e.viewport.setDatumPlanes(planes);
    e.viewport.highlightDatum(e.selectedFeature);
  };

  return { datumPlaneDef, syncDatumPlanes };
}
