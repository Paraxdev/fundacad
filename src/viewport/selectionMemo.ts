// Carrying a selection across a rebuild.
//
// A completed rebuild replaces the Highlighter and every trace of what was
// selected. Tolerable while selecting only lit an edge up, but direct manipulation
// makes the selection a live control: the drag handle is drawn FROM it, so
// cancelling a fillet returned you to the sharp model with no arrow — the geometry
// was back, the affordance was not.
//
// Two ways to find an entity again, in cost order:
//
//  1. It came through untouched. A body whose etag is unchanged is REUSED whole by
//     setModel — same BodyMesh, same EdgeRefs, same faceId numbering — so the old
//     reference is still right. The common case, since a rebuild usually touches
//     one body out of however many exist.
//  2. Its body was rebuilt. Ids are not stable (the client renumbers), so geometry
//     is the only identity left: match by the world-space point convention the
//     selectors already use. Correct, but each lookup walks the model.
//
// Generic over entity type so survivor reuse, the fallback, its cap and
// de-duplication can all be tested with no scene, camera or GPU.

/** Above this many entities needing the geometric fallback, drop them instead.
 *
 *  The fallback is O(model) EACH: faceIdNear walks every triangle of every
 *  body. One or two of those is invisible; a coplanar smart-select of 200 faces
 *  would turn every rebuild into a freeze. Losing the selection there is the
 *  behaviour that existed before any of this, so the cap degrades to the old
 *  outcome rather than to a new bug — and the cases direct manipulation is
 *  built around (one edge, one face) are nowhere near it. */
export const MAX_GEOMETRIC_REMATCH = 16;

/** Re-point a captured selection at a freshly rebuilt model.
 *
 *  `survivor` returns the entity when the memo came through the rebuild
 *  verbatim, else null. `rematch` is the expensive geometric fallback, called
 *  ONLY for what `survivor` gave up on — and only while the number of those
 *  stays within `maxRematch`.
 *
 *  Order follows the capture, and duplicates collapse: two selected edges can
 *  legitimately resolve to the same rebuilt edge (a fillet merging two
 *  collinear stretches into one), and feeding that to a TOGGLE would select it
 *  and then immediately deselect it. */
export function remapSelection<M, E>(
  memos: readonly M[],
  survivor: (memo: M) => E | null,
  rematch: (memo: M) => E | null,
  maxRematch: number = MAX_GEOMETRIC_REMATCH,
): E[] {
  const pairs = memos.map((m) => ({ memo: m, entity: survivor(m) }));
  const missing = pairs.filter((p) => p.entity === null).length;
  const out: E[] = [];
  const seen = new Set<E>();
  for (const p of pairs) {
    // Compared against null explicitly, never for truthiness: faceId 0 is a
    // real face and an entity type is allowed to be a number.
    const e = p.entity === null && missing <= maxRematch ? rematch(p.memo) : p.entity;
    if (e === null || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}
