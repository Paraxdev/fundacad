// The left tool rail: which existing tools are really ONE tool with several ways
// of starting it, which is currently on the button, and where that is remembered.
//
// No second registry of tools — only action ids resolved against ribbonDefs at
// call time. A rail carrying its own labels would be a copy of the ribbon nobody
// re-checks; resolving means a tool the ribbon no longer has drops out of its
// group rather than becoming a button that dispatches an unknown action.
//
// A variant is only a tool producing THE SAME KIND OF THING by a different
// construction (rectangle from a corner or its centre; corner rounded or cut).
// Tools that merely sit next to each other in the ribbon stay on their own
// buttons — folding them together hides a tool behind a gesture nobody would think
// to perform on it. Where the ribbon already answered this with a split button,
// that grouping is reused rather than re-litigated.
//
// Icon-only and deliberately short: this is the PRIMARY tool surface, not a mirror
// of the ribbon.

import { MODEL, SKETCH, leavesOf } from "./ribbonDefs";
import type { Group, RibbonContext, ToolItem } from "./ribbonDefs";

/** One rail button: a family of tools sharing a slot, in menu order. */
export interface RailGroupDef {
  /** Stable identity — the key the remembered default is stored under, so it
   *  must outlive relabelling. Never derived from `label`. */
  id: string;
  /** Names the family in the flyout heading and the button tooltip. */
  label: string;
  /** Member actions, in the order the flyout lists them. The FIRST is the
   *  factory default, i.e. what the button does before the user has ever held
   *  it — so it should be the variant most people reach for. */
  actions: string[];
}

/** A rail group with its actions resolved to real ribbon tools. */
export interface RailGroup {
  id: string;
  label: string;
  /** Non-empty: a group whose every action went missing is dropped entirely. */
  items: ToolItem[];
}

export const MODEL_RAIL: RailGroupDef[] = [
  { id: "sketch", label: "Sketch", actions: ["sketch"] },
  { id: "primitive", label: "Primitive", actions: ["primitive"] },
  { id: "extrude", label: "Extrude", actions: ["extrude"] },
  // Press/Pull stays out of the Extrude group: it starts from a FACE of an
  // existing solid rather than from a profile, so the two are the same verb on
  // different input, not two ways of doing one thing.
  { id: "presspull", label: "Press/Pull", actions: ["presspull"] },
  // The ribbon's own Revolve split — a profile swept along something.
  { id: "sweepFamily", label: "Revolve", actions: ["revolve", "loft", "sweep"] },
  // Fillet and chamfer are one gesture in this app already: features/edgeDragMath
  // puts both on a single signed drag with "no feature" at the origin, so they
  // are the clearest variant pair in the codebase.
  { id: "edgeTreatment", label: "Fillet", actions: ["fillet", "chamfer"] },
  { id: "shell", label: "Shell", actions: ["shell", "draft", "offset-face", "thicken"] },
  { id: "combine", label: "Combine", actions: ["combine", "split"] },
  { id: "transform", label: "Move", actions: ["move", "scale", "mirror", "pattern"] },
  { id: "datum", label: "Plane", actions: ["offset-plane", "datum-plane"] },
  { id: "measure", label: "Measure", actions: ["measure"] },
  // Section joins the ribbon's Analyze family here: on the rail the question a
  // user is answering is "let me see inside / check this surface", and a
  // section view is the bluntest instrument for it.
  {
    id: "analyze",
    label: "Analyze",
    actions: [
      "section",
      "properties",
      "interference",
      "draft-analysis",
      "zebra",
      "curvature",
      "component-colors",
    ],
  },
  { id: "texture", label: "Texture", actions: ["texture"] },
];

export const SKETCH_RAIL: RailGroupDef[] = [
  { id: "line", label: "Line", actions: ["line"] },
  // The user's example, and the one everybody expects: the same rectangle
  // anchored at a corner, at its centre, or on a drawn edge.
  { id: "rectangle", label: "Rectangle", actions: ["rectangle", "centerRectangle", "rectangle3"] },
  { id: "circle", label: "Circle", actions: ["circle", "circle2", "circle3"] },
  { id: "arc", label: "Arc", actions: ["arc"] },
  { id: "polygon", label: "Polygon", actions: ["polygon"] },
  { id: "slot", label: "Slot", actions: ["slot"] },
  { id: "spline", label: "Spline", actions: ["spline"] },
  { id: "point", label: "Point", actions: ["point"] },
  { id: "text", label: "Text", actions: ["text"] },
  { id: "project", label: "Project", actions: ["project"] },
  { id: "sketchCorner", label: "Fillet", actions: ["fillet-sketch", "chamfer-sketch"] },
  // Trim, extend and break are three answers to "this curve ends in the wrong
  // place" and are chosen against the same geometry with the same click.
  { id: "trim", label: "Trim", actions: ["trim", "extend", "break"] },
  { id: "offset", label: "Offset", actions: ["offset"] },
  {
    id: "sketchTransform",
    label: "Move",
    actions: ["move-sketch", "copy-sketch", "rotate-sketch", "scale-sketch", "mirror-sketch"],
  },
  // The user's other example. Linear and circular are the two patterns proper:
  // you hand them a selection and a count.
  { id: "pattern", label: "Pattern", actions: ["patternRect", "patternCircular"] },
  // The hole generators are a separate family even though they also repeat
  // something: they take no selection, they emit their own circles, and picking
  // one is a decision about the PART (a bolt circle, a vented panel), not about
  // how to copy what is already drawn.
  { id: "holes", label: "Hole Array", actions: ["boltCircle", "gridHoles", "hexHoles", "honeycomb"] },
  { id: "dimension", label: "Dimension", actions: ["dimension"] },
];

/** Flat action → tool lookup for a ribbon context, split-button children
 *  included (leavesOf) — a tool folded into a dropdown is still a tool the rail
 *  may name. */
export function toolIndex(source: Group[]): Map<string, ToolItem> {
  const out = new Map<string, ToolItem>();
  for (const g of source) for (const it of g.items) for (const leaf of leavesOf(it)) out.set(leaf.action, leaf);
  return out;
}

/** Resolve rail definitions against a ribbon context's tools.
 *
 *  Unknown actions are DROPPED rather than rendered from the id, and a group
 *  left with nothing disappears. That is what makes the rail safe to define as
 *  bare ids: the failure mode of a retired tool is a shorter flyout, not a
 *  button with no icon whose only behaviour is to dispatch a dead action. The
 *  test suite still fails on a dead id — degrading quietly at runtime and
 *  loudly in CI is the combination we want. */
export function resolveRail(defs: RailGroupDef[], source: Group[]): RailGroup[] {
  const index = toolIndex(source);
  const out: RailGroup[] = [];
  for (const def of defs) {
    const items: ToolItem[] = [];
    for (const action of def.actions) {
      const tool = index.get(action);
      if (tool) items.push(tool);
    }
    if (items.length) out.push({ id: def.id, label: def.label, items });
  }
  return out;
}

/** The rail for a ribbon context. */
export function railFor(context: RibbonContext): RailGroup[] {
  return resolveRail(context === "sketch" ? SKETCH_RAIL : MODEL_RAIL, context === "sketch" ? SKETCH : MODEL);
}

/** The tool a group's button currently runs on a plain click.
 *
 *  `remembered` is untrusted — it comes out of localStorage, and the tool it
 *  names may have been retired, renamed, or moved to another group since it was
 *  written. Membership is therefore re-checked HERE, on every read, rather than
 *  once at load: it is the only place that knows what the group currently
 *  holds. A stale name falls back to the factory default, so the worst a corrupt
 *  setting can do is put the wrong variant on the button face. */
export function defaultTool(group: RailGroup, remembered: string | undefined): ToolItem {
  const first = group.items[0]!; // resolveRail never emits an empty group
  if (!remembered) return first;
  return group.items.find((t) => t.action === remembered) ?? first;
}

/** The group an action belongs to, or null.
 *
 *  Used to put a tool armed from somewhere else — the keymap, the command
 *  palette, the ribbon — on the rail's button face. Without it, pressing R
 *  would arm Rectangle while the rail went on showing Center Rect as the active
 *  tool, which reads as the rail being out of sync with the app. */
export function groupForAction(groups: RailGroup[], action: string): RailGroup | null {
  if (!action) return null;
  return groups.find((g) => g.items.some((t) => t.action === action)) ?? null;
}

/** True when the group is worth a flyout at all. A one-tool group is a plain
 *  button: holding it must do nothing rather than open a menu of one. */
export function hasVariants(group: RailGroup): boolean {
  return group.items.length > 1;
}

// --- the remembered variant per group, as a user setting ---------------------
//
// Persisted like every other display preference (ui/theme.ts, icons.ts, units.ts):
// one `sindricad.*` localStorage key read at module load, a validating gate, and a
// listener set so the live rail re-renders.
//
// Unlike theme.ts this is a MAP, so the gate sanitises PER ENTRY — one unreadable
// entry must not cost the user every other choice they have made.

const KEY = "sindricad.railDefaults";

/** Narrow untrusted JSON to a group→action map, dropping anything malformed. */
export function asRailDefaults(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [id, action] of Object.entries(v as Record<string, unknown>)) {
    if (id && typeof action === "string" && action) out[id] = action;
  }
  return out;
}

function readStored(): Record<string, string> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    return raw ? asRailDefaults(JSON.parse(raw)) : {};
  } catch {
    // Unparseable JSON is treated exactly like no setting at all: the rail
    // opens on its factory defaults instead of failing to render.
    return {};
  }
}

let chosen = readStored();
const listeners = new Set<() => void>();

/** The remembered variant per group id. Read-only — go through setRailDefault
 *  so the write is persisted and subscribers are told. */
export function railDefaults(): Readonly<Record<string, string>> {
  return chosen;
}

/** Remember `action` as the group's one-click default.
 *
 *  Called only when the user PICKS a variant from the flyout. Arming a tool by
 *  any other route (a shortcut key, the palette, the ribbon) deliberately does
 *  not write here: the rail should adapt to a decision the user made about the
 *  rail, not silently rearrange itself because a shortcut was pressed once. */
export function setRailDefault(groupId: string, action: string) {
  if (!groupId || !action || chosen[groupId] === action) return;
  // A fresh object rather than a mutation: subscribers are free to hold the map
  // returned by railDefaults() and compare identity to decide they must redraw.
  chosen = { ...chosen, [groupId]: action };
  try {
    localStorage.setItem(KEY, JSON.stringify(chosen));
  } catch {
    /* private mode / no storage: the choice just doesn't survive the session */
  }
  for (const fn of listeners) fn();
}

/** Subscribe to changes; returns the unsubscribe. */
export function onRailDefaultsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
