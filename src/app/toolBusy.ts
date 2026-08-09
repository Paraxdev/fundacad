import { isChoiceOpen } from "../ui/choice";
import type { Engine } from "./engine";

/** Guard predicates checked at the top of every start* tool + interactive
 *  helper: they can't fire mid-sketch / mid-drag.
 *
 *  Deliberately plain functions rather than reactive state. `toolBusy` is only
 *  ever read at event time (inside a start*, a viewport callback, a keydown) —
 *  nothing in the UI is *disabled* by it. Making it reactive would mean either
 *  polling eleven `.active` fields on plain class instances every frame, or
 *  bolting change-notification onto ten tool classes, for no present gain. */
export function createToolBusy(e: Engine): Pick<Engine, "toolBusy" | "hasBody"> {
  return {
    toolBusy: () => {
      const t = e.tools;
      return (
        e.sketch.active || t.extrude.active || t.edgeFeature.active || t.pressPull.active ||
        t.faceOffset.active || t.loft.active || t.planeOffset.active || t.move.active ||
        t.measure.active || t.section.active || t.texture.active || e.planePick || isChoiceOpen()
      );
    },
    // True when the current rebuild produced a solid body (something to modify).
    hasBody: () => (e.store.buildState.result?.mesh.positions.length ?? 0) > 0,
  };
}
