// The one shared pie menu, as a request anybody can post and one component
// renders — the same arrangement stores/contextMenu.ts + ContextMenuHost.vue
// have for the right-click list, so the two popups behave alike where they
// overlap (one at a time, opened at a point, dismissed by Escape).
//
// Module state with a listener set rather than a Pinia store, matching
// ui/toolRail.ts and ui/icons.ts. The reason is the same one those files give:
// it keeps this module free of a Vue import, so the headless *.test.ts suite
// and the non-component callers (ui/contextMenus.ts, which is plain TypeScript)
// can both reach it with nothing set up.
//
// --- pie or list? -----------------------------------------------------------
//
// The pie COMPLEMENTS ContextMenuHost, it does not replace it, and the split is
// not a matter of taste:
//
//   * A list can hold anything — twenty rows, submenus, checkmarks, colour
//     swatches, an item whose label is computed ("Repeat Fillet"), a
//     destructive row that has to be read before it is clicked. It scrolls. It
//     costs nothing to add to.
//   * A pie can hold eight things, must hold the SAME eight every time to be
//     worth anything, and is read by direction rather than by word. What it
//     buys for that is speed no list can match.
//
// So the fixed, small, frequently-repeated sets become pies (orient the view;
// act on this selection) and everything else stays a list. A pie built out of
// whatever happened to be applicable, reordered per invocation, would have the
// list's flexibility and none of the pie's speed — the worst of both.

/** One wedge. Order in PieRequest.items IS the slot order (pieMath.SLOT_ORDER),
 *  so a menu's author chooses angles by choosing declaration order. */
export interface PieItem {
  label: string;
  /** Name from ui/icons.ts — never a glyph or a character. Optional because not
   *  every wheel has marks worth drawing: the orientation pie's items are
   *  directions, and six near-identical plane glyphs would carry less than the
   *  six words already do. */
  iconName?: string | undefined;
  /** small key hint under the label, e.g. "F" */
  hint?: string | undefined;
  /** Shown, dimmed, and unpickable. Kept in the wheel rather than filtered out
   *  on purpose: dropping it would slide every later item into a different
   *  slot, which is precisely the muscle-memory break pieMath exists to
   *  prevent. "Loft is where it always is, and it is grey because you have only
   *  picked one profile" is also a better answer than silence. */
  disabled?: boolean | undefined;
  onPick?: (() => void) | undefined;
}

export interface PieRequest {
  /** Menu identity — the unit muscle memory is attached to. Two requests with
   *  the same id must always carry the same items in the same order. */
  id: string;
  /** Named in the middle of the wheel, so an accidental open explains itself. */
  title: string;
  /** Where the centre goes, client coords: the cursor, always. A pie that
   *  appeared anywhere else would make the user travel to it before they could
   *  aim, which is most of the gesture's cost. */
  x: number;
  y: number;
  items: readonly PieItem[];
}

let current: PieRequest | null = null;
let epoch = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

/** Open a pie, replacing whatever was up. */
export function openPie(req: PieRequest): void {
  current = req;
  // Bumped on every open so the host re-runs its gesture setup even when the
  // same menu is popped twice at the same point — the same reason
  // stores/contextMenu.ts carries an epoch.
  epoch++;
  emit();
}

/** Close the open pie (if any). For tool/mode exits and document changes;
 *  ordinary dismissal (Escape, a cancelling release) is the host's own. */
export function dismissPie(): void {
  if (!current) return;
  current = null;
  epoch++;
  emit();
}

export function currentPie(): PieRequest | null {
  return current;
}

export function pieEpoch(): number {
  return epoch;
}

/** Subscribe to open/close; returns the unsubscribe. */
export function onPieChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
