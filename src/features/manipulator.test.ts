import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  createDragHandle,
  HANDLE_CUT,
  HANDLE_HOT,
  HANDLE_IDLE,
  fluentRelease,
  orientOutward,
} from "./manipulator";

describe("orientOutward", () => {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  it("keeps an axis that already points away from the body", () => {
    expect(orientOutward(v(1, 0, 0), v(10, 0, 0), v(0, 0, 0)).x).toBe(1);
  });

  it("flips an axis that points into the material", () => {
    // The actual bug: tangent x cameraForward has an arbitrary sign, so the
    // handle stood outward or buried itself in the solid depending on nothing
    // but which way the camera happened to be facing.
    expect(orientOutward(v(-1, 0, 0), v(10, 0, 0), v(0, 0, 0)).x).toBe(1);
  });

  it("leaves the axis alone when there is no outward to speak of", () => {
    // No bbox yet (empty document), or a handle sitting exactly on the centre:
    // any answer is arbitrary, so don't churn the axis between frames.
    expect(orientOutward(v(-1, 0, 0), null, v(0, 0, 0)).x).toBe(-1);
    expect(orientOutward(v(-1, 0, 0), v(1, 0, 0), null).x).toBe(-1);
    expect(orientOutward(v(-1, 0, 0), v(0, 0, 0), v(0, 0, 0)).x).toBe(-1);
  });

  it("decides on the component along outward, not on the nearest axis", () => {
    // An edge handle is perpendicular to its edge and lies in the screen plane,
    // so it is usually oblique to the centre-to-anchor line. Only the sign of
    // the projection matters.
    const perp = v(0.2, 0.98, 0).normalize();
    expect(orientOutward(perp.clone(), v(0, 5, 0), v(0, 0, 0)).y).toBeGreaterThan(0);
    const inward = v(0.2, -0.98, 0).normalize();
    expect(orientOutward(inward, v(0, 5, 0), v(0, 0, 0)).y).toBeGreaterThan(0);
  });
});

/** Raycast the handle exactly the way every consumer does. */
function pick(group: THREE.Group, x: number, y: number) {
  group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  // Straight down -Z at (x, y): the handle is modelled along +Y in its own
  // frame, so this is "the cursor is x pixels off the axis, y pixels up it".
  ray.set(new THREE.Vector3(x, y, 500), new THREE.Vector3(0, 0, -1));
  return ray.intersectObjects(group.children, false);
}

describe("arrow handle grab volume", () => {
  it("is pickable well off the axis, where the drawn glyph is not", () => {
    // The complaint this exists to fix: the old handle was hit-tested against a
    // 1.6px shaft and a 5px cone, so grabbing it took careful aim. 12px off the
    // stem has to count as a hit even though nothing is drawn there.
    const h = createDragHandle();
    expect(pick(h.group, 0, 30).length).toBeGreaterThan(0); // dead centre
    expect(pick(h.group, 10, 20).length).toBeGreaterThan(0); // off the stem
    expect(pick(h.group, 15, 38).length).toBeGreaterThan(0); // off the head
    h.dispose();
  });

  it("still misses when the cursor is genuinely nowhere near", () => {
    // A grab volume that swallowed the whole viewport would eat clicks meant
    // for the model — the tools rely on a miss to mean "orbit" or "commit".
    const h = createDragHandle();
    expect(pick(h.group, 40, 30)).toHaveLength(0);
    expect(pick(h.group, 0, 140)).toHaveLength(0);
    h.dispose();
  });

  it("keeps the grab volume invisible", () => {
    // It must widen the target without widening the drawn glyph. Three's
    // raycaster tests layers and never `visible`, which is what lets these two
    // requirements coexist — if that ever changed, the handle would silently go
    // back to needing fine aim.
    const h = createDragHandle();
    const drawn = h.group.children.filter(
      (c) => (c as THREE.Mesh).material && ((c as THREE.Mesh).material as THREE.Material).visible,
    );
    expect(drawn).toHaveLength(2); // the blob and its outline, nothing else
    h.dispose();
  });
});

describe("arrow handle paint", () => {
  const bodyOf = (g: THREE.Group) =>
    g.children.find(
      (c) => (c as THREE.Mesh).material instanceof THREE.MeshLambertMaterial,
    ) as THREE.Mesh;

  it("brightens on hover and returns to its tone", () => {
    const h = createDragHandle();
    const m = bodyOf(h.group).material as THREE.MeshLambertMaterial;
    expect(m.color.getHex()).toBe(HANDLE_IDLE);
    h.paint({ hot: true });
    expect(m.color.getHex()).toBe(HANDLE_HOT);
    h.paint({ hot: false });
    expect(m.color.getHex()).toBe(HANDLE_IDLE);
    h.dispose();
  });

  it("wears the cut tone when a push removes material", () => {
    // press/pull flips this with the drag's sign; the colour is the only thing
    // that says which of the two things the same gesture is about to do.
    const h = createDragHandle();
    const m = bodyOf(h.group).material as THREE.MeshLambertMaterial;
    h.paint({ tone: "cut" });
    expect(m.color.getHex()).toBe(HANDLE_CUT);
    h.paint({ hot: true });
    expect(m.color.getHex()).toBe(HANDLE_HOT); // hover still wins
    h.paint({ hot: false });
    expect(m.color.getHex()).toBe(HANDLE_CUT); // ...and hands the tone back
    h.dispose();
  });

  it("keeps the emissive floor in step with the colour", () => {
    // Unlit-from-behind is the common case for a handle standing off a face; if
    // emissive lagged the colour the blob would read as the wrong tone there.
    const h = createDragHandle();
    const m = bodyOf(h.group).material as THREE.MeshLambertMaterial;
    h.paint({ tone: "cut" });
    expect(m.emissive.getHex()).toBe(m.color.getHex());
    h.dispose();
  });

  it("fades the outline faster than the body", () => {
    // The passive offer sits at 55%. A full-strength near-black outline there
    // would make an unaccepted offer the loudest thing on screen.
    const h = createDragHandle();
    h.paint({ opacity: 0.55 });
    const mats = h.group.children
      .map((c) => (c as THREE.Mesh).material as THREE.Material)
      .filter((m) => m && m.visible);
    const opacities = mats.map((m) => (m as THREE.MeshBasicMaterial).opacity).sort();
    expect(opacities[0]).toBeLessThan(opacities[1]!);
    h.dispose();
  });
});

describe("fluentRelease", () => {
  it("leaves a gesture that began on the tool's own gizmo armed", () => {
    // The classic flow: grab, scrub, let go, adjust, click to commit. Releasing
    // the handle there has never meant "done" and must not start meaning it.
    expect(fluentRelease({ fluent: false, moved: true, meaningful: true })).toBe("stay");
    expect(fluentRelease({ fluent: false, moved: false, meaningful: false })).toBe("stay");
  });

  it("commits a fluent drag that actually went somewhere", () => {
    // One press: press the passive handle, drag, release, done. Leaving the
    // tool armed after that would strand the user in a mode they never entered.
    expect(fluentRelease({ fluent: true, moved: true, meaningful: true })).toBe("commit");
  });

  it("stays armed when a fluent press never travelled", () => {
    // A click on the arrow is not a drag. Committing here would drop a default
    // 2 mm fillet on a stray click — and staying armed is what makes clicking
    // the handle a way IN to the full tool.
    expect(fluentRelease({ fluent: true, moved: false, meaningful: true })).toBe("stay");
  });

  it("cancels a fluent drag that ended back at nothing", () => {
    // Dragging out and back to zero is how you back out of a gesture you did
    // not mean to start. Staying armed would trap exactly that user in the tool
    // they were trying to leave.
    expect(fluentRelease({ fluent: true, moved: true, meaningful: false })).toBe("cancel");
  });

  it("never commits without both a fluent grab and real movement", () => {
    for (const moved of [true, false]) {
      for (const meaningful of [true, false]) {
        expect(fluentRelease({ fluent: false, moved, meaningful })).not.toBe("commit");
      }
    }
    expect(fluentRelease({ fluent: true, moved: false, meaningful: true })).not.toBe("commit");
  });
});
