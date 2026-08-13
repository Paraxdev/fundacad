// Snapping in 2D sketch space. Candidates (endpoints/midpoints/centers from
// existing geometry) are compared to the cursor in SCREEN PIXELS so the snap
// radius is zoom-independent, like mainstream MCAD. Grid snapping is the low-priority
// fallback.

import * as THREE from "three";
import type { DimPlace, ProjectedCurve, ProjectedSource } from "../types";
import { asRound } from "./entityDims";
import { rectCorners } from "./region";

export type SnapKind =
  | "free"
  | "grid"
  | "endpoint"
  | "midpoint"
  | "center"
  | "on-x"
  | "on-y";

export interface SnapCandidate {
  p: THREE.Vector2;
  kind: SnapKind;
  priority: number; // higher wins
}

export interface SnapResult {
  point: THREE.Vector2;
  kind: SnapKind;
}

export function snap(
  raw: THREE.Vector2,
  candidates: SnapCandidate[],
  toScreen: (p: THREE.Vector2) => { x: number; y: number },
  gridStep: number,
  pixelTol = 10,
): SnapResult {
  const rawScreen = toScreen(raw);
  let best: SnapCandidate | null = null;
  let bestD = pixelTol;

  for (const c of candidates) {
    const s = toScreen(c.p);
    const d = Math.hypot(s.x - rawScreen.x, s.y - rawScreen.y);
    if (d <= pixelTol) {
      // within tolerance: prefer higher priority, then nearer
      if (
        !best ||
        c.priority > best.priority ||
        (c.priority === best.priority && d < bestD)
      ) {
        best = c;
        bestD = d;
      }
    }
  }

  if (best) return { point: best.p.clone(), kind: best.kind };

  if (gridStep <= 0) return { point: raw.clone(), kind: "free" }; // grid snap off

  // Grid fallback (always available, lowest priority). Each axis is tested on
  // its OWN, which is the whole of it: this rounded both axes and then measured
  // one distance to the resulting corner, so the cursor had to be within
  // tolerance of a lattice POINT in both axes at once. Anywhere along a grid
  // line but between two intersections, nothing snapped, which is exactly what
  // "drawing freely does not snap to the grid" describes. Snapping the axes
  // separately makes an intersection the case where both fire, so the old
  // behaviour survives as a special case rather than as a second rule.
  const gx = Math.round(raw.x / gridStep) * gridStep;
  const gy = Math.round(raw.y / gridStep) * gridStep;
  // Measured as a full SCREEN distance to the axis-snapped point rather than as
  // a difference in screen x or y. The tolerance is in pixels so that it is the
  // same reach at every zoom, and the sketch plane can sit at any angle on
  // screen when Lock to Plane is off, where a sketch axis is neither.
  const screenGap = (p: THREE.Vector2) => {
    const s = toScreen(p);
    return Math.hypot(s.x - rawScreen.x, s.y - rawScreen.y);
  };
  const onX = screenGap(new THREE.Vector2(gx, raw.y)) <= pixelTol;
  const onY = screenGap(new THREE.Vector2(raw.x, gy)) <= pixelTol;
  if (onX || onY) {
    return { point: new THREE.Vector2(onX ? gx : raw.x, onY ? gy : raw.y), kind: "grid" };
  }

  return { point: raw.clone(), kind: "free" };
}

/** snap candidates from resolved sketch entities (numbers, not params) */
export function candidatesFromEntities(
  entities: ResolvedEntity[],
): SnapCandidate[] {
  const out: SnapCandidate[] = [];
  const add = (x: number, y: number, kind: SnapKind, priority: number) =>
    out.push({ p: new THREE.Vector2(x, y), kind, priority });

  for (const e of entities) {
    if (e.type === "line") {
      add(e.x1, e.y1, "endpoint", 100);
      add(e.x2, e.y2, "endpoint", 100);
      add((e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2, "midpoint", 80);
    } else if (e.type === "rectangle") {
      // Through rectCorners rather than +-hw/+-hh, so a ROTATED rectangle snaps
      // to where it is drawn. Computing corners inline here is how the two would
      // drift apart, and a snap that lands on a phantom axis-aligned corner is
      // the sort of thing you only notice after the part is wrong.
      const c = rectCorners(e.x, e.y, e.width, e.height, e.angle);
      for (const p of c) add(p.x, p.y, "endpoint", 100);
      add(e.x, e.y, "center", 90);
      for (let k = 0; k < 4; k++) {
        const a = c[k]!;
        const b = c[(k + 1) % 4]!;
        add((a.x + b.x) / 2, (a.y + b.y) / 2, "midpoint", 80);
      }
    } else if (e.type === "circle") {
      add(e.x, e.y, "center", 90);
    } else if (e.type === "arc") {
      add(e.x1, e.y1, "endpoint", 100);
      add(e.x2, e.y2, "endpoint", 100);
      add(e.mx, e.my, "midpoint", 80);
    } else if (e.type === "spline") {
      for (const p of e.points) add(p.x, p.y, "endpoint", 100); // fit points snap
    } else if (e.type === "point") {
      add(e.x, e.y, "endpoint", 110); // a placed point is a strong snap target
    } else if (e.type === "projected") {
      // projected reference curves snap like their native counterparts — that's
      // half the point of projecting. Centers come from asRound (the one
      // circumcenter-for-projected-arc rule). Poly interior vertices are
      // SAMPLES, not real model points, so they snap weakly (60).
      const round = asRound(e);
      if (round) add(round.x, round.y, "center", 90);
      const cv = e.curve;
      if (cv.kind === "line") {
        add(cv.x1, cv.y1, "endpoint", 100);
        add(cv.x2, cv.y2, "endpoint", 100);
        add((cv.x1 + cv.x2) / 2, (cv.y1 + cv.y2) / 2, "midpoint", 80);
      } else if (cv.kind === "arc") {
        add(cv.x1, cv.y1, "endpoint", 100);
        add(cv.x2, cv.y2, "endpoint", 100);
        add(cv.mx, cv.my, "midpoint", 80); // exact model point, same as native arcs
      } else if (cv.kind === "poly") {
        const pts = cv.pts;
        pts.forEach(([x, y], i) => {
          const isEnd = i === 0 || i === pts.length - 1;
          add(x, y, "endpoint", isEnd ? 100 : 60);
        });
      }
    }
  }
  return out;
}

// `id` is the stable in-session identity constraints reference (see ./id.ts).
// `dimPlace` mirrors SketchEntity's badge-label placement (see types.ts) — it's
// plain numbers already, so it survives resolution as a structural copy.
export type ResolvedEntity =
  | { type: "line"; id: string; x1: number; y1: number; x2: number; y2: number; construction?: boolean; dimPlace?: DimPlace }
  | { type: "rectangle"; id: string; width: number; height: number; x: number; y: number; angle?: number; construction?: boolean; dimPlace?: DimPlace }
  | { type: "circle"; id: string; radius: number; x: number; y: number; construction?: boolean; dimPlace?: DimPlace }
  | { type: "arc"; id: string; x1: number; y1: number; x2: number; y2: number; mx: number; my: number; construction?: boolean }
  | { type: "spline"; id: string; points: { x: number; y: number }[]; construction?: boolean }
  | { type: "point"; id: string; x: number; y: number; construction?: boolean }
  // parametric shapes (rigid: the solver skips them; edited via their params)
  | { type: "polygon"; id: string; x: number; y: number; radius: number; sides: number; angle: number; construction?: boolean; dimPlace?: DimPlace }
  | { type: "slot"; id: string; x1: number; y1: number; x2: number; y2: number; width: number; construction?: boolean; dimPlace?: DimPlace }
  | { type: "text"; id: string; text: string; x: number; y: number; height: number;
      font?: string; style?: "regular" | "bold" | "italic" | "bolditalic";
      align?: "left" | "center" | "right"; angle: number;
      pathRef?: string; positionOnPath?: number; boxWidth?: number; construction?: boolean }
  // projected reference geometry (fixed/linked): the curve is already plain
  // numbers, so resolution is a structural pass-through
  | { type: "projected"; id: string; source: ProjectedSource; curve: ProjectedCurve; stale?: true; construction?: boolean };
