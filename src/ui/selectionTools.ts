// What to OFFER for the thing that is currently selected — the one answer both
// the floating selection toolbar and the selection pie render.
//
// features/toolCapabilities.ts already knows which tools consume which kinds of
// entity; it is deliberately a capability model and nothing else. This file is
// the thin layer above it that turns "these tools could act on a face" into
// something with a label, an icon, a key hint and a way to run it, and it is
// separate for the reason that table's own header gives: the moment two
// surfaces each derive the answer their own way, they disagree, and the user
// gets Fillet on the toolbar but not in the pie.
//
// --- one selection, one verb set --------------------------------------------
//
// A selection can hold several kinds at once — click a face, then ctrl-click a
// profile area lying on it, and both are live. The offer is built from ONE of
// them, ranked, rather than from the union, because the union is not a thing a
// user can act on: Extrude-the-profile and Press/Pull-the-face are different
// operations on different geometry and showing both invites a click that does
// the one you were not looking at.
//
// The ranking below is copied from app/viewportWiring.ts, which already had to
// answer exactly this question to decide which drag handle to mount, and the
// two MUST agree: the handle standing on the geometry and the toolbar floating
// above it are one affordance seen twice, and if they ranked differently the
// arrow would push a face while the toolbar offered to extrude a profile.
//
// --- shown vs live ----------------------------------------------------------
//
// Membership comes from the selection's KIND; enablement comes from its COUNT.
// A profile selection always offers Extrude, Revolve, Sweep and Loft in that
// order, and Loft is simply dim until a second profile joins it. That split is
// what lets the pie keep its slots fixed (pieMath's whole premise) and what
// makes the answer to "why can't I loft this" visible instead of absent.
// The toolbar, which has no slots to protect, shows only the live ones.

import {
  TOOL_CAPABILITIES,
  applicableTools,
  toolsConsuming,
  type EntityKind,
  type SelectionCounts,
  type ToolId,
} from "../features/toolCapabilities";
import { keyHint } from "../input/shortcuts";
import { MAX_PIE_ITEMS } from "./pieMath";
import type { PieRequest } from "./pieMenu";

/** Which kind wins when a selection holds several. See the header — this is
 *  app/viewportWiring.ts's drag-handle ranking, and it may not drift from it.
 *
 *  Bodies come last rather than not at all: body selection is a separate mode
 *  (press 2), so in practice it never competes with the other three, and
 *  leaving it off would mean a two-body selection offering nothing while
 *  Combine sits one keystroke away. */
export const KIND_RANK: readonly EntityKind[] = ["edge", "sketch-region", "face", "body"];

/** Human name for the kind, for the toolbar's and the pie's title. Singular —
 *  callers that have a count add the plural. */
export const KIND_LABEL: Record<EntityKind, string> = {
  edge: "edge",
  face: "face",
  vertex: "corner",
  body: "body",
  "sketch-region": "profile",
};

/** The kind this selection is primarily made of, or null when it is empty. */
export function primaryKind(sel: SelectionCounts): EntityKind | null {
  return KIND_RANK.find((k) => (sel[k] ?? 0) > 0) ?? null;
}

/** How many entities of the winning kind are selected. */
export function primaryCount(sel: SelectionCounts): number {
  const kind = primaryKind(sel);
  return kind ? (sel[kind] ?? 0) : 0;
}

/** One tool, dressed for a button or a wedge. */
export interface ToolOffer {
  tool: ToolId;
  label: string;
  iconName: string;
  /** The id for the central dispatcher (app/actions.ts), or null for the one
   *  tool that has no such id — see ACTIONLESS below. A caller that cannot
   *  handle null must skip the offer rather than dispatch the tool id and
   *  silently do nothing. */
  action: string | null;
  /** Keyboard hint from the single shortcut table, so this can never advertise
   *  a key the keymap does not bind. */
  hint: string | undefined;
  /** The selection actually satisfies this tool's minimum. */
  enabled: boolean;
}

/** Tool id → icon name in ui/icons.ts.
 *
 *  A table rather than a convention (`iconFor(id)` doing string surgery)
 *  because two of them do not match — "delete-face" is drawn by `deleteFace`,
 *  "offset-face" by `offsetFace` — and a convention with exceptions is a
 *  convention that fails silently, on the icon that turns into a blank square.
 *  selectionTools.test.ts holds every tool to having an entry. */
const TOOL_ICON: Record<ToolId, string> = {
  fillet: "fillet",
  chamfer: "chamfer",
  presspull: "presspull",
  extrude: "extrude",
  revolve: "revolve",
  sweep: "sweep",
  loft: "loft",
  texture: "texture",
  "delete-face": "deleteFace",
  move: "move",
  combine: "combine",
  measure: "measure",
  shell: "shell",
  draft: "draft",
  "offset-face": "offsetFace",
  thicken: "thicken",
};

/** The tools whose id is NOT an action string.
 *
 *  Exactly one, and features/toolCapabilities.ts documents why: face delete is
 *  dispatched through engine.deleteSelectedFace (the Del key and the face
 *  context menu) because it is a selection verb rather than a ribbon command.
 *  It earns its place in the offer anyway — leaving it out would make "what
 *  applies to this face" wrong — so the seam is declared here instead of being
 *  discovered when a click does nothing. */
const ACTIONLESS: ReadonlySet<ToolId> = new Set<ToolId>(["delete-face"]);

/** Every tool the selection's winning kind can feed, in the capability table's
 *  own preference order, each marked live or not. Empty for an empty
 *  selection. */
export function selectionOffers(sel: SelectionCounts): ToolOffer[] {
  const kind = primaryKind(sel);
  if (!kind) return [];
  // applicableTools() is the authority on "can this run": it is what applies
  // each tool's own minimum (Combine needs two bodies, Loft two profiles), and
  // re-deriving that from the counts here is exactly the duplication this file
  // exists to avoid.
  const live = new Set(applicableTools(sel));
  return toolsConsuming(kind, "selection").map((tool) => ({
    tool,
    label: TOOL_CAPABILITIES[tool].label,
    iconName: TOOL_ICON[tool],
    action: ACTIONLESS.has(tool) ? null : tool,
    hint: keyHint(tool),
    enabled: live.has(tool),
  }));
}

/** How many buttons the floating toolbar shows before it stops being a toolbar.
 *
 *  Five, because it hovers over the model: every button is a button-sized piece
 *  of the part you are looking at. A face selection currently produces six
 *  offers, so the sixth — Delete Face, the destructive one, last in the
 *  capability table's preference order — is reachable only through the pie or
 *  the right-click menu. That is the right one to push behind a second gesture,
 *  and it falls out of the ordering rather than being special-cased. */
export const TOOLBAR_MAX = 5;

/** What the floating toolbar shows: the live offers, capped. */
export function toolbarOffers(sel: SelectionCounts): ToolOffer[] {
  return selectionOffers(sel)
    .filter((o) => o.enabled)
    .slice(0, TOOLBAR_MAX);
}

/** The selection pie: everything the toolbar trimmed, plus what is not yet
 *  runnable, at fixed angles. Null when nothing is selected.
 *
 *  `run` receives the offer rather than an action string so the one actionless
 *  tool stays the caller's problem to answer explicitly — a signature of
 *  (action: string) would have forced a fake id through it. */
export function selectionPie(
  x: number,
  y: number,
  sel: SelectionCounts,
  run: (offer: ToolOffer) => void,
): PieRequest | null {
  const kind = primaryKind(sel);
  if (!kind) return null;
  const n = primaryCount(sel);
  const offers = selectionOffers(sel).slice(0, MAX_PIE_ITEMS);
  return {
    // Identity is the KIND, never the count: a face pie must be the same wheel
    // whether one face or nine are selected, or the muscle memory is worth
    // nothing.
    id: `selection:${kind}`,
    title: `${n} ${KIND_LABEL[kind]}${n === 1 ? "" : "s"}`,
    x,
    y,
    items: offers.map((o) => ({
      label: o.label,
      iconName: o.iconName,
      hint: o.hint,
      disabled: !o.enabled,
      onPick: () => run(o),
    })),
  };
}
