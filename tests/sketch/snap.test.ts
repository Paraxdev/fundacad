import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { snap, candidatesFromEntities, type SnapCandidate } from "../../src/sketch/snap";

const v = (x: number, y: number) => new THREE.Vector2(x, y);
const screen = (p: THREE.Vector2) => ({ x: p.x, y: p.y }); // 1px = 1 unit for the test

describe("snap", () => {
  const cands: SnapCandidate[] = [
    { p: v(10, 0), kind: "endpoint", priority: 100 },
    { p: v(10.3, 0), kind: "midpoint", priority: 80 },
  ];
  it("snaps to a candidate within pixel tolerance, higher priority winning", () => {
    const r = snap(v(10.2, 0), cands, screen, 1, 10);
    expect(r.kind).toBe("endpoint");
    expect(r.point.x).toBe(10);
  });
  it("falls back to the grid when no candidate is near", () => {
    const r = snap(v(4.9, 5.1), [], screen, 5, 10);
    expect(r.kind).toBe("grid");
    expect(r.point.x).toBe(5);
    expect(r.point.y).toBe(5);
  });
  // The grid is made of LINES, and it used to snap only to where two of them
  // cross: both axes were rounded and then one distance was measured to the
  // resulting corner, so the cursor had to be within tolerance in both axes at
  // once. Between two intersections, on a grid line, nothing snapped, which is
  // most of a grid line.
  it("snaps to a grid line when only one axis is near it", () => {
    // 2px from the x = 100 line, and 40 units from any horizontal line: the
    // cursor is on the line and nowhere near a crossing.
    const r = snap(v(98, 130), [], screen, 100, 10);
    expect(r.kind).toBe("grid");
    expect(r.point.x).toBe(100); // pulled onto the line
    expect(r.point.y).toBe(130); // and left alone along it
  });

  it("snaps the other axis the same way", () => {
    const r = snap(v(130, 98), [], screen, 100, 10);
    expect(r.kind).toBe("grid");
    expect(r.point.x).toBe(130);
    expect(r.point.y).toBe(100);
  });

  it("still snaps to an intersection when both axes are near one", () => {
    // Which is now the case where both axes fired, rather than a separate rule.
    const r = snap(v(98, 103), [], screen, 100, 10);
    expect(r.kind).toBe("grid");
    expect(r.point.x).toBe(100);
    expect(r.point.y).toBe(100);
  });

  it("leaves a point that is near no grid line alone", () => {
    const r = snap(v(150, 160), [], screen, 100, 10);
    expect(r.kind).toBe("free");
    expect(r.point.x).toBe(150);
    expect(r.point.y).toBe(160);
  });

  it("measures the tolerance on SCREEN, through a rotated plane", () => {
    // Lock to Plane can be off, and then a sketch axis is not a screen axis. The
    // gap has to be the distance between the two projected points, not a
    // difference in screen x: at 45 degrees a 10-unit move along a sketch axis
    // is ~14px on screen and must fall outside a 10px tolerance.
    const k = Math.SQRT1_2;
    const rot = (p: THREE.Vector2) => ({ x: (p.x - p.y) * k, y: (p.x + p.y) * k });
    expect(snap(v(92, 130), [], rot, 100, 10).kind).toBe("grid"); // 8 units ~ 8px
    expect(snap(v(88, 130), [], rot, 100, 10).kind).toBe("free"); // 12 units ~ 12px
  });

  it("returns the raw point (free) when grid snapping is off", () => {
    const r = snap(v(3.3, 7.7), [], screen, 0, 10);
    expect(r.kind).toBe("free");
    expect(r.point.x).toBeCloseTo(3.3);
  });
  it("returns free when a candidate exists but is beyond tolerance", () => {
    const r = snap(v(100, 100), cands, screen, 0, 10);
    expect(r.kind).toBe("free");
  });
});

describe("candidatesFromEntities", () => {
  it("emits endpoints + midpoint for a line", () => {
    const c = candidatesFromEntities([{ type: "line", id: "l", x1: 0, y1: 0, x2: 10, y2: 0 }]);
    expect(c).toHaveLength(3);
    expect(c.find((x) => x.kind === "midpoint")!.p.x).toBe(5);
  });
  it("emits 4 corners + center + 4 edge midpoints for a rectangle", () => {
    const c = candidatesFromEntities([{ type: "rectangle", id: "r", width: 20, height: 10, x: 0, y: 0 }]);
    expect(c.filter((x) => x.kind === "endpoint")).toHaveLength(4);
    expect(c.filter((x) => x.kind === "center")).toHaveLength(1);
    expect(c.filter((x) => x.kind === "midpoint")).toHaveLength(4);
  });
  it("emits the center for a circle and a strong point for a point", () => {
    expect(candidatesFromEntities([{ type: "circle", id: "c", radius: 5, x: 1, y: 2 }])[0]!.kind).toBe("center");
    const pt = candidatesFromEntities([{ type: "point", id: "p", x: 3, y: 4 }]);
    expect(pt[0]!.priority).toBe(110);
  });
  it("handles arc and spline fit points", () => {
    const arc = candidatesFromEntities([{ type: "arc", id: "a", x1: 0, y1: 0, x2: 4, y2: 0, mx: 2, my: 2 }]);
    expect(arc).toHaveLength(3);
    const sp = candidatesFromEntities([{ type: "spline", id: "s", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }] }]);
    expect(sp).toHaveLength(3);
  });
});

describe("candidatesFromEntities — projected reference geometry", () => {
  it("a projected line snaps like a native one: endpoints 100, midpoint 80", () => {
    const c = candidatesFromEntities([{
      type: "projected", id: "p1",
      source: { kind: "edge", body: "body1", sel: { kind: "edge", by: "match", fp: { mid: [0, 0, 0], dir: [1, 0, 0] } } },
      curve: { kind: "line", x1: 0, y1: 0, x2: 10, y2: 0 },
    }]);
    expect(c.filter((x) => x.kind === "endpoint" && x.priority === 100)).toHaveLength(2);
    const mid = c.find((x) => x.kind === "midpoint")!;
    expect(mid.priority).toBe(80);
    expect(mid.p.x).toBe(5);
  });

  it("a projected circle exposes its center (90); a poly has strong ends and weak interior vertices", () => {
    const circle = candidatesFromEntities([{
      type: "projected", id: "pc",
      source: { kind: "silhouette", body: "body1" },
      curve: { kind: "circle", x: 3, y: 4, r: 5 },
    }]);
    expect(circle).toHaveLength(1);
    expect(circle[0]!.kind).toBe("center");
    expect(circle[0]!.priority).toBe(90);

    const poly = candidatesFromEntities([{
      type: "projected", id: "pp",
      source: { kind: "silhouette", body: "body1" },
      curve: { kind: "poly", pts: [[0, 0], [1, 1], [2, 0], [3, 1]] },
    }]);
    expect(poly.filter((x) => x.priority === 100)).toHaveLength(2); // real ends
    expect(poly.filter((x) => x.priority === 60)).toHaveLength(2); // sample vertices
  });
});
