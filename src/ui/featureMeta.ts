// Display metadata for feature types (icon name + label), shared by the timeline,
// browser tree, and toolbar.
//
// `icon` is a name in the icon registry (ui/icons.ts), not a character. It used
// to be a Unicode glyph, which cost nothing to write and everything to look at:
// the marks came from four different Unicode blocks, so they rendered at four
// different weights and baselines out of whatever fallback font the platform
// happened to reach for, and a few (Clean Up, Remove Body) were emoji that the
// OS drew in full colour in the middle of a monochrome timeline. A name into a
// hand-drawn 24×24 set is the same amount of typing and renders identically on
// every machine.
import type { FeatureType } from "../types";

export const FEATURE_META: Record<FeatureType, { icon: string; label: string }> = {
  sketch: { icon: "sketch", label: "Sketch" },
  extrude: { icon: "extrude", label: "Extrude" },
  fillet: { icon: "fillet", label: "Fillet" },
  chamfer: { icon: "chamfer", label: "Chamfer" },
  "press-pull": { icon: "presspull", label: "Press/Pull" },
  deleteFace: { icon: "deleteFace", label: "Delete Face" },
  mirror: { icon: "mirror", label: "Mirror" },
  revolve: { icon: "revolve", label: "Revolve" },
  loft: { icon: "loft", label: "Loft" },
  sweep: { icon: "sweep", label: "Sweep" },
  datumPlane: { icon: "datumPlane", label: "Datum Plane" },
  import: { icon: "import", label: "Import" },
  split: { icon: "split", label: "Split Body" },
  combine: { icon: "combine", label: "Combine" },
  box: { icon: "box", label: "Box" },
  cylinder: { icon: "cylinder", label: "Cylinder" },
  sphere: { icon: "sphere", label: "Sphere" },
  shell: { icon: "shell", label: "Shell" },
  offsetFace: { icon: "offsetFace", label: "Offset Face" },
  thicken: { icon: "thicken", label: "Thicken" },
  draft: { icon: "draft", label: "Draft" },
  patternRect: { icon: "patternRect", label: "Rect Pattern" },
  patternCircular: { icon: "patternCircular", label: "Circular Pattern" },
  simplifyMesh: { icon: "simplifyMesh", label: "Simplify Mesh" },
  cleanUp: { icon: "cleanUp", label: "Clean Up" },
  scale: { icon: "scale", label: "Scale" },
  move: { icon: "move", label: "Move" },
  removeBody: { icon: "removeBody", label: "Remove Body" },
  texture: { icon: "texture", label: "Texture" },
};
