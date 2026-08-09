// The ribbon's content: which tools exist, how they group, and how the groups
// collapse when the window narrows. Pure data + one helper, kept apart from the
// component so ui/commands.ts can build the command list from the same tables
// without pulling in a Vue component.

export type RibbonContext = "model" | "sketch";

interface ToolItem {
  action: string;
  label: string;
  iconName: string;
  key?: string;
  kind?: "finish" | "toggle";
}
// Split button: the FULL dropdown list lives in `children` (children[0] is the
// initial one-click primary; `label` names the family for the arrow tooltip).
// Picking a child runs it and makes it the primary — last-used-wins, mainstream MCAD
// convention. Each tool is defined exactly once, in `children`.
interface SplitItem {
  label: string;
  children: ToolItem[];
}
type Item = ToolItem | SplitItem;
interface Group {
  label: string;
  items: Item[];
}
export type { Item, ToolItem, Group };

/** a split button's tools, or the item itself — every consumer that needs the
 *  flat tool list (palette, overflow popup) goes through this. */
export function leavesOf(it: Item): ToolItem[] {
  return "children" in it ? it.children : [it];
}

export const MODEL: Group[] = [
  {
    label: "CREATE",
    items: [
      { action: "sketch", label: "Sketch", iconName: "sketch", key: "S" },
      { action: "extrude", label: "Extrude", iconName: "extrude", key: "E" },
      { action: "primitive", label: "Primitive", iconName: "primitive" },
      {
        label: "Revolve",
        children: [
          { action: "revolve", label: "Revolve", iconName: "revolve" },
          { action: "loft", label: "Loft", iconName: "loft" },
          { action: "sweep", label: "Sweep", iconName: "sweep" },
        ],
      },
    ],
  },
  {
    label: "MODIFY",
    items: [
      { action: "presspull", label: "Press/Pull", iconName: "presspull", key: "Q" },
      { action: "fillet", label: "Fillet", iconName: "fillet", key: "F" },
      { action: "chamfer", label: "Chamfer", iconName: "chamfer", key: "B" },
      {
        label: "Move",
        children: [
          { action: "move", label: "Move", iconName: "move", key: "M" },
          { action: "scale", label: "Scale", iconName: "scale" },
          { action: "mirror", label: "Mirror", iconName: "mirror" },
          { action: "pattern", label: "Pattern", iconName: "pattern" },
        ],
      },
      {
        label: "Combine",
        children: [
          { action: "combine", label: "Combine", iconName: "combine", key: "J" },
          { action: "split", label: "Split Body", iconName: "split", key: "K" },
        ],
      },
      {
        label: "Shell",
        children: [
          { action: "shell", label: "Shell", iconName: "shell" },
          { action: "draft", label: "Draft", iconName: "draft" },
          { action: "offset-face", label: "Offset Face", iconName: "offsetFace" },
          { action: "thicken", label: "Thicken", iconName: "thicken" },
        ],
      },
      { action: "texture", label: "Texture", iconName: "texture" },
      { action: "change-parameters", label: "Parameters", iconName: "parameters" },
    ],
  },
  {
    label: "CONSTRUCT",
    items: [
      { action: "offset-plane", label: "Offset Plane", iconName: "offsetPlane", key: "O" },
      { action: "datum-plane", label: "Datum Plane", iconName: "datumPlane" },
    ],
  },
  {
    label: "INSPECT",
    items: [
      { action: "measure", label: "Measure", iconName: "measure", key: "I" },
      { action: "section", label: "Section", iconName: "section" },
      {
        label: "Analyze",
        children: [
          { action: "properties", label: "Properties", iconName: "properties" },
          { action: "interference", label: "Interference", iconName: "interference" },
          { action: "draft-analysis", label: "Overhang", iconName: "draftAnalysis" },
          { action: "zebra", label: "Zebra", iconName: "zebra" },
          { action: "curvature", label: "Curvature", iconName: "curvature" },
          { action: "component-colors", label: "Body Colors", iconName: "componentColors" },
        ],
      },
    ],
  },
  {
    label: "INSERT",
    items: [
      { action: "import", label: "Import Mesh", iconName: "import" },
      { action: "simplify-mesh", label: "Simplify Mesh", iconName: "simplifyMesh" },
      { action: "clean-up", label: "Clean Up", iconName: "cleanUp", key: "U" },
      { action: "compute-all", label: "Compute All", iconName: "computeAll" },
    ],
  },
  {
    label: "PRINT",
    items: [
      { action: "print-export", label: "Print Project", iconName: "print" },
      { action: "print-orca", label: "Open in OrcaSlicer", iconName: "slicer" },
      { action: "print-send", label: "Send to Printer", iconName: "printerSend" },
    ],
  },
];

export const SKETCH: Group[] = [
  {
    label: "CREATE",
    items: [
      { action: "line", label: "Line", iconName: "line", key: "L" },
      { action: "rectangle", label: "Rectangle", iconName: "rectangle", key: "R" },
      { action: "centerRectangle", label: "Center Rect", iconName: "centerRectangle" },
      { action: "circle", label: "Circle", iconName: "circle", key: "C" },
      { action: "circle2", label: "Circle 2-Pt", iconName: "circle2" },
      { action: "circle3", label: "Circle 3-Pt", iconName: "circle3" },
      { action: "arc", label: "Arc", iconName: "arc", key: "A" },
      { action: "polygon", label: "Polygon", iconName: "polygon" },
      { action: "slot", label: "Slot", iconName: "slot" },
      { action: "spline", label: "Spline", iconName: "spline" },
      { action: "point", label: "Point", iconName: "point" },
      { action: "text", label: "Text", iconName: "text", key: "T" },
      { action: "project", label: "Project", iconName: "project", key: "P" },
    ],
  },
  {
    label: "MODIFY",
    items: [
      { action: "fillet-sketch", label: "Fillet", iconName: "fillet", key: "F" },
      { action: "chamfer-sketch", label: "Chamfer", iconName: "chamfer" },
      { action: "trim", label: "Trim", iconName: "trim", key: "T" },
      { action: "extend", label: "Extend", iconName: "extend" },
      { action: "offset", label: "Offset", iconName: "offset", key: "O" },
      { action: "break", label: "Break", iconName: "break" },
      { action: "mirror-sketch", label: "Mirror", iconName: "mirror" },
      { action: "move-sketch", label: "Move", iconName: "move" },
      { action: "copy-sketch", label: "Copy", iconName: "copy" },
      { action: "rotate-sketch", label: "Rotate", iconName: "rotate" },
      { action: "scale-sketch", label: "Scale", iconName: "scale" },
      { action: "dimension", label: "Dimension", iconName: "dimension", key: "D" },
    ],
  },
  {
    label: "PATTERN",
    items: [
      { action: "patternRect", label: "Rect Pattern", iconName: "patternRect" },
      { action: "patternCircular", label: "Circular Pat.", iconName: "patternCircular" },
      { action: "boltCircle", label: "Bolt Circle", iconName: "boltCircle" },
      { action: "hexHoles", label: "Hex Holes", iconName: "hexHoles" },
      { action: "honeycomb", label: "Honeycomb", iconName: "honeycomb" },
      { action: "gridHoles", label: "Grid Holes", iconName: "gridHoles" },
    ],
  },
  {
    label: "CONSTRAINTS",
    items: [
      {
        label: "Constrain",
        children: [
          { action: "horizontal", label: "Horizontal", iconName: "horizontal" },
          { action: "vertical", label: "Vertical", iconName: "vertical" },
          { action: "parallel", label: "Parallel", iconName: "parallel" },
          { action: "perpendicular", label: "Perpendic.", iconName: "perpendicular" },
          { action: "equal", label: "Equal", iconName: "equal" },
          { action: "tangent", label: "Tangent", iconName: "tangent" },
          { action: "coincident", label: "Coincident", iconName: "coincident" },
          { action: "concentric", label: "Concentric", iconName: "concentric" },
          { action: "midpoint", label: "Midpoint", iconName: "midpoint" },
          { action: "collinear", label: "Collinear", iconName: "collinear" },
          { action: "symmetric", label: "Symmetric", iconName: "symmetric" },
          { action: "fix", label: "Fix", iconName: "fix" },
        ],
      },
    ],
  },
];

// Collapse priority: lower numbers fold into the "⋯ More" overflow first. PALETTE
// and FINISH are pinned (never collapse — Finish Sketch must stay reachable).
export const PRIORITY: Record<string, number> = {
  CREATE: 100,
  MODIFY: 90,
  PRINT: 50,
  INSPECT: 45,
  CONSTRUCT: 40,
  INSERT: 30,
  CONSTRAINTS: 20,
};
export const PINNED = new Set(["PALETTE", "FINISH"]);
