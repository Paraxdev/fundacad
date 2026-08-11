// The orientation wheel: eight ways to point the camera, laid out so the direction
// you flick IS the direction you end up looking from. Every other way the app
// offers to square up the view asks you to find a target and click it; here the
// whole gesture is a wrist movement.
//
// The spatial mapping is the point, so it is a rule rather than an accident of
// declaration order: OPPOSITE DIRECTIONS CARRY OPPOSITE VIEWS. North/south are
// Top/Bottom, west/east are Left/Right, north-west/south-east are Front/Back.
// pieMath.SLOT_ORDER puts opposite slots in adjacent index pairs precisely so a
// menu expresses that by declaring the pairs next to each other; viewPie.test.ts
// holds it. Isometric and Fit are not directions, which is why they take the last
// pair rather than displacing an axis that has one to express.
//
// Depends on a two-method shape rather than on Viewport, so it can be inspected
// with no WebGL context.

import type { PieRequest } from "./pieMenu";

/** The camera commands the wheel drives — Viewport implements both. */
export interface ViewPieDeps {
  setStandardView(view: "front" | "back" | "left" | "right" | "top" | "bottom" | "iso"): void;
  fitView(): void;
}

/** The wheel, in slot order. Exported for the test that checks the pairs. */
export function viewPieItems(v: ViewPieDeps): PieRequest["items"] {
  return [
    // W / E — the two side views, on the axis a hand moves along most cheaply.
    { label: "Left", onPick: () => v.setStandardView("left") },
    { label: "Right", onPick: () => v.setStandardView("right") },
    // S / N — down and up. Flick up to look down: the direction is where the
    // CAMERA goes, which is the reading that survives being done without
    // looking (you throw the cursor at the sky, you get the plan view).
    { label: "Bottom", onPick: () => v.setStandardView("bottom") },
    { label: "Top", onPick: () => v.setStandardView("top") },
    // NW / SE — front and back, the remaining opposite pair.
    { label: "Front", onPick: () => v.setStandardView("front") },
    { label: "Back", onPick: () => v.setStandardView("back") },
    // NE / SW — the two that are not directions at all, which is why they take
    // the pair of slots left over rather than displacing an axis.
    { label: "Isometric", onPick: () => v.setStandardView("iso") },
    { label: "Fit", onPick: () => v.fitView() },
  ];
}

/** The request to hand to openPie(). */
export function viewPie(x: number, y: number, v: ViewPieDeps): PieRequest {
  return { id: "view", title: "Look", x, y, items: viewPieItems(v) };
}
