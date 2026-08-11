"""Press/Pull on curved faces.

Run:  python test_presspull.py

The operation used to accept planes and cylinders and refuse every other
surface, on the stated grounds that OCCT's offset was too unreliable elsewhere
to risk taking the sidecar down. That was measured and is not what happens —
see the docstring on _press_pull for the subprocess probe. These tests hold the
widened behaviour, and more importantly they hold the thing that REPLACED the
type gate: the operation checking its own result.

The case that matters most to a user is the torus. A fillet on a round edge is
a toroidal face, so "blend a part, then adjust the blend by dragging it" was
exactly the workflow the old whitelist refused — while telling the user the
tool "supports flat and cylindrical faces only", which reads as a permanent
limitation rather than something to work around.
"""

import sys
import traceback

from build123d import GeomType, Plane, Solid, Wire

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


def test_a_freeform_face():
    """A swept freeform (BSPLINE) offsets in both directions. This is the type
    the old comment was really about, and it is the one whose success means the
    replacement cannot be another whitelist."""
    from build123d import Face, Spline

    s = Solid.sweep(Face(Wire.make_circle(4)), Spline((0, 0, 0), (4, 0, 10), (0, 0, 20)))
    f = _one(s, GeomType.BSPLINE)
    ok, v0, v1 = _pulled(s, f, 1.0)
    assert ok and v1 > v0, f"outward: valid={ok} {v0} -> {v1}"
    ok, v0, v2 = _pulled(s, _one(s, GeomType.BSPLINE), -1.0)
    assert ok and v2 < v0, f"inward: valid={ok} {v0} -> {v2}"
    print(f"swept freeform OK: {v2:.1f} < {v0:.1f} < {v1:.1f}")


def test_an_impossible_offset_is_refused_not_crashed():
    """The replacement for the type gate has to hold the same line the gate did:
    nothing invalid reaches the document, and nothing takes the process down.

    A loft between a circle and a square is the case that genuinely cannot be
    offset — it must come back as a ValueError carrying a sentence, not as a
    segfault and not as a solid that fails a boolean three operations later."""
    a = Wire.make_circle(10)
    b = Wire.make_rect(12, 12, Plane.XY.offset(20))
    s = Solid.make_loft([a, b])
    f = _one(s, GeomType.BSPLINE)
    try:
        out = _press_pull(s, f, 1.0)
    except ValueError as ex:
        assert str(ex).strip(), "refused with an empty message"
        print(f"impossible offset refused OK: {ex}")
        return
    # If some OCCT version manages it, the result still has to be valid — the
    # point is the guarantee, not which branch delivers it.
    assert BRepCheck_Analyzer(out.wrapped).IsValid(), (
        "an offset succeeded but produced an invalid solid — the result check "
        "that replaced the type whitelist is not doing its job")
    print("impossible offset actually succeeded, and validly")


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
        test_a_freeform_face()
        test_an_impossible_offset_is_refused_not_crashed()
        test_a_flat_face_still_takes_the_prism_path()
        print("\nall press/pull tests passed")
    except Exception:
        traceback.print_exc()
        sys.exit(1)
