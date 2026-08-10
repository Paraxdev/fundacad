"""Conic-profile edge blends — the fillet/chamfer family as one continuous knob.

A circular fillet and a 45-degree chamfer are the two ends of a single family of
sections, and MCAD kernels that expose it (Parasolid's `rho`, Shapr3D's profile
slider) let you slide between them without changing the feature. OCCT does not:
`BRepFilletAPI_MakeFillet` offers a radius and nothing about the section's shape
(`ChFi3d_FilletShape` picks how the CIRCLE is approximated, not what curve to
use), and its blend functions are circular, chamfer or ruled only.

But it does not need to offer it, because of one fact about circular arcs:

    an arc of sweep theta IS a rational quadratic Bezier with poles
    (P1, apex, P2) and middle weight cos(theta / 2)

and OCCT builds its blend faces out of exactly those arcs. Convert a blend face
to NURBS and it comes back degree 2 across the section with three pole rows and
that weight sitting in the middle. So the whole conic family is reachable by
scaling one row of weights — no lofting, no fitting, no surface of our own:

    profile  0  ->  k = 1        the circular fillet, untouched
    profile -1  ->  k = 0        the chord: a chamfer
    profile +1  ->  k = infinity the control polygon: no blend, a sharp corner

with `k` below. Two properties make this worth doing the awkward way round
(fillet first, then reweight) rather than building blend surfaces directly:

  * No pole moves and no knot changes, so the tangency curves onto the supporting
    faces are bit-identical to OCCT's and every pcurve stays valid. We inherit
    OCCT's tangency, its handling of tangent chains, and its corner patches.
  * A spherical corner patch is the tensor product of two arcs — its weights are
    the outer product of (1, cos(theta/2), 1) with itself — so scaling every
    middle weight converts tubes and corners by the same rule, and the shared
    boundaries still agree because both sides scaled identically.

What we DO have to repair: an edge running across a section moves (its arc
becomes a conic). Its pcurve is still right, so the new 3D curve is recovered
from (pcurve, new surface), which is the definition of the curve we want.

The one shape of geometry this argument does not reach, and why: it holds
because every boundary of a blend face is either a tangency rail (an arc END
pole, which does not move) or a whole section (which moves inside its own plane,
so its pcurve still describes it). A boolean can leave a blend face bounded a
third way — cut clean through by a face that is neither, when the blend runs off
the end of one of its supports and is trimmed by whatever it hits. That trim is
a genuine surface/surface intersection, so it lands on a different pcurve once
the section changes shape, and its corner vertices move with it (measured: on a
4.8mm blend, up to 2.8mm at profile 0.95). Re-cutting it is a different
operation from reweighting, so such a blend is refused rather than approximated
— see `ConicNotApplicable`.

Caveat for callers: `BRepGProp.VolumeProperties` integrates in parameter space
and is unreliable on these surfaces at large |profile| — weights spanning two
orders of magnitude defeat its quadrature. It reported a blend that removes ~2mm3
of a box as removing 450mm3. Measure such solids from the tessellation instead;
the geometry is exact, the integrator is not.
"""

from OCP.BRep import BRep_Tool, BRep_Builder
from OCP.BRepAdaptor import BRepAdaptor_Curve2d
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge
from OCP.BRepCheck import BRepCheck_Analyzer
from OCP.BRepFilletAPI import BRepFilletAPI_MakeFillet
from OCP.BRepLib import BRepLib
from OCP.BRepTools import BRepTools, BRepTools_ReShape
from OCP.Geom import Geom_RectangularTrimmedSurface
from OCP.GeomConvert import GeomConvert
from OCP.ShapeFix import ShapeFix_Shape
from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE, TopAbs_WIRE
from OCP.TopExp import TopExp
from OCP.TopLoc import TopLoc_Location
from OCP.TopoDS import TopoDS, TopoDS_Face
from OCP.TopTools import TopTools_IndexedMapOfShape

TOL = 1e-7

#: Below this, a profile is the plain circular fillet. Not a nicety: k == 1 makes
#: every step here a no-op, so routing it to OCCT's own result skips the rebuild
#: entirely and keeps the common case exactly as robust as it was.
PROFILE_EPS = 1e-6

#: The slider is open at both ends — a profile of exactly 1 is a sharp corner (no
#: feature at all) and exactly -1 is a degenerate zero weight. Clamp inside.
PROFILE_LIMIT = 0.999


class ConicNotApplicable(ValueError):
    """This blend is not a member of the conic family, at any profile.

    Its own class rather than a bare ValueError because callers must tell it
    apart from "we tried and broke it". Nothing is wrong with the fillet, the
    solid or the request — the reweighting identity simply does not describe
    this face, so the only honest answers are the plain fillet or nothing. A
    caller that catches this can fall back to profile 0; a caller that catches
    ValueError generally is catching real breakage as well.
    """


def clamp_profile(p):
    """Hold a profile inside the open interval the maths is defined on."""
    try:
        v = float(p)
    except (TypeError, ValueError):
        return 0.0
    if v != v:  # NaN
        return 0.0
    return max(-PROFILE_LIMIT, min(PROFILE_LIMIT, v))


def weight_scale(profile):
    """Middle-weight multiplier for a profile in (-1, 1).

    Deliberately independent of the corner angle: the angle is already baked into
    the weight being scaled (it IS cos(theta/2)), so one factor is correct for a
    90-degree box edge and a shallow one alike. That is what lets a single number
    drive every blend face of a feature, including its corner patches.
    """
    p = clamp_profile(profile)
    return (1.0 + p) if p <= 0 else 1.0 / (1.0 - p)


def _sub(shape, kind):
    m = TopTools_IndexedMapOfShape()
    TopExp.MapShapes_s(shape, kind, m)
    return [m.FindKey(i) for i in range(1, m.Size() + 1)]


def _nurbs_of(face):
    """The face's surface as a BSpline over exactly the face's own UV box."""
    surf = BRep_Tool.Surface_s(face)
    u0, u1, v0, v1 = BRepTools.UVBounds_s(face)
    return GeomConvert.SurfaceToBSplineSurface_s(
        Geom_RectangularTrimmedSurface(surf, u0, u1, v0, v1))


def _arc_dirs(bs):
    """Which parameter directions carry a single rational quadratic arc.

    Degree 2, three poles, and the (1, cos(theta/2), 1) signature. A tube blend
    has one such direction; a spherical corner patch has both. A toroidal blend's
    spine is a FULL circle and so has six poles — which is why the test is on the
    pole structure and not merely "is this direction quadratic".
    """
    out = []
    for along_u in (True, False):
        deg = bs.UDegree() if along_u else bs.VDegree()
        n = bs.NbUPoles() if along_u else bs.NbVPoles()
        if deg != 2 or n != 3:
            continue
        w = (lambda i: bs.Weight(i, 1)) if along_u else (lambda j: bs.Weight(1, j))
        if abs(w(1) - w(3)) < 1e-9 and w(2) < w(1) - 1e-9:
            out.append(along_u)
    return out


def _reweight(bs, along_u, k):
    """Scale the middle pole row. Mutates `bs` in place."""
    if along_u:
        for j in range(1, bs.NbVPoles() + 1):
            bs.SetWeight(2, j, bs.Weight(2, j) * k)
    else:
        for i in range(1, bs.NbUPoles() + 1):
            bs.SetWeight(i, 2, bs.Weight(i, 2) * k)


def _blend_faces(sharp, mk, result):
    """Result faces that are not descendants of an input face — the blend."""
    kept = []
    for f in _sub(sharp, TopAbs_FACE):
        kept += list(mk.Modified(f))
        if not mk.IsDeleted(f):
            kept.append(f)
    return [TopoDS.Face_s(f) for f in _sub(result, TopAbs_FACE)
            if not any(f.IsSame(k) for k in kept)]


def _reskin(face, newsurf):
    """The same face on a new surface: same wires, same edges, same pcurves.

    Sound only because reweighting leaves the UV domain alone — every pcurve
    already on these edges still describes the right curve against the new
    surface, so the shell still closes and the neighbours never notice.
    """
    b = BRep_Builder()
    nf = TopoDS_Face()
    b.MakeFace(nf, newsurf, TopLoc_Location(), TOL)
    for w in _sub(face, TopAbs_WIRE):
        for e in _sub(w, TopAbs_EDGE):
            edge = TopoDS.Edge_s(e)
            pc = BRep_Tool.CurveOnSurface_s(edge, face, 0.0, 0.0)
            if pc is not None:
                b.UpdateEdge(edge, pc, nf, TOL)
        b.Add(nf, TopoDS.Wire_s(w))
    nf.Orientation(face.Orientation())
    return nf


def _moved_edges(face, oldsurf, newsurf, samples=12):
    """Edges of this face whose 3D curve moved under the reweight.

    Measured rather than reasoned about: evaluate the (unchanged) pcurve on both
    surfaces and see if the point moved. Deciding instead by "which iso is the
    section" would have to be right for cylinders, tori and sphere patches
    separately, and each of those puts the section on a different parameter.
    """
    out = []
    for e in _sub(face, TopAbs_EDGE):
        edge = TopoDS.Edge_s(e)
        ad = BRepAdaptor_Curve2d(edge, face)
        a, z = ad.FirstParameter(), ad.LastParameter()
        for i in range(samples + 1):
            uv = ad.Value(a + (z - a) * i / samples)
            if oldsurf.Value(uv.X(), uv.Y()).Distance(
                    newsurf.Value(uv.X(), uv.Y())) > 1e-9:
                out.append(edge)
                break
    return out


def _extent(bs):
    """How big this blend face is, from its control polygon.

    A local length to judge gaps against, so the judgement travels: the same
    blend modelled in metres and in millimetres has to be called the same thing.
    The poles bound the surface, and reading them costs nothing next to sampling
    it.
    """
    lo = [1e300] * 3
    hi = [-1e300] * 3
    for i in range(1, bs.NbUPoles() + 1):
        for j in range(1, bs.NbVPoles() + 1):
            p = bs.Pole(i, j)
            for c, x in enumerate((p.X(), p.Y(), p.Z())):
                lo[c], hi[c] = min(lo[c], x), max(hi[c], x)
    return max(TOL, sum((hi[c] - lo[c]) ** 2 for c in range(3)) ** 0.5)


def _rebuild_edge(edge, face, newsurf):
    """The edge's 3D curve recovered from its pcurve on the new surface."""
    ad = BRepAdaptor_Curve2d(edge, face)
    pc = BRep_Tool.CurveOnSurface_s(edge, face, 0.0, 0.0)
    p1, p2 = ad.FirstParameter(), ad.LastParameter()
    head, tail = pc.Value(p1), pc.Value(p2)
    start = newsurf.Value(head.X(), head.Y())
    end = newsurf.Value(tail.X(), tail.Y())

    # Reuse the original vertices — a section's endpoints are corner poles, and
    # corner poles do not move, so the neighbouring faces still meet us exactly
    # there. Pair them by POSITION: an edge's stored first/last follow its own
    # curve, which need not agree with its sense inside this wire, and getting
    # that backwards fails the build with DifferentsPointAndParameter.
    #
    # Score the two assignments whole rather than asking only "which vertex is
    # nearer the start". On a short section the two vertices can sit closer to
    # each other than either is to the wrong end, and the one-sided test then
    # picks by a difference that is pure rounding; using both ends makes the
    # decision the sum of two agreements, which no near-coincidence can flip.
    v1, v2 = TopExp.FirstVertex_s(edge), TopExp.LastVertex_s(edge)
    a, b = BRep_Tool.Pnt_s(v1), BRep_Tool.Pnt_s(v2)
    if (a.Distance(start) + b.Distance(end)
            > b.Distance(start) + a.Distance(end)):
        v1, v2 = v2, v1
        a, b = b, a

    # A corner that no longer lands on the new surface is one of two completely
    # different things, and the size of the gap is what tells them apart.
    #
    # Round-off, if it is a millionth of the face: a section endpoint sits on an
    # END pole, which no reweight moves, but it sits there through a pcurve
    # value and a UV box that were each rounded once, so it can land a hair
    # inside the arc — where the reweight does move it, by a hair times k. That
    # is a tolerance, and OCCT already has the word for "the curves meet here,
    # within this much": the vertex's own tolerance. Widen it and carry on,
    # rather than refusing a corner blend over a nanometre.
    #
    # Otherwise the blend is being cut across its section by something that had
    # to be re-intersected (see the module docstring), and no tolerance can
    # honestly cover that — the same corner walks millimetres as the profile
    # sweeps. Refuse by name, here where the measurement is in hand, instead of
    # letting MakeEdge report a bare DifferentsPointAndParameter that explains
    # none of it. The two are orders of magnitude apart in practice: measured
    # 1e-6 of the face for round-off against 0.2 of it for a real cut.
    scale = _extent(newsurf)
    for v, p, q in ((v1, a, start), (v2, b, end)):
        gap = p.Distance(q)
        if gap <= max(BRep_Tool.Tolerance_s(v), TOL):
            continue
        if gap > scale * 1e-4:
            raise ConicNotApplicable(
                "this blend is cut across its section by a neighbouring face, "
                "so its trim would have to be recomputed rather than reweighted "
                f"(a corner moves {gap:.4g}) — use profile 0 here")
        BRep_Builder().UpdateVertex(TopoDS.Vertex_s(v), gap * 2.0)

    mk = BRepBuilderAPI_MakeEdge(pc, newsurf, v1, v2, p1, p2)
    if not mk.IsDone():
        raise ValueError(f"could not rebuild a blend section edge ({mk.Error()})")
    ne = mk.Edge()
    BRepLib.BuildCurve3d_s(ne, TOL)
    ne.Orientation(edge.Orientation())
    return ne


def conic_blend(sharp, edges, radius, profile):
    """Blend `edges` of the solid `sharp` at `radius` with a conic profile.

    `sharp` and `edges` are raw TopoDS; the result is a raw TopoDS_Shape. A
    profile of 0 returns OCCT's own fillet untouched.
    """
    k = weight_scale(profile)

    mk = BRepFilletAPI_MakeFillet(sharp)
    for e in edges:
        mk.Add(radius, e)
    mk.Build()
    if not mk.IsDone():
        raise ValueError("fillet failed")
    filleted = mk.Shape()
    if abs(k - 1.0) < PROFILE_EPS:
        return filleted

    # Pass 1: swap each blend face's surface, keeping wires, edges and pcurves.
    reshape = BRepTools_ReShape()
    stale = []
    for face in _blend_faces(sharp, mk, filleted):
        bs = _nurbs_of(face)
        dirs = _arc_dirs(bs)
        if not dirs:
            # A blend face whose section is not a single quadratic arc — an arc
            # wider than a half turn, or a BSpline blend between curved supports.
            # Reweighting has no meaning there, and silently leaving it circular
            # would ship a feature that is conic on some edges and not others.
            raise ConicNotApplicable(
                "this edge's blend has no conic profile — use profile 0 for a "
                "plain fillet here")
        for along_u in dirs:
            _reweight(bs, along_u, k)
        stale += [(e, face, bs)
                  for e in _moved_edges(face, BRep_Tool.Surface_s(face), bs)]
        reshape.Replace(face, _reskin(face, bs))
    out = reshape.Apply(filleted)

    # Pass 2: rebuild the section boundaries, which are the only curves that
    # moved. With one blend face SameParameter could absorb the change against
    # the neighbouring plane; where two blend faces meet, both sides moved and
    # there is nothing left to reconcile against, so the tolerance blows out and
    # the shell falls apart. One representative face per edge is enough — where
    # two blend faces share it they agree, that being the point of moving no pole.
    seen = []
    reshape2 = BRepTools_ReShape()
    for edge, face, bs in stale:
        if any(edge.IsSame(s) for s in seen):
            continue
        seen.append(edge)
        reshape2.Replace(edge, _rebuild_edge(edge, face, bs))
    out = reshape2.Apply(out)

    fix = ShapeFix_Shape(out)
    fix.SetPrecision(TOL)
    fix.Perform()
    out = fix.Shape()
    BRepLib.SameParameter_s(out, TOL, True)

    if not BRepCheck_Analyzer(out).IsValid():
        raise ValueError(
            f"the conic profile produced an invalid solid at profile {profile:g}")
    return out
