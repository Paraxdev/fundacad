// The geometry of a radial (pie) menu, and what a gesture picked. No DOM, no Vue,
// no clock — same split as ui/holdGesture.ts.
//
// A pie menu is not a list drawn in a circle: the choice is the DIRECTION you
// move, and the value of that is muscle memory. Three properties make that true:
//
//   1. STABLE ANGLES. Slots are a fixed sequence that gets FILLED, never a circle
//      divided by the item count — dividing means a seventh entry moves the other
//      six and every learned flick lands somewhere else. Short menus leave slots
//      empty. Empty space is cheap; relearning is not.
//   2. DIRECTION, NOT DISTANCE. Past the dead zone the nearest item BY ANGLE is
//      armed however far out the cursor goes. An expert flicks 300px without
//      looking; a 40px-wide hit rectangle punishes them for being fast.
//   3. THE CENTRE MEANS NOTHING. Releasing in the dead zone cancels, which is what
//      makes the gesture safe to start.
//
// Screen space throughout: +x right, +y DOWN, angles from atan2(dy, dx) — what a
// pointer event hands the caller, so nothing flips between event and arithmetic.

/** The eight compass directions a pie can put an item in. */
export type PieSlot = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

const D = Math.SQRT1_2; // the diagonals, normalised

/** Unit vector per slot, screen space (+y is DOWN, so N is negative y). */
export const SLOT_VECTOR: Record<PieSlot, readonly [number, number]> = {
  N: [0, -1],
  NE: [D, -D],
  E: [1, 0],
  SE: [D, D],
  S: [0, 1],
  SW: [-D, D],
  W: [-1, 0],
  NW: [-D, -D],
};

/** The order slots are FILLED — item 0 west, item 1 east, and so on.
 *
 *  Cardinals first: a pure left/right/up/down flick needs no aim, a diagonal has
 *  to be roughly right in two axes at once, and horizontal wrist movement is the
 *  cheapest thing a hand does.
 *
 *  Opposite pairs are ADJACENT (W/E, S/N, NW/SE, SW/NE) so a menu of two reads as
 *  an axis, and so an author can put Top and Bottom at opposite angles just by
 *  declaring them next to each other. */
export const SLOT_ORDER = ["W", "E", "S", "N", "NW", "SE", "NE", "SW"] as const satisfies readonly PieSlot[];

/** A pie holds at most eight items. Past that the angular gap between
 *  neighbours drops below what a hand can hit blind, which trades away the only
 *  advantage a pie has over a list. A menu with more to offer needs to be split
 *  or to stay a list — see components/overlays/ContextMenuHost.vue, which is
 *  still the right shape for everything that needs words, state and submenus. */
export const MAX_PIE_ITEMS = SLOT_ORDER.length;

/** No-choice radius, px. Below this the pointer has not committed to anything.
 *
 *  Large enough that the tremor of a click — press and release never land on
 *  exactly the same pixel — cannot arm the item nearest whichever way the hand
 *  happened to twitch, and large enough to be a comfortable target to come back
 *  to when you change your mind. Small enough that it is inside the ring of
 *  labels, so "aim at nothing" and "aim at something" are visually distinct. */
export const DEAD_ZONE_PX = 26;

/** Where item labels sit, px from the centre. Layout only — arming does not
 *  read it, which is the point of rule 2 above. */
export const PIE_RADIUS_PX = 104;

/** Pointer travel under which a release counts as "never really moved".
 *
 *  A press and a release are always a pixel or two apart on a real mouse, and
 *  more than that on a trackpad. This is the tolerance that separates the
 *  RELEASE OF THE CLICK THAT OPENED THE MENU from a deliberate return to the
 *  centre to cancel. */
export const TRAVEL_SLOP_PX = 6;

/** How far from the centre a fresh CLICK still counts as aiming at the pie.
 *
 *  Deliberately not applied to the flick (see releaseOutcome): a drag that is
 *  already under way is committed, and an overshoot must still land on what it
 *  was aimed at however far it goes. A separate, later click most of a screen
 *  away is a different intent — the user is reaching for the ribbon or the
 *  browser tree — and treating that as a pick would fire a modeling tool
 *  because someone tried to click away from a menu they had finished with. */
export const CLICK_REACH_PX = 340;

/** Which slot item `index` occupies, or null when the pie is already full. */
export function slotOf(index: number): PieSlot | null {
  return SLOT_ORDER[index] ?? null;
}

/** The slot's direction as an angle, radians, screen space. */
export function slotAngle(slot: PieSlot): number {
  const v = SLOT_VECTOR[slot];
  return Math.atan2(v[1], v[0]);
}

/** Where item `index` is drawn, as an offset from the centre in px. Null when
 *  the index is past the last slot. */
export function itemOffset(index: number, radius = PIE_RADIUS_PX): { x: number; y: number } | null {
  const slot = slotOf(index);
  if (!slot) return null;
  const v = SLOT_VECTOR[slot];
  return { x: v[0] * radius, y: v[1] * radius };
}

/** Smallest absolute angle between two directions, radians (0..π). */
function angleGap(a: number, b: number): number {
  const two = Math.PI * 2;
  const d = Math.abs(a - b) % two;
  return d > Math.PI ? two - d : d;
}

/** The item a cursor at (dx, dy) from the centre is aiming at, or null for "no
 *  choice" — inside the dead zone, or an empty menu.
 *
 *  Nearest by angle among the slots that are actually OCCUPIED, which is what
 *  makes a short menu usable: a three-item pie fills W, E and S, and aiming
 *  north-east still arms the eastern item rather than falling into a gap the
 *  user cannot see. Ties (aiming due north at a W/E pair) resolve to the lower
 *  index, so the answer is a function of the input and not of iteration order —
 *  a pie that picked differently on either side of a boundary pixel would be
 *  unlearnable exactly where the hand is least precise. */
export function armedIndex(dx: number, dy: number, count: number): number | null {
  const n = Math.min(count, MAX_PIE_ITEMS);
  if (n <= 0) return null;
  const r = Math.hypot(dx, dy);
  // Written as a positive test so a NaN radius (a pointer event before the
  // first layout, a division by a zero-size canvas) reads as "no choice"
  // instead of arming whatever atan2 makes of it.
  if (!(r >= DEAD_ZONE_PX)) return null;
  const a = Math.atan2(dy, dx);
  let best: number | null = null;
  let bestGap = Infinity;
  for (let i = 0; i < n; i++) {
    const slot = SLOT_ORDER[i];
    if (!slot) continue;
    const gap = angleGap(a, slotAngle(slot));
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return best;
}

/** Is a fresh click at (dx, dy) still aimed at this pie? See CLICK_REACH_PX. */
export function withinClickReach(dx: number, dy: number, reach = CLICK_REACH_PX): boolean {
  return Math.hypot(dx, dy) <= reach;
}

export type PieRelease =
  /** run the armed item and close */
  | "pick"
  /** the release of the click that OPENED the pie: stay up, wait for a second
   *  click. This is what makes one implementation serve both a flick and a
   *  point-and-click, without the component having to know which one the user
   *  is performing — it finds out when they let go. */
  | "keep-open"
  /** back out, run nothing */
  | "cancel";

/** What a pointer release means.
 *
 *  `travelledPx` is the FURTHEST the pointer has been from the centre, not where it
 *  is now. That is the whole rule: someone who dragged out to look and came back is
 *  cancelling, and their release lands exactly where the opening click's would.
 *  Only the peak tells them apart. No clock is consulted — a time threshold would
 *  make a slow careful drag out and back re-open the menu instead of cancelling. */
export function releaseOutcome(g: { armed: number | null; travelledPx: number }): PieRelease {
  if (g.armed !== null) return "pick";
  if (g.travelledPx <= TRAVEL_SLOP_PX) return "keep-open";
  return "cancel";
}
