// The one shared pie menu: a request anybody can post, one component renders —
// the same arrangement stores/contextMenu.ts + ContextMenuHost.vue have for the
// right-click list.
//
// Module state with a listener set rather than Pinia, matching ui/toolRail.ts and
// ui/icons.ts: no Vue import, so the headless suite and the plain-TypeScript
// callers (ui/contextMenus.ts) both reach it with nothing set up.
//
// The pie COMPLEMENTS the list rather than replacing it. A list holds anything,
// scrolls, and costs nothing to add to; a pie holds eight things, must hold the
// SAME eight every time to be worth anything, and is read by direction rather than
// by word. So fixed, small, frequently-repeated sets become pies and everything
// else stays a list.

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
