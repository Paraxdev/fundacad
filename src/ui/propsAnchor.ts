// Where the feature-values popover sits when the history is the bottom strip.
//
// The values a feature carries are edited under its own entry in the history —
// that is the whole point of putting them there, since the entry already names
// the operation being changed. In the side arrangement there is room to open
// them in the flow, indented under the chip. The bottom strip is 52px of chrome
// with a horizontal scroller inside it, so there the panel has to float ABOVE
// the strip, which means fixed coordinates, which means arithmetic worth
// separating from the component that measures the chip.
//
// Fixed rather than absolute is forced: #timeline is `overflow: hidden` and
// .timeline-scroll scrolls inside it, so anything positioned within the strip
// is clipped at its top edge. The panel is teleported to the body instead.

export interface Rect {
  left: number;
  right: number;
  top: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** `left` and `bottom` for a `position: fixed` panel resting `gap` px above
 *  `chip`, left-aligned with it and held inside the window.
 *
 *  Clamped on BOTH sides rather than just the right: the history can be
 *  scrolled so the selected chip is partly off the left edge, and a panel that
 *  followed it there would have its labels outside the window with no way to
 *  scroll them back. `margin` is the same breathing room the panel keeps from
 *  the right edge, so a chip at either extreme parks the panel symmetrically.
 *
 *  `bottom` is measured from the bottom of the window because that is the axis
 *  the panel grows along: it is anchored to the strip and gets taller upward as
 *  a feature gains fields, and a `top` would have to be recomputed for every
 *  height change.
 *
 *  `over` is a rect the panel must not cover, given as the union of whatever
 *  furniture floats above the strip. The view-control pill is the case that
 *  forced it: it sits at the bottom-left of the viewport and the history's first
 *  chips sit at the bottom-left of the window, so the two are in the same column
 *  by construction and the panel landed across ISO / Top / Front for as long as
 *  a feature was selected. Lifting over it keeps the panel in its chip's column,
 *  which is the part of the anchoring that carries meaning, and gives up only
 *  the height. Horizontal overlap is the test, so a chip further along the strip
 *  than the pill reaches still opens tight against the strip. */
export function anchorAbove(
  chip: Rect,
  view: Viewport,
  panelWidth: number,
  gap = 8,
  margin = 8,
  over?: Rect | null,
): { left: number; bottom: number } {
  const widest = Math.max(0, view.width - margin * 2);
  const w = Math.min(panelWidth, widest);
  const left = Math.min(Math.max(margin, chip.left), Math.max(margin, view.width - margin - w));
  let top = chip.top;
  // Strictly-less comparisons on both sides: two rects that merely touch at an
  // edge are not overlapping, and treating them as though they were would lift
  // the panel over a pill it was already clear of.
  if (over && left < over.right && left + w > over.left && over.top < top) top = over.top;
  return { left, bottom: Math.max(margin, view.height - top + gap) };
}
