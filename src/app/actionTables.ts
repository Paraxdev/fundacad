import type { SketchTool } from "../sketch/sketchMode";

/** Ribbon/keymap actions that create sketch geometry. Inside a sketch they
 *  switch the active tool; outside one they start a sketch with that tool. */
export const SKETCH_TOOLS = new Set([
  "line", "rectangle", "centerRectangle", "circle", "circle2", "circle3",
  "arc", "polygon", "slot", "spline", "point", "text", "project",
  "boltCircle", "hexHoles", "gridHoles", "patternRect", "patternCircular", "honeycomb",
]);

/** Sketch MODIFY tools (ribbon action -> sketch tool name). Only meaningful
 *  inside a sketch. */
export const SKETCH_MODIFY: Record<string, SketchTool> = {
  trim: "trim",
  "fillet-sketch": "fillet",
  "chamfer-sketch": "chamfer",
  offset: "offset",
  extend: "extend",
  break: "break",
  "mirror-sketch": "mirror",
  "move-sketch": "move",
  "copy-sketch": "copy",
  "rotate-sketch": "rotate",
  "scale-sketch": "scale",
  dimension: "dimension",
  horizontal: "horizontal",
  vertical: "vertical",
  parallel: "parallel",
  perpendicular: "perpendicular",
  equal: "equal",
  tangent: "tangent",
  coincident: "coincident",
  concentric: "concentric",
  midpoint: "midpoint",
  collinear: "collinear",
  symmetric: "symmetric",
  fix: "fix",
};

/** "Repeat <last command>" (Onshape-style): the empty-space menu re-runs the last
 *  real command. Navigation / view / file actions aren't commands you repeat, so
 *  they don't overwrite it. */
export const NON_REPEATABLE = new Set([
  "new", "open", "save", "saveas", "export", "import",
  "print-export", "print-orca", "print-send", "welcome", "ta-publish",
  "undo", "redo", "compute-all", "shortcut-help", "finish", "palette",
  "fit", "iso", "top", "front", "right", "persp",
  "selmode", "selmode-faces", "selmode-bodies",
  "hide-selected", "show-all-bodies",
]);

/** Per-tool instruction line shown in the viewport prompt while sketching. */
export const SKETCH_PROMPTS: Record<string, string> = {
  select: "Pick a tool: Line (L) · Rectangle (R) · Circle (C) · Arc (A) · Trim (T)",
  line: "Line: click points · type length + Tab + angle · Enter to commit · click the start to close · Esc",
  rectangle: "Rectangle: click two corners · type W, Tab, H · Enter · Esc",
  circle: "Circle: click center, then radius · type ⌀ · Enter · Esc",
  arc: "Arc: click start, click end, then click a point it passes through · Esc",
  spline: "Spline: click to place fit points · click the last point or press Enter to finish · Esc to cancel",
  point: "Point: click to place a reference point (snaps + constrains) · Esc",
  polygon: "Polygon: click the center, then a vertex (6-sided, inscribed) · Esc",
  slot: "Slot: click the two arc centers, then a point for the width · Esc",
  circle2: "Circle (2-point): click two points on the diameter · Esc",
  circle3: "Circle (3-point): click three points the circle passes through · Esc",
  centerRectangle: "Center Rectangle: click the center, then a corner · Esc",
  mirror: "Mirror: with entities selected, click a line to mirror across · Esc",
  dimension: "Dimension: click a line (length) or circle (⌀), type a value + Enter · Esc",
  trim: "Trim: click a curve (line/arc/circle) to remove it up to the nearest crossings · Esc",
  fillet: "Fillet: click two lines, then type a radius + Enter · Esc",
  chamfer: "Chamfer: click two lines, then type a setback distance + Enter · Esc",
  offset: "Offset: click a curve, then type an offset distance + Enter · Esc",
  extend: "Extend: click a line or arc near an end to lengthen it to the nearest crossing · Esc",
  break: "Break: click a line or arc to split it (a circle opens into an arc) · Esc",
  move: "Move: select entities first, then click a base point and a destination · Esc",
  copy: "Copy: select entities, then click a base point and a destination (originals kept) · Esc",
  rotate: "Rotate: select entities, click a center, then type an angle + Enter · Esc",
  scale: "Scale: select entities, click a base point, then type a factor + Enter · Esc",
  horizontal: "Horizontal: click a line to make it horizontal · Esc",
  vertical: "Vertical: click a line to make it vertical · Esc",
  parallel: "Parallel: click two lines to make the 2nd parallel to the 1st · Esc",
  perpendicular: "Perpendicular: click two lines · Esc",
  equal: "Equal: click two lines (equal length) or two circles/arcs (equal radius) · Esc",
  tangent: "Tangent: click two curves (line, circle or arc) to make them tangent · Esc",
  coincident: "Coincident: click two endpoints to make them coincide · Esc",
  concentric: "Concentric: click two circles/arcs to share a center · Esc",
  midpoint: "Midpoint: click a point/endpoint, then a line — the point sits at its midpoint · Esc",
  collinear: "Collinear: click two lines to put them on the same axis · Esc",
  symmetric: "Symmetric: click two endpoints, then the symmetry axis line · Esc",
  fix: "Fix: click a point, endpoint or circle/arc center to lock it in place · Esc",
};
