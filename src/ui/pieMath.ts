// The geometry of a radial (pie) menu, and the rules that decide what a gesture
// picked. No DOM, no Vue, no clock — same split, and for the same reason, as
// ui/holdGesture.ts: the component owns the pointer stream and the pixels, and
// everything that is either right or quietly ruins the gesture lives here where
// a test can pin it down.
//
// A pie menu is not a list drawn in a circle. The choice is the DIRECTION you
// move, and the whole value of that is muscle memory — after a week the user is
// not reading the labels, they are flicking left for Fillet. Three properties
// have to hold for that to be true, and each of them is a decision this file
// makes rather than a detail a renderer stumbles into:
//
//   1. STABLE ANGLES. Item i of a given menu sits at the same angle whatever
//      else the menu contains. That is why the slots are a fixed sequence that
//      gets FILLED, never a circle that gets divided: dividing 2π by the item
//      count means adding a seventh entry silently moves the other six, and
//      every flick the user had learned now lands somewhere else. A short menu
//      leaves slots empty instead. Empty space is cheap; relearning is not.
//
//   2. DIRECTION, NOT DISTANCE. Past the dead zone the nearest item BY ANGLE is
//      armed however far out the cursor goes. Nothing here hit-tests a
//      rectangle. An expert flicks 300px in a tenth of a second without
//      looking, and a menu that only responds inside a 40px-wide label is a
//      menu that punishes them for being fast.
//
//   3. THE CENTRE MEANS NOTHING. Releasing inside the dead zone is a cancel,
//      which is what makes the gesture safe to start: open it, see nothing you
//      want, let go where you already are.
//
// Screen space throughout: +x right, +y DOWN, angles from atan2(dy, dx). That
// matches what a pointer event hands the caller, so no coordinate flips happen
// anywhere between the event and the arithmetic.

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

/** The order slots are FILLED — item 0 goes west, item 1 east, and so on.
 *
 *  Cardinals first, because they are the good slots: a pure left, right, up or
 *  down flick needs no aim at all, while a diagonal has to be roughly right in
 *  two axes at once. Blender fills in this same order and it is not arbitrary
 *  there either — west and east lead because horizontal wrist movement is the
 *  cheapest thing a hand does.
 *
 *  Opposite pairs are adjacent (W/E, S/N, NW/SE, SW/NE) so a menu of two reads
 *  as an axis rather than as two items that happen to be near each other, and
 *  so a menu author can put genuinely opposite verbs — Top and Bottom, Front
 *  and Back — at opposite angles just by declaring them next to each other. */
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
 *  `travelledPx` is the FURTHEST the pointer has been from the centre since the
 *  pie opened, not where it is now. The distinction is the whole rule: a user
 *  who dragged out to look at the items and came back to the middle is
 *  cancelling, and their release lands at the same place as the release of the
 *  click that opened the menu. Only the peak tells them apart.
 *
 *  No clock is consulted, deliberately — a time threshold here would mean a
 *  slow, careful drag out and back re-opened the menu instead of cancelling it,
 *  and a fast one cancelled instead of opening. Distance is what the user is
 *  actually expressing. */
export function releaseOutcome(g: { armed: number | null; travelledPx: number }): PieRelease {
  if (g.armed !== null) return "pick";
  if (g.travelledPx <= TRAVEL_SLOP_PX) return "keep-open";
  return "cancel";
}
