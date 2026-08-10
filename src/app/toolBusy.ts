import { isChoiceOpen } from "../ui/choice";
import type { Engine } from "./engine";

/** Guard predicates checked at the top of every start* tool + interactive
 *  helper: they can't fire mid-sketch / mid-drag.
 *
 *  Deliberately plain functions rather than reactive state. `toolBusy` is only
 *  ever read at event time (inside a start*, a viewport callback, a keydown) —
 *  nothing in the UI is *disabled* by it. Making it reactive would mean either
 *  polling eleven `.active` fields on plain class instances every frame, or
 *  bolting change-notification onto ten tool classes, for no present gain.
 *
 *  Cross-section is the one entry that is NOT `.active`. It stopped being a
 *  one-shot and became a MODE you keep working inside — the cut stays while you
 *  orbit, select, and fillet an edge it just exposed — so counting it as busy
 *  made every command in the app return silently for as long as the section was
 *  up (the same dead-app symptom the stale `planePick` flag used to cause, and
 *  just as invisible: no error, nothing happens). Its modal half, `picking`,
 *  waits for the user to click the face to cut along and genuinely does own the
 *  gesture. The section stands its own handle down while another tool runs by
 *  reading this predicate back — see SectionTool's `toolBusy` dep. */
export function createToolBusy(e: Engine): Pick<Engine, "toolBusy" | "hasBody"> {
  return {
    toolBusy: () => {
      const t = e.tools;
      return (
        e.sketch.active || t.extrude.active || t.edgeFeature.active || t.pressPull.active ||
        t.faceOffset.active || t.loft.active || t.planeOffset.active || t.move.active ||
        t.measure.active || t.section.picking || t.texture.active || e.planePick || isChoiceOpen()
      );
    },
    // True when the current rebuild produced a solid body (something to modify).
    hasBody: () => (e.store.buildState.result?.mesh.positions.length ?? 0) > 0,
  };
}
