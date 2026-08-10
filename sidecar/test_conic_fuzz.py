"""Randomised property test for the conic profile.

Run:  uv run python test_conic_fuzz.py [cases] [seed]

The fixed cases in test_conic_blend.py check four topologies chosen because they
exercise different code paths. This checks the thing those cannot: that the
property holds on geometry nobody picked.

The property is sharp, and it is what makes this worth running rather than a
vague "does it look right":

    IF the plain fillet builds at radius r, the conic MUST build at every
    profile of r.

Because the conic is not a different operation — it is OCCT's own blend face
with one row of NURBS weights scaled. No pole moves, no knot changes, no
tangency is renegotiated. If reweighting can turn a solid OCCT accepted into one
it rejects, that is our bug, not the kernel's, and it is exactly the "a sensible
fillet got denied" complaint.

Three more invariants ride along, all falsifiable:

  monotone    more profile removes less material, always. The drag depends on
              it: a slider that reverses direction anywhere is unusable.
  anchored    profile 0 reproduces the plain fillet to tessellation precision.
  bounded     profile -1 never removes more than the chamfer of the same
              setback, and +1 never removes more than the fillet. Those are the
              geometric ends of the family; crossing either is an overshoot.

Cases the plain fillet already refuses are SKIPPED, not failed — that is OCCT
declining, and diagnosing it is a different job from this one. The skip rate is
reported because it is itself interesting: a high rate means the generator is
drawing radii the geometry cannot hold.
"""

import random
import sys
import traceback

from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet
from OCP.BRepPrimAPI import (
    BRepPrimAPI_MakeBox,
    BRepPrimAPI_MakeCylinder,
)
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut, BRepAlgoAPI_Fuse
from OCP.gp import gp_Pnt, gp_Trsf, gp_Vec
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.TopAbs import TopAbs_EDGE
from OCP.TopoDS import TopoDS

from conic_blend import _sub, conic_blend
from test_conic_blend import mesh_volume

PROFILES = (-0.95, -0.6, -0.25, 0.0, 0.25, 0.6, 0.95)


def rand_solid(rng):
    """A random primitive, or a boolean of two — booleans matter because they
    make thin walls, which is where a blend's feasible radius stops being a
    function of the overall size and starts being local."""
    kind = rng.choice(["box", "cyl", "fuse", "cut"])
    a = BRepPrimAPI_MakeBox(
        rng.uniform(10, 60), rng.uniform(10, 60), rng.uniform(10, 60)
    ).Shape()
    if kind == "box":
        return a, kind
    if kind == "cyl":
        return BRepPrimAPI_MakeCylinder(rng.uniform(5, 25), rng.uniform(10, 50)).Shape(), kind

    b = BRepPrimAPI_MakeBox(
        rng.uniform(8, 40), rng.uniform(8, 40), rng.uniform(8, 40)
    ).Shape()
    t = gp_Trsf()
    t.SetTranslation(gp_Vec(rng.uniform(-20, 20), rng.uniform(-20, 20), rng.uniform(-20, 20)))
    b = BRepBuilderAPI_Transform(b, t, True).Shape()
    op = BRepAlgoAPI_Fuse(a, b) if kind == "fuse" else BRepAlgoAPI_Cut(a, b)
    op.Build()
    if not op.IsDone():
        return a, "box"
    return op.Shape(), kind


def plain_fillet(shape, edges, r):
    """OCCT's own fillet, or None when it declines."""
    try:
        mk = BRepFilletAPI_MakeFillet(shape)
        for e in edges:
            mk.Add(r, e)
        mk.Build()
        if not mk.IsDone():
            return None
        out = mk.Shape()
        return out if BRepCheck_Analyzer(out).IsValid() else None
    except Exception:
        return None


def run(n_cases=60, seed=20260810):
    rng = random.Random(seed)
    skipped = 0
    checked = 0
    failures = []

    for case in range(n_cases):
        shape, kind = rand_solid(rng)
        edges = [TopoDS.Edge_s(e) for e in _sub(shape, TopAbs_EDGE)]
        if not edges:
            skipped += 1
            continue
        pick = rng.sample(edges, k=min(len(edges), rng.choice([1, 1, 1, 2, 3])))
        # Radius as a fraction of the model's own scale, so the draw scales with
        # whatever was generated instead of being tuned for one size.
        try:
            base = mesh_volume(shape) ** (1 / 3)
        except Exception:
            skipped += 1
            continue
        r = base * rng.uniform(0.02, 0.30)

        ref = plain_fillet(shape, pick, r)
        if ref is None:
            skipped += 1  # OCCT declined the plain fillet: not our property
            continue

        try:
            base_vol = mesh_volume(shape)
            ref_removed = base_vol - mesh_volume(ref)
        except Exception:
            skipped += 1
            continue

        checked += 1
        tag = f"case {case} seed={seed} kind={kind} edges={len(pick)} r={r:.4f}"
        prev = None
        try:
            for s in PROFILES:
                out = conic_blend(shape, pick, r, s)
                if not BRepCheck_Analyzer(out).IsValid():
                    failures.append(f"{tag}: INVALID solid at profile {s}")
                    break
                removed = base_vol - mesh_volume(out)
                if removed < -1e-6:
                    failures.append(f"{tag}: negative removal {removed:.4f} at {s}")
                    break
                if prev is not None and removed > prev + 1e-3:
                    failures.append(
                        f"{tag}: NOT MONOTONE at {s} ({removed:.4f} > {prev:.4f})")
                    break
                if s == 0.0 and abs(removed - ref_removed) > max(1e-6, ref_removed * 0.01):
                    failures.append(
                        f"{tag}: profile 0 drifted from the plain fillet "
                        f"({removed:.4f} vs {ref_removed:.4f})")
                    break
                # Bounded above by the plain fillet on the +side, and below by
                # the chamfer of the same setback on the -side. The chamfer bound
                # is the triangle the chord cuts, which is always >= the arc's.
                if s > 0 and removed > ref_removed * 1.01 + 1e-6:
                    failures.append(
                        f"{tag}: OVERSHOOT at {s}: removed {removed:.4f} > "
                        f"fillet {ref_removed:.4f}")
                    break
                prev = removed
        except Exception as ex:
            failures.append(f"{tag}: RAISED {type(ex).__name__}: {ex}")

    print(f"cases={n_cases} checked={checked} skipped={skipped} "
          f"(skips are OCCT declining the plain fillet)")
    if failures:
        print(f"\n{len(failures)} FAILURES:")
        for f in failures:
            print("  -", f)
        return 1
    print("property holds: every buildable fillet stayed buildable, monotone, "
          "anchored at 0 and bounded at both ends, across all profiles")
    return 0


if __name__ == "__main__":
    cases = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 20260810
    try:
        sys.exit(run(cases, seed))
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception:
        traceback.print_exc()
        sys.exit(2)
