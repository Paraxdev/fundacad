"""Press/Pull on curved faces.

Run:  python test_presspull.py

The operation used to accept planes and cylinders and refuse every other
surface. That was too narrow in one direction and, it turned out, exactly right
in another, so these tests pin BOTH edges of the line.

Too narrow: every ANALYTIC curved surface offsets cleanly — cone, sphere,
torus. The one that matters most to a user is the torus, because a fillet on a
round edge is a toroidal face; "blend a part, then adjust the blend by dragging
it" was refused outright, with a message that read as a permanent limitation.

Right: FREEFORM surfaces are not merely unreliable, they crash. A swept BSPLINE
offsets fine at +-1mm and dies with an access violation at +-8mm and +-20mm.
The first version of this change probed only +-1.5mm, concluded that nothing
crashes, and shipped — and a -20mm cut then killed a worker mid-rebuild. Hence
test_the_large_offsets_that_killed_a_worker, which runs out of process so that
a crash is a return code rather than the end of the test run, and hence the
rule that a surface joins OFFSETTABLE_CURVED only on evidence at LARGE offsets.
"""

import _bootstrap  # noqa: F401  (puts sidecar/ on sys.path)

import sys
import traceback

from build123d import GeomType, Solid, Wire

from builder import _press_pull
from test_conic_blend import mesh_volume

from OCP.BRepCheck import BRepCheck_Analyzer


def _one(shape, kind):
    """The first face of `shape` with surface type `kind`."""
    for f in shape.faces():
        if f.geom_type == kind:
            return f
    raise AssertionError(f"no {kind} face on this shape")


def _pulled(shape, face, d):
    """Press/pull and return (valid, volume before, volume after)."""
    v0 = mesh_volume(shape.wrapped)
    out = _press_pull(shape, face, d)
    return BRepCheck_Analyzer(out.wrapped).IsValid(), v0, mesh_volume(out.wrapped)


def test_the_blend_face_of_a_filleted_part():
    """The regression this whole change is about.

    Filleting a cylinder's rim makes a TORUS face. Under the old whitelist,
    dragging it reported "Press/Pull supports flat and cylindrical faces only" —
    on a face the kernel offsets without complaint."""
    s = Solid.make_cylinder(12, 24)
    s = s.fillet(3, s.edges().filter_by(GeomType.CIRCLE))
    f = _one(s, GeomType.TORUS)
    ok, v0, v1 = _pulled(s, f, 1.5)
    assert ok, "offsetting the blend face produced an invalid solid"
    assert v1 > v0, f"pulling the blend outward did not add material ({v0} -> {v1})"
    print(f"filleted rim (torus) OK: {v0:.1f} -> {v1:.1f}")


def test_the_analytic_curved_surfaces():
    """Cone, sphere and torus: all offset to valid solids, both of the shapes a
    user actually has to hand. Each is a separate case because a whitelist that
    grew one entry at a time is how the old one ended up two long."""
    cases = [
        ("cone", Solid.make_cone(12, 5, 20), GeomType.CONE),
        ("sphere", Solid.make_sphere(15), GeomType.SPHERE),
        ("torus", Solid.make_torus(20, 6), GeomType.TORUS),
    ]
    for name, s, kind in cases:
        ok, v0, v1 = _pulled(s, _one(s, kind), 1.5)
        assert ok, f"{name}: invalid solid"
        assert v1 > v0, f"{name}: outward pull did not add material ({v0} -> {v1})"
        print(f"  {name} OK: {v0:.1f} -> {v1:.1f}")


def test_a_freeform_face_is_refused_because_it_crashes():
    """A freeform face must be refused, and the reason is not caution.

    This is the regression test for a worker that died mid-rebuild. Offsetting a
    swept BSPLINE by +-1mm works, which is exactly what makes this look like a
    case for a magnitude cap; at +-8mm and +-20mm the same face takes the process
    down with an access violation, in both directions. The threshold depends on
    the surface's own local curvature, which nothing here can bound, and being
    wrong costs a crash while refusing costs a sentence."""
    from build123d import Face, Spline

    s = Solid.sweep(Face(Wire.make_circle(4)), Spline((0, 0, 0), (4, 0, 10), (0, 0, 20)))
    f = _one(s, GeomType.BSPLINE)
    try:
        _press_pull(s, f, 1.0)
    except ValueError as ex:
        assert "freeform" in str(ex), f"refusal should name the reason, got: {ex}"
        print(f"freeform refused OK: {ex}")
        return
    raise AssertionError(
        "a freeform face was accepted — small offsets succeed, so this passes "
        "until a user picks a big one and the worker dies")


def test_the_large_offsets_that_killed_a_worker():
    """The magnitudes, not just the types.

    The first version of this change was probed at +-1.5mm only and concluded
    that nothing crashes. A -20mm cut then killed a worker in the field. Every
    surface on the permitted list is therefore held to surviving an offset far
    larger than its own features, run OUT OF PROCESS so that a crash is a return
    code here rather than the end of this test run."""
    import subprocess

    runner = (
        "import sys; sys.path.insert(0, r'{cwd}')\n"
        "from build123d import *\n"
        "{setup}\n"
        "from builder import _press_pull\n"
        "try:\n"
        "    _press_pull(s, f, {d})\n"
        "except ValueError:\n"
        "    pass\n"
        "print('SURVIVED')\n"
    )
    cases = {
        "sphere": "s = Solid.make_sphere(15)\nf = [x for x in s.faces() if x.geom_type == GeomType.SPHERE][0]",
        "torus": "s = Solid.make_torus(20, 6)\nf = [x for x in s.faces() if x.geom_type == GeomType.TORUS][0]",
        "blend": ("s = Solid.make_cylinder(12, 24)\n"
                  "s = s.fillet(3, s.edges().filter_by(GeomType.CIRCLE))\n"
                  "f = [x for x in s.faces() if x.geom_type == GeomType.TORUS][0]"),
        "freeform": ("s = Solid.sweep(Face(Wire.make_circle(4)), Spline((0,0,0),(4,0,10),(0,0,20)))\n"
                     "f = [x for x in s.faces() if x.geom_type == GeomType.BSPLINE][0]"),
    }
    import os

    cwd = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for name, setup in cases.items():
        for d in (-20.0, 20.0):
            src = runner.format(cwd=cwd, setup=setup, d=d)
            p = subprocess.run([sys.executable, "-c", src], capture_output=True,
                               text=True, timeout=300)
            assert p.returncode == 0 and "SURVIVED" in p.stdout, (
                f"{name} at {d:+.0f}mm did not survive: rc={p.returncode} "
                f"(a non-zero code here is a dead worker, not a failed feature)")
        print(f"  {name} survived +-20mm")


def test_an_impossible_offset_is_refused_not_crashed():
    """An offset the kernel accepts the shape of but cannot complete must come
    back as a ValueError carrying a sentence — not as a solid that fails a
    boolean three operations later, where nothing connects it to what the user
    did. A sphere pushed inward by more than its own radius is that case."""
    s = Solid.make_sphere(10)
    f = _one(s, GeomType.SPHERE)
    try:
        out = _press_pull(s, f, -30.0)
    except ValueError as ex:
        assert str(ex).strip(), "refused with an empty message"
        print(f"impossible offset refused OK: {ex}")
        return
    assert BRepCheck_Analyzer(out.wrapped).IsValid(), (
        "an offset succeeded but produced an invalid solid — the result check "
        "in _offset_faces is not doing its job")
    print("that offset actually succeeded, and validly")


def test_a_flat_face_still_takes_the_prism_path():
    """Planar faces must NOT quietly migrate to the offset path. The prism
    boolean is deliberate: BRepOffset segfaults on faceted and split imported
    faces, which is most of what an imported body is made of."""
    s = Solid.make_box(20, 20, 20)
    f = _one(s, GeomType.PLANE)
    ok, v0, v1 = _pulled(s, f, 5.0)
    assert ok, "planar press/pull produced an invalid solid"
    assert abs((v1 - v0) - 20 * 20 * 5) < 1.0, f"expected +2000mm3, got {v1 - v0:.1f}"
    print(f"planar face OK: {v0:.1f} -> {v1:.1f}")


if __name__ == "__main__":
    try:
        test_the_blend_face_of_a_filleted_part()
        test_the_analytic_curved_surfaces()
        test_a_freeform_face_is_refused_because_it_crashes()
        test_the_large_offsets_that_killed_a_worker()
        test_an_impossible_offset_is_refused_not_crashed()
        test_a_flat_face_still_takes_the_prism_path()
        print("\nall press/pull tests passed")
    except Exception:
        traceback.print_exc()
        sys.exit(1)
