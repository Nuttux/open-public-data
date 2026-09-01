"""base/heroes.qc + base/heroes.json — the authored register, extended.

    python3 pipeline/scripts/us_sf_places/emit_heroes.py
    python3 pipeline/scripts/us_sf_places/emit_heroes.py --check   verify only

THE SIDECAR PATTERN, and it is `emit_places.py`'s own, for its own reason.
`encode_city_chunks.py` owns the mock's payloads and its re-runs must stay
byte-identical, and the eleven heroes it ships come out of
`scratchpad/sf-city-anim/wonder/hero-data.js`. The heroes this file adds are
not in the mock at all. So: its own script, its own seed, the SHARED
`_chunk.ChunkWriter` so the container is the same container, and a
read-modify-write of the manifest so the provenance lands where everybody
else's does.

It is a MERGE, not a rewrite. It reads the eleven off the shipped chunk, keys
on `k`, replaces or appends, and writes the whole register back in one shape
`data.ts` already knows how to read (`landmarks()` asserts
`heroes.json.heroes.length === chunk.bi.length` and that `meta.b === bi[q]`,
which is the invariant this file has to keep). Re-running it is idempotent.

THE TRAP, and it is the same one `emit_places.py --marks` carries: re-running
`encode_city_chunks.py` rebuilds `base/heroes.*` from the mock and puts the
eleven back. **This must be re-run after it.**

NOTHING HERE FABRICATES A HERO — DRAW.md §11's rule, kept literally. Every
ring, area, height, ground anchor and roll year is read out of the published
footprint the seed names, through `_bldgsrc.read_bldg()`, which is the same
function the encoder reads them with. The seed carries which building is drawn
and how its SECTION is drawn, and the section is the shaped-cap category the
manifest already declares: *"the data fixes the top height and the plan area
and says nothing about taper, and every profile is carved INSIDE the measured
solid, so a drawn cap is always smaller than what was measured, never larger."*
"""
from __future__ import annotations

import json
import gzip
import math
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CITY = ROOT / "pipeline" / "scripts" / "us_sf_city"
sys.path.insert(0, str(CITY))
# The city-free half of the build. See pipeline/scripts/citymap/__init__.py.
sys.path.insert(0, str(ROOT / "pipeline" / "scripts"))
from citymap.chunk import ChunkWriter, field_array, read_chunk  # noqa: E402
from _bldgsrc import read_bldg  # noqa: E402

SEED = HERE / "heroes_extra.json"
CACHE = HERE / "cache"
OUT = ROOT / "website/public/data/us/sf/city"
MANIFEST = OUT / "manifest.json"
KEY = "base/heroes"
KIND = "hero"
CM = 100
PI_SINGLE_SENTINEL = -1

# ── the emphasis law, and the two numbers that reproduce the shipped eleven ──
#
# `em` is not authored: it is `landmarks.ts`'s own `emphasis(top, camScale,
# zexb, H)` evaluated at the three preset cameras, and the sidecar carries the
# result so nothing on the client has to know the stage. The mock's own file
# ships the eleven values and does not ship the two parameters behind them, so
# they are FITTED here and asserted: at `zexb = 3.30` and `H = 1140` the law
# reproduces all thirty-three shipped values to within 0.002. A new hero's `em`
# is then the same function of its own measured top, and not a number typed in.
WO_T = 0.135
WO_EMAX = 5.0
WO_R = 1.5 * math.log2(WO_EMAX)
EM_ZEXB = 3.30
EM_H = 1140.0
EM_BASE = 0.04666598864125368        # cam.base at the canonical 1200 x 678 stage
EM_Z = {"whole": 1.0, "district": 2.9, "block": 7.2}
EM_TOL = 0.002


def _S(t: float) -> float:
    u = 0.0 if t <= 0 else (1.0 if t >= 1 else t)
    return u * u * (3 - 2 * u)


def emphasis(top_m: float, cam_scale: float) -> float:
    honest = top_m * EM_ZEXB * cam_scale
    if honest <= 0:
        return 1.0
    x = math.log2((WO_T * EM_H) / honest)
    if x <= 0:
        return 1.0
    return WO_EMAX ** _S(x / WO_R)


def em_for(top_m: float) -> dict:
    return {b: round(emphasis(top_m, EM_BASE * z), 3) for b, z in EM_Z.items()}


# ── WHICH BUILDING A HERO IS ON, AND WHY IT MAY NOT BE AN INDEX ─────────
#
# `heroes_extra.json` and the mock's own `wonder/hero-data.js` both name the
# building a hero is drawn on by a RAW STREAM INDEX -- `"b": 137821`. That
# index is a POSITION IN A FILE, not an identity: it is the building's rank in
# `gen/bldg-data.js`'s Hilbert-ordered delta chain, and it moves the moment the
# record count changes.
#
# MEASURED, and it is not hypothetical. San Francisco's tallest building is off
# this map: Salesforce Tower's only footprint returns 0.24 m from the 2010
# LiDAR median and the shed filter cuts anything under 2 m (DATA-TRUTH 13.5a).
# Rescuing it and 1190 Mission INSERTS two records, at 135,905 and 137,646. Of
# the thirteen heroes, NINE carry a `b` at or above 135,905 --
#
#     cityhall 149288 - ferry 142936 - coit 142291 - pofa 159057 -
#     opera 149289 - oldmint 136520 - pagoda 149817 - pofahall 159037 -
#     transamerica 137821
#
# -- so nine of the thirteen would silently attach to a DIFFERENT building and
# nothing in the chain would fail: the round trip asserts the register's shape,
# not that `b` names the right footprint. The Palace of Fine Arts' hall would
# be drawn on somebody else's plan, in silence.
#
# SO THE SEED NAMES A PUBLISHED IDENTITY AND THIS FILE RESOLVES IT.
# The building stream carries no parcel key, no address and no external id --
# `read_bldg()` returns ring vertices, a height byte, a roll year and a use
# class, and nothing else. What it does carry is the published FOOTPRINT, and a
# footprint is an identity: the ring's own centroid, its vertex count and its
# area. That triple is a fingerprint of the published record itself, so it
# survives any change in record count, any re-ordering, and the height fix that
# moved 134 bytes of `h` while leaving `cnt`, `vx`, `vy`, `xi` and `xn`
# byte-identical.
#
# It is a LOOKUP KEY and it is never read into the drawing. Every ring, area,
# height, anchor and roll year the hero is drawn from is still read out of the
# record this resolves to, which is the rule the module docstring states.
#
# A hero whose key resolves to no building, or to more than one, FAILS THE
# BUILD. There is no fallback to the index -- a fallback is exactly the silent
# mis-attachment this exists to stop.

IDENT_TOL_M = 2.0
"""The centroid match radius, metres. The stream's coordinates are whole
metres (`_bldgsrc` asserts `q == 1.0`) and `cx`/`cy` are the arithmetic mean of
the ring's own vertices, so an exact record match is exact to floating point;
the radius exists so a future re-quantisation of the stream cannot break every
key at once. The margin this leaves is measured and printed per hero."""

IDENT_AREA_TOL_M2 = 0.5
"""Ring area agreement, m2. Corroboration, not the key: two distinct buildings
whose centroids agree to 2 m AND whose vertex counts agree AND whose areas
agree to half a square metre are the same footprint."""


def identity_of(B: dict, b: int) -> dict:
    """The published fingerprint of building `b` -- read, never typed."""
    o, c = int(B["off"][b]), int(B["cnt"][b])
    ring = [(float(B["IX"][o + k]), float(B["IY"][o + k])) for k in range(c)]
    return {"cx": round(float(B["cx"][b]), 3),
            "cy": round(float(B["cy"][b]), 3),
            "nv": c,
            "areaM2": round(abs(ring_area(ring)), 1)}


def resolve_identity(B: dict, ident: dict, k: str) -> int:
    """The one building whose published footprint IS this one. Never falls back."""
    import numpy as np
    dx = B["cx"] - ident["cx"]
    dy = B["cy"] - ident["cy"]
    d2 = dx * dx + dy * dy
    near = np.nonzero(d2 <= IDENT_TOL_M * IDENT_TOL_M)[0]
    hit = []
    for i in near:
        i = int(i)
        if int(B["cnt"][i]) != ident["nv"]:
            continue
        o, c = int(B["off"][i]), int(B["cnt"][i])
        ring = [(float(B["IX"][o + t]), float(B["IY"][o + t])) for t in range(c)]
        if abs(abs(ring_area(ring)) - ident["areaM2"]) > IDENT_AREA_TOL_M2:
            continue
        hit.append(i)
    if len(hit) != 1:
        raise SystemExit(
            f"{k}: the hero's published footprint identity "
            f"(centroid {ident['cx']}, {ident['cy']}; {ident['nv']} vertices; "
            f"{ident['areaM2']} m2) resolves to {len(hit)} buildings "
            f"{hit if hit else ''}. A hero may not fall back to a raw index -- "
            f"see WHICH BUILDING A HERO IS ON. Nothing written.")
    return hit[0]


ATTACH_NOTE = (
    "WHICH PUBLISHED FOOTPRINT EACH HERO IS DRAWN ON, as an identity rather "
    "than as a position in a file. `b` in the records above and in the mock's "
    "own wonder/hero-data.js is a raw index into gen/bldg-data.js's "
    "Hilbert-ordered delta chain, and it moves whenever the record count "
    "changes -- rescuing Salesforce Tower and 1190 Mission inserts two records "
    "at 135,905 and 137,646, and NINE of the thirteen heroes would then attach "
    "to a different building with nothing failing. These keys are the "
    "published ring's own centroid (metres, the map's own plane), its vertex "
    "count and its area; emit_heroes.py resolves each one against the stream "
    "at build time and REFUSES TO WRITE if it matches no building or more than "
    "one. They are a lookup key and are never read into the drawing: every "
    "ring, area, height, anchor and roll year is still read out of the record "
    "the key resolves to. Harvested from the register with "
    "`emit_heroes.py --harvest-identity`, never typed."
)


def _with_inserts(B: dict, at: tuple[int, ...]) -> dict:
    """The same stream with N records inserted at the given positions, so the
    key's INDEX INDEPENDENCE can be asserted rather than argued. The inserted
    rings are placeholders standing far outside the city; this models the shift
    a rescue causes and makes no claim about what is rescued."""
    import numpy as np
    n = B["n"]
    order = np.arange(n)
    FAR = 1.0e6
    cnt = list(B["cnt"]); cx = list(B["cx"]); cy = list(B["cy"])
    rings = []
    for i in range(n):
        o, c = int(B["off"][i]), int(B["cnt"][i])
        rings.append((B["IX"][o:o + c], B["IY"][o:o + c]))
    ins = sorted(at)
    for j, pos in enumerate(ins):
        k = pos
        cnt.insert(k, 4)
        cx.insert(k, FAR + j)
        cy.insert(k, FAR + j)
        rings.insert(k, (np.array([FAR, FAR + 1, FAR + 1, FAR], dtype=np.int64),
                         np.array([FAR, FAR, FAR + 1, FAR + 1], dtype=np.int64)))
    cnt = np.array(cnt, dtype=np.int64)
    off = np.zeros(len(cnt) + 1, dtype=np.int64)
    np.cumsum(cnt, out=off[1:])
    IX = np.concatenate([r[0] for r in rings])
    IY = np.concatenate([r[1] for r in rings])
    del order
    return {"n": len(cnt), "cnt": cnt, "off": off, "IX": IX, "IY": IY,
            "cx": np.array(cx, dtype=np.float64), "cy": np.array(cy, dtype=np.float64)}


def identity_margin(B: dict, ident: dict, b: int) -> float:
    """How far the nearest OTHER building's centroid is, metres. This is the
    number that says how much room an inserted record has to steal the key:
    anything nearer than IDENT_TOL_M could, and nothing else can."""
    import numpy as np
    dx = B["cx"] - ident["cx"]
    dy = B["cy"] - ident["cy"]
    d2 = dx * dx + dy * dy
    d2[b] = float("inf")
    return float(np.sqrt(d2.min()))


# ── ring arithmetic ─────────────────────────────────────────────────────────

def ring_area(r: list[tuple[float, float]]) -> float:
    n = len(r)
    return sum(r[k][0] * r[(k + 1) % n][1] - r[(k + 1) % n][0] * r[k][1]
               for k in range(n)) / 2


def ring_perimeter(r: list[tuple[float, float]]) -> float:
    n = len(r)
    return sum(math.hypot(r[(k + 1) % n][0] - r[k][0], r[(k + 1) % n][1] - r[k][1])
               for k in range(n))


def inside(r: list[tuple[float, float]], px: float, py: float) -> bool:
    """Crossing number against the ring itself — NOT its bounding box and NOT
    its convex hull. §11's gate is a statement about the ring, and Sutro Tower
    is the one hero for which that is relaxed; nothing here is Sutro Tower."""
    n = len(r)
    ins = False
    for k in range(n):
        x1, y1 = r[k]
        x2, y2 = r[(k + 1) % n]
        if (y1 > py) != (y2 > py):
            xx = x1 + (py - y1) * (x2 - x1) / (y2 - y1)
            if xx > px:
                ins = not ins
    return ins


def dist_to_ring(r: list[tuple[float, float]], px: float, py: float) -> float:
    """Distance from a point to the ring's own boundary."""
    n = len(r)
    best = float("inf")
    for k in range(n):
        x1, y1 = r[k]
        x2, y2 = r[(k + 1) % n]
        ex, ey = x2 - x1, y2 - y1
        L2 = ex * ex + ey * ey
        t = 0.0 if L2 <= 0 else max(0.0, min(1.0, ((px - x1) * ex + (py - y1) * ey) / L2))
        best = min(best, math.hypot(px - (x1 + ex * t), py - (y1 + ey * t)))
    return best


def contained(r: list[tuple[float, float]], px: float, py: float,
              tol: float = 1e-6) -> bool:
    """§11's gate, with the one clause a crossing test on its own gets wrong.

    THE CORNICE STANDS ON THE PUBLISHED RING ITSELF, so every one of its
    vertices is exactly ON the boundary and `inside()` — a crossing number —
    answers false for all of them. That is not a part reaching outside the
    footprint; it is the part standing exactly on it, which is the strictest
    place it can stand. A point within `tol` of the boundary counts as
    contained, and `tol` is a micrometre: it admits a vertex that IS a ring
    vertex and nothing a drawing could put outside.
    """
    return inside(r, px, py) or dist_to_ring(r, px, py) <= tol


def inset(r: list[tuple[float, float]], d: float) -> list[tuple[float, float]]:
    """Per-vertex bisector offset inward by `d` metres.

    THE CONSERVATORY OF FLOWERS' OWN RULE, and DRAW.md §11 says why it exists:
    scaling a ring about its centroid pushes vertices *straight across its own
    notches* on a footprint that is a thin jagged snake. The Palace of Fine
    Arts Exhibition Hall is a 272 m crescent whose area centroid does not lie
    inside it at all, so a profile scale about the centroid is the wrong
    primitive here for exactly that reason.

    The miter is limited at 0.20 so a near-reflex vertex cannot throw its
    offset point to infinity; every vertex is then tested against the ring by
    the caller and the whole inset is rejected if any one of them escapes.
    """
    n = len(r)
    sgn = 1.0 if ring_area(r) > 0 else -1.0
    out = []
    for k in range(n):
        xp, yp = r[k - 1]
        x, y = r[k]
        xn, yn = r[(k + 1) % n]
        e1x, e1y = x - xp, y - yp
        e2x, e2y = xn - x, yn - y
        l1 = math.hypot(e1x, e1y) or 1.0
        l2 = math.hypot(e2x, e2y) or 1.0
        n1x, n1y = -e1y / l1 * sgn, e1x / l1 * sgn
        n2x, n2y = -e2y / l2 * sgn, e2x / l2 * sgn
        bx, by = n1x + n2x, n1y + n2y
        bl = math.hypot(bx, by)
        if bl < 1e-9:
            out.append((x, y))
            continue
        bx, by = bx / bl, by / bl
        cosh = max(0.20, bx * n1x + by * n1y)
        out.append((x + bx * d / cosh, y + by * d / cosh))
    return out


def deepest_inset(r: list[tuple[float, float]], hi: float = 30.0,
                  step: float = 0.1) -> float:
    """The deepest inset at which EVERY vertex of the inset ring is still
    inside the published ring. Searched, not typed: it is a property of this
    footprint's own arm width and nothing else, and it is what stops the roof
    section before it self-intersects."""
    best = 0.0
    d = step
    while d <= hi:
        q = inset(r, d)
        if all(contained(r, px, py) for px, py in q) and abs(ring_area(q)) > 1.0:
            best = d
            d += step
        else:
            break
    return round(best, 2)


# ── the section ─────────────────────────────────────────────────────────────

FT_M = 0.3048


def is_convex(r: list[tuple[float, float]]) -> bool:
    """Every cross product the same sign — the test a centroid scale needs.

    A profile scales a part's ring about its own AREA CENTROID (`landmarks.ts`
    `projectPart`/`drawSolid`), and that is only inside-preserving on a convex
    ring. It is what pushed the Conservatory of Flowers' wing across its own
    notches, and it is why the Exhibition Hall's roof is built from bisector
    insets instead. A form that DOES use the profile has to assert this.
    """
    n = len(r)
    sign = 0
    for k in range(n):
        ax, ay = r[k]
        bx, by = r[(k + 1) % n]
        cx, cy = r[(k + 2) % n]
        z = (bx - ax) * (cy - by) - (by - ay) * (cx - bx)
        if abs(z) < 1e-9:
            continue
        s2 = 1 if z > 0 else -1
        if sign == 0:
            sign = s2
        elif s2 != sign:
            return False
    return True


def largest_inscribed_convex(ring: list[tuple[float, float]]):
    """The largest-area CONVEX polygon on the ring's own vertices that the ring
    contains. Brute force over cyclic subsets; the ring is 8 vertices here and
    the build asserts the count before it runs.

    WHY THIS AND NOT THE HULL. A pyramid is swept by a profile and a profile
    scales about the area centroid, which is inside-preserving only on a convex
    ring. The published footprint is a big quadrilateral with a small tab on
    one corner — the lift and stair projection — so it is not convex. The two
    obvious repairs both fail on this outline and both failures are measured:
    the convex HULL covers 4.9 % more ground than the published footprint
    (146 m2 across the notch, and it slips a vertex-only gate because a hull's
    vertices are always ring vertices); and shrinking that hull about its
    centroid until the whole polygon is inside the ring costs a **0.806**
    scale — sitting on §11's own 0.80 authoring-error floor and throwing away a
    third of the base.

    The largest convex figure the ring itself contains needs no relaxation, no
    shrink and no threshold: it is a property of the published outline. What it
    drops is the tab, which is not the tower's plan.
    """
    n = len(ring)
    if n > 12:
        raise ValueError(f"{n} vertices is too many for this search")

    def area(p):
        m = len(p)
        return abs(sum(p[k][0] * p[(k + 1) % m][1] - p[(k + 1) % m][0] * p[k][1]
                       for k in range(m))) / 2

    best, best_a = None, -1.0
    for mask in range(1 << n):
        idx = [i for i in range(n) if mask >> i & 1]
        if len(idx) < 3:
            continue
        poly = [ring[i] for i in idx]
        if not is_convex(poly):
            continue
        a = area(poly)
        if a <= best_a:
            continue
        # every edge of the candidate must lie inside the published ring
        ok = True
        for t in range(len(poly)):
            x1, y1 = poly[t]
            x2, y2 = poly[(t + 1) % len(poly)]
            steps = max(2, int(math.hypot(x2 - x1, y2 - y1) / 0.5) + 1)
            for j in range(steps + 1):
                u = j / steps
                if not contained(ring, x1 + (x2 - x1) * u, y1 + (y2 - y1) * u):
                    ok = False
                    break
            if not ok:
                break
        if ok:
            best, best_a = poly, a
    if best is None:
        raise ValueError("no convex figure fits inside this footprint")
    return best, best_a


def convex_hull(pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Monotone chain, counter-clockwise. Deterministic: the sort is total."""
    p = sorted(set(pts))
    if len(p) < 3:
        return list(p)
    def half(seq):
        out = []
        for q in seq:
            while len(out) >= 2:
                (ax, ay), (bx, by) = out[-2], out[-1]
                if (bx - ax) * (q[1] - ay) - (by - ay) * (q[0] - ax) > 0:
                    break
                out.pop()
            out.append(q)
        return out
    return half(p)[:-1] + half(reversed(p))[:-1]


# landmarks.ts §11's own floor, carried here so the build applies the same one:
# "a part that reaches past the footprint is shrunk about its own centroid until
# it does not — never grown — and a shrink below 0.80 is treated as an authoring
# error rather than a correction and fails the build."
HERO_MIN_SHRINK = 0.80


def build_pyramid(ring: list[tuple[float, float]], sec: dict) -> tuple[list[dict], dict]:
    """A tapering tower whose whole skeleton is published.

    WHY THIS IS A HERO AT ALL, AND IT IS A MEASUREMENT ERROR RATHER THAN A
    TASTE ONE. The fabric's drawn height is `ynuv-fyni hgt_mediancm` — *the
    MEDIAN LIDAR return over each footprint* (the mock's own `MEASURED.height`,
    verbatim). The median is exactly the right statistic for a flat-roofed box
    and exactly the wrong one for a spire: most of a tapering tower's footprint
    is under its wide base, so the median sits near the bottom. **The
    Transamerica Pyramid, 853 ft tall, is drawn 68 m tall** — its own shaped
    cap is then carved *inside* that 68 m solid, so the most recognisable tower
    in San Francisco is a stub its neighbours hide. Screenshot
    `.parity/g3/out/pyr-blk.prod.before.png`: it is not findable in its own
    skyline.

    NOTHING ABOUT THE FORM IS AUTHORED. Every number comes off DataSF
    **5kya-mfst**, the Tall Building Inventory — the register `build_places.py`
    already reads for names, whose scope is every building over 240 ft and
    whose fields this row fills:

        height_ft          853        -> 259.99 m, the published top
        base_plan_size     165x165    -> the base, and the shipped 8-vertex
                                        footprint ring is that base measured
        description        "50 story WSMF with 11 story architectural cap"
        stories_above_grade 50
        date / completion_date 1972
        facade_material    "concrete panel and sheet metal"

    THE TAPER IS DERIVED, NOT TYPED. A pyramid is the surface between its base
    ring and a point at its top, so the plan scale at any height `z` is
    `1 - z/top` and there is no free parameter. The description's own two
    numbers put the join between shaft and architectural cap at
    `50 / (50 + 11)` of the height — **213.11 m** — where the plan is
    `11/61 = 0.1803` of the base, about 9.1 m across. A check on that split
    rather than an assumption: 853 ft over 61 storey-equivalents is **13.98 ft
    a storey**, which is an office storey, and the register's own
    `typ_story_height` on comparable rows reads 14'9".

    So the shaft and the cap are ONE pyramid, split where the register splits
    it, and what changes at the join is the MATERIAL and not the shape —
    `facade_material` names both halves, "concrete panel and sheet metal".
    """
    top_ft = float(sec["heightFt"])
    top_m = round(top_ft * FT_M, 2)
    ns, nc = int(sec["storiesShaft"]), int(sec["storiesCap"])
    if not (ns > 0 and nc > 0):
        raise ValueError("the storey split does not close")
    shaft = round(top_m * ns / (ns + nc), 2)
    s_join = round(1.0 - shaft / top_m, 6)
    # THE BASE IS THE MEASURED FOOTPRINT, NOT THE REGISTER'S PLAN SIZE, and the
    # two disagree in a way worth writing down. 5kya-mfst publishes
    # `base_plan_size 165x165` ft — a 50.3 m square, 2,529 m² — and the shipped
    # ynuv-fyni footprint is 2,982 m² whose main quadrilateral measures about
    # **45.7 x 53.6 m**. A 50.3 m square does not fit inside a 45.7 m width, so
    # the published plan is not this outline: it is a design figure, and the
    # footprint is a measurement of the thing that is standing there. Every
    # other hero on this map stands on its own footprint and so does this one.
    #
    # The profile scales about the area centroid, which is inside-preserving
    # only on a convex ring, so the base is the largest convex figure the
    # published footprint CONTAINS — see `largest_inscribed_convex`, which also
    # records the two simpler repairs that fail on this outline and by how
    # much. The convex-hull REFERENCE is not taken either: `data.test.ts`
    # asserts Sutro Tower alone is granted it, that invariant is deliberate —
    # its ring traces three open steel legs and is not a slab — and a parcel
    # outline with a lift tab on one corner is not the same case.
    base, a_base = largest_inscribed_convex(ring)
    a_hull = abs(ring_area(convex_hull(ring)))
    fit = 1.0
    bp = sec.get("basePlanFt")
    plan_m2 = ((float(bp[0]) * FT_M) * (float(bp[1]) * FT_M)) if bp else 0.0
    ring_pub = ring
    ring = base
    drawn_m2 = a_base

    def solid(z0, z1, s0, s1, mat, px):
        return {"k": 0, "r": [c for xy in ring for c in xy], "z0": round(z0, 2),
                "z1": round(z1, 2), "m": mat, "c": mat, "px": px, "ink": 1,
                "p": [0.0, s0, 1.0, s1]}

    parts = [solid(0.0, shaft, 1.0, s_join, sec["matShaft"], 0.0),
             solid(shaft, top_m, s_join, 0.0, sec["matCap"], 0.0)]

    # ── THE WINGS, WHICH ARE HALF OF WHAT THIS BUILDING LOOKS LIKE ────────
    # Two vertical shafts break out of the tapering faces and rise to the top
    # of the shaft, flanking the spire. They are not ornament and they are not
    # authored shape: they are the LIFTS on one side and the stair and smoke
    # tower on the other, and the reason they are outside the envelope is that
    # a pyramid runs out of floor plate before it runs out of building. Drawn
    # without them the tower is a plain cone, which is what shipped and what
    # the page showed as a pale spike.
    #
    # WHAT IS READ. The register gives the two storey counts this file already
    # splits the shaft and cap on, and `stories_above_grade` 50. The wings
    # begin at the 29th of those 50 — the floor at which the plan has narrowed
    # past what the cores can sit inside — so their foot is `29/50` of the
    # shaft, DERIVED from the same two published numbers as the join above and
    # not a height typed in metres.
    #
    # WHAT IS AUTHORED. Their width and their depth, as fractions of the base
    # the tower stands on, and the fact that there are two of them on opposite
    # faces. Stated here rather than in a constant: `WING_W` of the face they
    # sit on, `WING_D` into the plan.
    #
    # NOTHING STANDS OUTSIDE THE FOOTPRINT. A wing's plan is a rectangle cut
    # from the BASE ring's own bounding box in the ring's own frame, so it is
    # inside the base by construction and the caller's §11 gate sees it anyway.
    # It stands outside the tapering SURFACE above its foot, which is the whole
    # point of it and is what the building does.
    wing_from = round(shaft * float(sec.get("wingFromStorey", 29))
                      / float(sec.get("storiesAboveGrade", ns)), 2)
    if 0 < wing_from < shaft:
        parts += wing_parts(ring, wing_from, shaft, s_join, shaft, top_m,
                            sec["matShaft"])
    return parts, {"kind": "pyramid", "topM": top_m, "shaftTopM": shaft,
                   "joinScale": s_join, "ftPerStorey": round(top_ft / (ns + nc), 2),
                   "hull": 0, "drawnM2": round(drawn_m2, 1),
                   "planM2": round(plan_m2, 1), "hullM2": round(a_hull, 1),
                   "ringM2": round(abs(ring_area(ring_pub)), 1),
                   "baseNv": len(base), "ringNv": len(ring_pub)}


#: a wing's width, as a share of the face it sits on. MEASURED off the
#: published plan: the tower is 165 ft across and each wing about 36 ft, which
#: is 0.22. Authored in the sense that the register does not publish it; taken
#: from the building's own proportions rather than chosen.
WING_W = 0.22
#: and how far it reaches into the plan, as a share of the perpendicular span.
#: A lift core is deep enough to hold a bank of cars and no deeper.
WING_D = 0.16


def wing_parts(ring, z0, z1, s_at_z0, shaft, top_m, mat):
    """Two vertical shafts on opposite faces of the base — see `build_pyramid`.

    Placed in the RING'S OWN FRAME, off its longest edge, for the reason
    `roof-form.ts` §gablePlan records at length: San Francisco's grid runs 25
    to 30 degrees off the projection's axes, and a rectangle laid out on x and
    y comes out turned relative to the building it belongs to.
    """
    n = len(ring)
    # the longest edge is a real wall and is what the plan is square to
    bi, bl = 0, -1.0
    for i in range(n):
        j = (i + 1) % n
        dx, dy = ring[j][0] - ring[i][0], ring[j][1] - ring[i][1]
        L = dx * dx + dy * dy
        if L > bl:
            bl, bi = L, i
    j = (bi + 1) % n
    ex, ey = ring[j][0] - ring[bi][0], ring[j][1] - ring[bi][1]
    eL = math.hypot(ex, ey) or 1.0
    ux, uy = ex / eL, ey / eL
    nx, ny = -uy, ux
    us = [p[0] * ux + p[1] * uy for p in ring]
    vs = [p[0] * nx + p[1] * ny for p in ring]
    u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    hu, hv = (u1 - u0) / 2, (v1 - v0) / 2

    def world(a, b):
        return (a * ux + b * nx, a * uy + b * ny)

    out = []
    for sgn in (-1, 1):
        # the wing sits at one end of the long axis, centred across it. The
        # base is convex but it is not a rectangle, so a rectangle taken off
        # its BOUNDING BOX can put a corner outside it — the emitter's §11
        # gate refused exactly that on the first cut, at (3098.16, 3887.53).
        # So the wing is walked inward from the face until it is contained,
        # in steps of a hundredth of the plan, and the step it stops on is
        # reported. It is not nudged and it is not waived.
        b = hv * WING_W
        placed = None
        for k in range(40):
            pull = hu * 0.01 * k
            a1 = cu + sgn * (hu - pull)
            a0 = a1 - sgn * (2 * hu * WING_D)
            pts = [(a0, cv - b), (a1, cv - b), (a1, cv + b), (a0, cv + b)]
            if all(contained(ring, *world(a, bb)) for (a, bb) in pts):
                placed = (pts, k)
                break
        if placed is None:
            raise ValueError("no wing of this size fits inside the base ring")
        pts, k = placed
        if sgn < 0:
            pts.reverse()
        r = []
        for (a, bb) in pts:
            wx, wy = world(a, bb)
            r += [round(wx, 3), round(wy, 3)]
        out.append({"k": 0, "r": r, "z0": round(z0, 2), "z1": round(z1, 2),
                    "m": mat, "c": mat, "px": 0.0, "ink": 1,
                    "p": [0.0, 1.0, 1.0, 1.0]})
    return out


def build_temple(ring: list[tuple[float, float]], top_m: float,
                 sec: dict) -> tuple[list[dict], dict]:
    """A colonnaded temple front on a PUBLISHED face — the Old Mint's own section.

    WHY THIS BUILDER EXISTS. `build_parts` draws a roof, and a roof is what a
    reader sees when they look DOWN on a building. That is the right answer for
    the Palace of Fine Arts Exhibition Hall — 14 m tall on a 272 m plan — and
    the wrong one here. This building's whole identity is a WALL: a white
    neoclassical box whose Funston Avenue face is a portico of six columns
    under a heavy entablature. Drawn as a shaped cap it is a pale prism, which
    is what shipped first and what Daniel called unrecognisable in one line.

    THE OLD MINT IS THE PRECEDENT AND THE TEMPLATE, not an analogy: the same
    city, the same decade's classicism, the same six columns, and its own
    record already says in words what is drawn — *"The rusticated base, the
    cornice, the parapet, the portico and its six columns are drawn."* This
    reproduces that section's SHAPE (base / wall / cornice / roof, plus a
    portico block and `g:"col"` shafts) with every dimension taken off THIS
    footprint instead of typed.

    WHAT IS READ AND WHAT IS AUTHORED, and the split is the whole bargain:

      READ      the ring, its area, its winding, the measured top, the face
                the seed names by its own published vertex indices, that
                face's length and its inward normal, and the deepest inset the
                ring will take before a band self-intersects.
      AUTHORED  the SECTION — where the base stops, where the entablature
                starts, how far each band is set in, how deep the portico is,
                how many columns and how thick. Fractions of the measured top,
                never metres, so the section is a proportion of the building
                and not a number that happens to fit it.

    NOTHING STANDS OUTSIDE THE FOOTPRINT OR ABOVE THE MEASURED TOP. Every band
    is `inset()` — the per-vertex bisector inset, the Conservatory's own rule,
    not a scale about the centroid — and every inset is checked against
    `deepest_inset(ring)` here before the caller's §11 gate sees it, so a seed
    that asks for a deeper band fails with a sentence about THIS ring rather
    than with a vertex coordinate. The portico and the columns are laid on the
    named face's inward normal, so they are inside by construction and are
    gated anyway.

    THE CORNICE IS THE SHALLOWEST BAND AND THAT IS DELIBERATE. An entablature
    projects PAST the wall it sits on; drawn at the wall's own inset it reads
    as a change of colour rather than a change of plane. So the bands step
    wall -> base -> cornice from deep to shallow, which is the Old Mint's own
    order (2,946 m2 wall, 3,168 m2 base, 3,280 m2 cornice, on a 3,451 m2
    footprint) and never reaches the published ring itself.
    """
    A = abs(ring_area(ring))
    dmax = deepest_inset(ring)
    i, j = int(sec["faceI"]), int(sec["faceJ"])
    if not (0 <= i < len(ring) and 0 <= j < len(ring)):
        raise ValueError(f"faceI/faceJ out of range for a {len(ring)}-vertex ring")
    ax, ay = ring[i]
    bx, by = ring[j]
    L = math.hypot(bx - ax, by - ay)
    if L <= 0:
        raise ValueError("the named face has no length")
    ux, uy = (bx - ax) / L, (by - ay) / L
    # THE INTERIOR IS TO THE LEFT OF A COUNTER-CLOCKWISE EDGE. Read off the
    # ring's own signed area rather than assumed, so a clockwise footprint
    # does not silently put the portico in the street.
    ccw = ring_area(ring) > 0
    nx, ny = (-uy, ux) if ccw else (uy, -ux)

    fb = float(sec["baseFrac"])
    fw = float(sec["wallFrac"])
    fc = float(sec["corniceFrac"])
    if not (0 < fb < fw < fc < 1.0):
        raise ValueError("the section's fractions do not run base < wall < cornice < 1")
    z_base, z_wall, z_corn = top_m * fb, top_m * fw, top_m * fc

    ins = {n: float(sec[k]) for n, k in
           (("base", "insetBaseM"), ("wall", "insetWallM"),
            ("cornice", "insetCorniceM"), ("roof", "insetRoofM"))}
    for n, d in ins.items():
        if d <= 0 or d > dmax:
            raise ValueError(
                f"the {n} band asks for a {d} m inset and this ring takes "
                f"{dmax:.2f} m before it self-intersects")
    if not (ins["cornice"] < ins["base"] < ins["wall"]):
        raise ValueError("the cornice must project past the base, and the base "
                         "past the wall; the insets do not step that way")

    def band(z0, z1, d, mat, px):
        r = inset(ring, d)
        return {"k": 0, "r": [q for xy in r for q in xy], "z0": round(z0, 2),
                "z1": round(z1, 2), "m": mat, "c": mat, "px": px, "ink": 1,
                "p": [0.0, 1.0, 1.0, 1.0]}

    mw, mb = int(sec["matWall"]), int(sec["matBase"])
    mr, mc = int(sec["matRoof"]), int(sec["matCol"])
    parts = [
        band(0.0, z_base, ins["base"], mb, 0.0),
        band(z_base, z_wall, ins["wall"], mw, 0.0),
        band(z_wall, z_corn, ins["cornice"], mw, 0.0),
        band(z_corn, top_m, ins["roof"], mr, 2.0),
    ]

    # ── the portico block, on the named face ──────────────────────────────
    span = L * float(sec["porticoSpanFrac"])
    depth = float(sec["porticoDepthM"])
    off = float(sec["porticoOffsetM"])
    mx, my = (ax + bx) / 2, (ay + by) / 2
    h2 = span / 2
    p0 = (mx - ux * h2 + nx * off, my - uy * h2 + ny * off)
    p1 = (mx + ux * h2 + nx * off, my + uy * h2 + ny * off)
    quad = [p0, p1, (p1[0] + nx * depth, p1[1] + ny * depth),
            (p0[0] + nx * depth, p0[1] + ny * depth)]
    # THE PORTICO IS THE TALLEST THING ON THE BUILDING, and on this one that is
    # a fact about the object rather than a legibility trick: a temple front
    # carries its entablature and pediment ABOVE the parapet of the flanks, and
    # this building's does. Drawing it flush with the roof band throws that
    # away — and throws away the only part of the section a fixed overhead
    # camera can see, because the colonnade itself faces away. It still stops
    # at the measured top; the caller's §11 gate re-checks that.
    z_pt = top_m * float(sec["porticoTopFrac"])
    parts.append({"k": 0, "r": [q for xy in quad for q in xy], "z0": 0.0,
                  "z1": round(z_pt, 2), "m": mw, "c": mw, "px": 1.6,
                  "ink": 1, "p": [0.0, 1.0, 1.0, 1.0]})

    # ── the shafts. `g:"col"` is the Old Mint's own part flag. ────────────
    z_col = top_m * float(sec["columnTopFrac"])
    ncol = int(sec["columns"])
    if ncol < 2:
        raise ValueError("a colonnade is at least two columns")
    rad = float(sec["columnRM"])
    cin = float(sec["columnInsetM"])
    cspan = L * float(sec["columnSpanFrac"])
    ch2 = cspan / 2
    for k in range(ncol):
        t = -ch2 + (2 * ch2) * (k / (ncol - 1))
        cx, cy = mx + ux * t + nx * cin, my + uy * t + ny * cin
        hexr = [(cx + rad * math.cos(2 * math.pi * v / 6 + math.pi / 6),
                 cy + rad * math.sin(2 * math.pi * v / 6 + math.pi / 6))
                for v in range(6)]
        parts.append({"k": 0, "r": [q for xy in hexr for q in xy],
                      "z0": round(z_base, 2), "z1": round(z_col, 2),
                      "m": mc, "c": mc, "px": 1.2, "g": "col", "ink": 0,
                      "p": [0.0, 1.0, 1.0, 1.0]})

    # ── the openings, on the wall band the ARCADE kind repeats them over ──
    w = sec.get("window")
    if w:
        rw = inset(ring, ins["wall"])
        parts.append({"k": 1, "r": [q for xy in rw for q in xy],
                      "z0": round(top_m * float(w["z0Frac"]), 2),
                      "z1": round(top_m * float(w["z1Frac"]), 2),
                      "m": mw, "px": 2.4, "g": "w", "w": float(w["w"]),
                      "pi": float(w["pitch"]), "mg": float(w["margin"]),
                      "sh": "rect", "dk": float(w["dark"])})

    geo = {"kind": "temple", "topM": top_m, "faceM": round(L, 2),
           "faceI": i, "faceJ": j, "deepestInsetM": round(dmax, 3),
           "porticoM2": round(abs(ring_area(quad)), 1),
           "columnM2": round(math.pi * rad * rad * 3 * math.sqrt(3) / (2 * math.pi), 2),
           "columnPitchM": round(cspan / (ncol - 1), 2),
           "columns": ncol, "ringM2": round(A, 1),
           "zBaseM": round(z_base, 2), "zWallM": round(z_wall, 2),
           "zCorniceM": round(z_corn, 2), "zPorticoM": round(z_pt, 2),
           "zColM": round(z_col, 2), "hull": 0}
    return parts, geo


def build_parts(ring: list[tuple[float, float]], top_m: float, sec: dict) -> list[dict]:
    """The drawn section, in `hero-data.js`'s own part shape.

    A SEGMENTAL ROOF ON A CRESCENT CANNOT REACH A RIDGE LINE, and the arithmetic
    says so rather than the drawing hiding it. The ring's equivalent half-width
    is its own area / perimeter — the width of the straight band with the same
    two numbers, 18.16 m for this footprint. A segmental arc of rise `rr` has
    half-width `w*sqrt(1 - t/rr)` at height `t`, so the ridge is at inset `w`,
    and `w` is more than twice the deepest inset this ring will take. So the
    arc's rise is solved BACKWARD from the deepest inset the ring admits: the
    roof drawn is the lower part of a segmental arc, truncated flat exactly
    where the published top stops it, and the flat is where the measurement
    ends and not where the roof does. `dr` on the record says this in words.
    """
    A = abs(ring_area(ring))
    P = ring_perimeter(ring)
    w = A / P
    dmax = deepest_inset(ring)
    eaves = round(top_m * float(sec["eavesFrac"]), 2)
    cornice = float(sec["corniceM"])
    setback = float(sec["wallSetbackM"])
    nb = int(sec["roofBands"])
    r0 = eaves + cornice                     # the roof springs off the cornice
    rise = top_m - r0
    if not (rise > 0 and dmax > 0 and w > dmax):
        raise ValueError("the section does not close on this footprint")
    # solve rr from  dmax = w * (1 - sqrt(1 - rise/rr))
    kind = sec.get("roofKind", "segmental")
    parts = []

    def solid(rg, z0, z1, mat, px, ink):
        return {"k": 0, "r": [c for xy in rg for c in xy], "z0": round(z0, 2),
                "z1": round(z1, 2), "m": mat, "c": mat, "px": px, "ink": ink,
                "p": [0.0, 1.0, 1.0, 1.0]}

    parts.append(solid(inset(ring, setback), 0.0, eaves, sec["matWall"], 0.0, 1))
    parts.append(solid(list(ring), eaves, r0, sec["matWall"], 1.0, 1))
    # TWO ROOF SECTIONS, AND WHICH ONE IS A PROPERTY OF THE BUILDING.
    #   segmental  the lower part of a circular arc — a long shed whose roof
    #              curves, truncated flat where the published top stops it.
    #              The arc's rise is solved BACKWARD from `dmax` so the section
    #              never asks for an inset the ring will not take.
    #   pitched    a straight slope — a nave, a hall, anything roofed with a
    #              ridge. The inset is linear in height, so the bands are a
    #              constant slope and the band count is a smoothness choice
    #              rather than a shape one.
    # Neither is measured and the record's `dr` says so. What IS measured is
    # the ring, the top, and `dmax`.
    rr = (rise / (1.0 - (1.0 - dmax / w) ** 2)) if kind == "segmental" else 0.0
    z = r0
    for k in range(nb):
        u = (k + 1) / nb
        t = rise * u
        d = (w * (1.0 - math.sqrt(max(0.0, 1.0 - t / rr))) if kind == "segmental"
             else dmax * u)
        z1 = r0 + t
        parts.append(solid(inset(ring, round(d, 2)), z, z1, sec["matRoof"], 0.0, 1))
        z = z1
    return parts, {"w": round(w, 2), "dmax": dmax, "rise": round(rise, 2),
                   "kind": kind, "arcRise": round(rr, 2), "eaves": eaves}


# ── read the shipped register back out of the chunk ─────────────────────────

def read_shipped() -> tuple[list[dict], dict]:
    """The eleven, as `hero-data.js`-shaped dicts, out of base/heroes.{qc,json}.

    Reading them back rather than re-reading the mock is deliberate: what has
    to be preserved byte for byte is what the page is being served, and that is
    this file. The round trip is asserted by `--check`.
    """
    hdr, pay = read_chunk((OUT / "base" / "heroes.qc").read_bytes())
    side = json.loads((OUT / "base" / "heroes.json").read_text())
    f = {n: field_array(hdr, pay, n) for n in
         ("bi yr top zr acc hull msA msH msR msYr msNv ax ay poff pk pm pink pc "
          "pnb pz0 pz1 pmin pw ppi pmg pdk ptx pty roff proff rx ry pu ps").split()}
    out = []
    for q, meta in enumerate(side["heroes"]):
        assert int(f["bi"][q]) == meta["b"], (q, meta["k"])
        ps = []
        for j in range(int(f["poff"][q]), int(f["poff"][q + 1])):
            st = side["parts"][j]
            r = []
            for t in range(int(f["roff"][j]), int(f["roff"][j + 1])):
                r += [float(f["rx"][t]), float(f["ry"][t])]
            pr = []
            for t in range(int(f["proff"][j]), int(f["proff"][j + 1])):
                pr += [float(f["pu"][t]), float(f["ps"][t])]
            p = {"k": int(f["pk"][j]), "r": r, "p": pr,
                 "z0": int(f["pz0"][j]) / CM, "z1": int(f["pz1"][j]) / CM,
                 "m": int(f["pm"][j]), "c": int(f["pc"][j]),
                 "ink": int(f["pink"][j]), "px": int(f["pmin"][j]) / CM,
                 "w": int(f["pw"][j]) / CM,
                 "pi": (1e9 if int(f["ppi"][j]) == PI_SINGLE_SENTINEL
                        else int(f["ppi"][j]) / CM),
                 "mg": int(f["pmg"][j]) / CM, "dk": int(f["pdk"][j]) / CM,
                 "n": int(f["pnb"][j]),
                 "t": [int(f["ptx"][j]) / CM, int(f["pty"][j]) / CM]}
            if st.get("g"):
                p["g"] = st["g"]
            if st.get("sh"):
                p["sh"] = st["sh"]
            ps.append(p)
        out.append({
            "k": meta["k"], "n": meta["n"], "b": meta["b"], "y": int(f["yr"][q]),
            "an": meta["an"], "ys": meta["ys"], "dr": meta["dr"],
            "hu": meta.get("hu"), "ms": meta["ms"], "em": meta["em"],
            "ac": meta.get("ac", -1), "zr": int(f["zr"][q]) / CM,
            "ax": float(f["ax"][q]), "ay": float(f["ay"][q]),
            "hull": int(f["hull"][q]), "p": ps,
        })
    return out, side


def _cm(v: float, what: str) -> int:
    x = v * CM
    r = round(x)
    if abs(x - r) > 1e-6:
        raise ValueError(f"{what}: {v} is not a whole number of centimetres")
    return int(r)


FT_M = 0.3048
"""The international foot, exactly, which is what the FAA publishes in."""

TOP_SCALE_MAX = 2.0
"""How far a published top may move a hero that was drawn to a LIDAR median.

A guard, not a tuning knob. The Transamerica Pyramid was drawn at 26 % of its
published height (§21.22) and this is the same defect, so the factor is allowed
to be large -- but a factor beyond 2 means the seed and the register are
describing different structures and the build should stop rather than draw a
tower twice as tall as anything measured."""


def dof_agl_ft(oas: str) -> int | None:
    """The FAA Digital Obstacle File's own `AGL` for one obstacle, re-read.

    THE NUMBER IS NOT TAKEN FROM THE SEED IF THE FILE IS HERE. `faa_dof.zip` is
    15.4 MB and is fetched rather than committed (`cache/.gitignore` says so and
    its `.meta.json` carries the URL and the sha256), so this verifies when the
    file is present and says loudly when it is not. It is the same file, the
    same field and the same parse `emit_bay_bridge.py::towers_from_dof` uses for
    the Golden Gate's and the Bay Bridge's towers.
    """
    z = CACHE / "faa_dof.zip"
    if not z.exists():
        return None
    import io
    import re
    import zipfile
    with zipfile.ZipFile(z) as zf:
        with io.TextIOWrapper(zf.open("DOF.DAT"), encoding="latin-1") as fh:
            for i, ln in enumerate(fh):
                if i < 4 or len(ln) < 90:
                    continue
                if ln[0:9].strip() != oas:
                    continue
                m = re.match(r"\s*(\S.*?)\s+(\d)\s+(\d{5})\s+(\d{5})\s", ln[62:])
                if m:
                    return int(m.group(3))
    return None


def apply_published_tops(H: list[dict], seed: dict) -> list[tuple]:
    """A hero drawn to a LIDAR median when its own record already cites a
    PUBLISHED top.

    SUTRO TOWER IS THE CASE THIS EXISTS FOR, AND IT IS THE SAME DEFECT AS THE
    PYRAMID'S. `ynuv-fyni hgt_mediancm` is the MEDIAN LIDAR return over a
    footprint -- exactly right for a flat-roofed box and exactly wrong for a
    lattice tower, because most of a tripod's footprint has sky over it. The
    map drew the most visible object in San Francisco at **210.0 m**. Its own
    shipped record has always said, in `an` and again in `dr`, that the FAA
    Digital Obstacle File publishes obstacle `06-000120` at **977 ft above
    ground in the same place** -- the record cited the number it was not using.

    THE FORM IS NOT TOUCHED AND THAT IS THE WHOLE ARGUMENT. The mock authored
    Sutro Tower as six stacked parts whose heights are fractions of its top --
    63.0 / 117.6 / 180.6 / 210.0 m are 0.300 / 0.560 / 0.860 / 1.000 -- and each
    part carries its own three-vertex plan, so the taper lives in the RINGS and
    not in the heights. Multiplying every `z` by one factor therefore evaluates
    the same authored proportional model against a published top instead of a
    measured one. **No ring moves, no vertex is invented, and the silhouette is
    the one that was already there, at the height its own record publishes.**

    IDEMPOTENT BY CONSTRUCTION, which matters because `H` is read back out of
    the register this writes. A hero already at its published top is skipped, so
    a second run is a no-op and `--check` still says IDENTICAL; and if
    `encode_city_chunks.py` rebuilds the register from the mock, the next run
    puts it back.
    """
    tops = seed.get("publishedTops", {})
    done = []
    for k in sorted(tops):
        spec = tops[k]
        h = next((x for x in H if x["k"] == k), None)
        if h is None:
            raise SystemExit(
                f"publishedTops names `{k}` and no such hero is in the register. "
                f"Nothing written.")
        want = round(float(spec["ft"]) * FT_M, 2)
        agl = dof_agl_ft(spec["oas"]) if spec.get("oas") else None
        if agl is not None and agl != int(spec["ft"]):
            raise SystemExit(
                f"{k}: the seed says the FAA publishes {spec['ft']} ft for "
                f"obstacle {spec['oas']} and the cached DOF says {agl} ft. "
                f"Nothing written.")
        was = float(h["ms"]["t"])
        f = want / was
        if abs(f - 1.0) < 1e-4:
            done.append((k, was, want, 1.0, agl, True))
            continue
        if not 0.5 < f < TOP_SCALE_MAX:
            raise SystemExit(
                f"{k}: the published top {want} m is {f:.2f}x the register's "
                f"{was} m. Beyond {TOP_SCALE_MAX}x the two are not describing "
                f"the same structure. Nothing written.")
        hi = max(p["z1"] for p in h["p"])
        if hi > was + 1e-6:
            raise SystemExit(
                f"{k}: a part already stands at {hi} m above a measured top of "
                f"{was} m, so the authored heights are not fractions of it and "
                f"a single factor is the wrong transformation. Nothing written.")
        # ROUNDED TO THE CHUNK'S OWN QUANTUM. `_cm` refuses anything that is
        # not a whole number of centimetres, which is the encoding's contract
        # and also what makes two runs byte-identical: a float product is not.
        for p in h["p"]:
            p["z0"] = round(p["z0"] * f, 2)
            p["z1"] = round(p["z1"] * f, 2)
        h["zr"] = round(h["zr"] * f, 2)
        h["ms"] = dict(h["ms"], h=round(h["ms"]["h"] * f, 2), t=want)
        h["em"] = em_for(want)
        h["dr"] = spec["dr"]
        done.append((k, was, want, f, agl, False))
    return done


def encode(H: list[dict], side: dict) -> bytes:
    bi, yrs, top, zr, acc, hull = [], [], [], [], [], []
    msA, msH, msR, msYr, msNv, ax, ay = [], [], [], [], [], [], []
    poff, pk, pz0, pz1, pm, pc, pink, pmin = [0], [], [], [], [], [], [], []
    pw, ppi, pmg, pdk, pnb, ptx, pty = [], [], [], [], [], [], []
    roff, proff, rx, ry, pu, ps = [0], [0], [], [], [], []
    strings = []
    for h in H:
        bi.append(h["b"]); yrs.append(h["y"])
        ms = h["ms"]
        top.append(_cm(ms["t"], f"{h['k']}.ms.t"))
        zr.append(_cm(h["zr"], f"{h['k']}.zr"))
        acc.append(h.get("ac", -1))
        hull.append(int(h.get("hull") or 0))
        msA.append(_cm(ms["a"], "a")); msH.append(_cm(ms["h"], "h"))
        msR.append(_cm(ms["r"], "r")); msYr.append(ms["yr"]); msNv.append(ms["nv"])
        ax.append(h["ax"]); ay.append(h["ay"])
        for p in h["p"]:
            n = len(p["r"]) // 2
            pk.append(p["k"]); pz0.append(_cm(p["z0"], "z0")); pz1.append(_cm(p["z1"], "z1"))
            pm.append(p["m"]); pc.append(p.get("c", p["m"])); pink.append(int(p.get("ink") or 0))
            pmin.append(_cm(p.get("px") or 0, "px")); pw.append(_cm(p.get("w") or 0, "w"))
            piv = p.get("pi") or 0
            ppi.append(PI_SINGLE_SENTINEL if piv >= 1e9 else _cm(piv, "pi"))
            pmg.append(_cm(p.get("mg") or 0, "mg"))
            pdk.append(_cm(p["dk"] if p.get("dk") is not None else 0.75, "dk"))
            pnb.append(int(p.get("n") or 0))
            t = p.get("t") or (0, 0)
            ptx.append(_cm(t[0], "tx")); pty.append(_cm(t[1], "ty"))
            for k in range(n):
                rx.append(p["r"][2 * k]); ry.append(p["r"][2 * k + 1])
            roff.append(len(rx))
            for k in range(len(p.get("p") or []) // 2):
                pu.append(p["p"][2 * k]); ps.append(p["p"][2 * k + 1])
            proff.append(len(pu))
            strings.append({"g": p.get("g"), "sh": p.get("sh") or ""})
        poff.append(len(pk))
    w = ChunkWriter(KEY, KIND)
    w.add("bi", "u32", bi).add("yr", "u16", yrs)
    w.add("top", "i32", top).add("zr", "i32", zr)
    w.add("acc", "i16", acc).add("hull", "u8", hull)
    w.add("msA", "i32", msA).add("msH", "i32", msH).add("msR", "i32", msR)
    w.add("msYr", "u16", msYr).add("msNv", "u16", msNv)
    w.add("ax", "f32", ax).add("ay", "f32", ay)
    w.add("poff", "u32", poff)
    w.add("pk", "u8", pk).add("pm", "u8", pm).add("pink", "u8", pink)
    w.add("pc", "i16", pc).add("pnb", "u16", pnb)
    w.add("pz0", "i32", pz0).add("pz1", "i32", pz1).add("pmin", "i32", pmin)
    w.add("pw", "i32", pw).add("ppi", "i32", ppi).add("pmg", "i32", pmg)
    w.add("pdk", "i32", pdk).add("ptx", "i32", ptx).add("pty", "i32", pty)
    w.add("roff", "u32", roff).add("proff", "u32", proff)
    w.add("rx", "f32", rx).add("ry", "f32", ry)
    w.add("pu", "f32", pu).add("ps", "f32", ps)
    side["heroes"] = [
        {"k": h["k"], "n": h["n"], "b": h["b"], "y": h["y"], "an": h["an"],
         "ys": h["ys"], "dr": h["dr"],
         "measured": (f"Footprint {h['ms']['a']:,.1f} m2 on {h['ms']['nv']} "
                      f"published vertices; roof {h['ms']['h']:,.1f} m and top "
                      f"{h['ms']['t']:,.1f} m above ground; plan radius "
                      f"{h['ms']['r']:,.2f} m; roll year {h['ms']['yr']}."),
         "hu": h.get("hu"), "ms": h["ms"], "em": h["em"], "ac": h.get("ac", -1),
         "accent": (side["mat"][h["ac"]][1] if h.get("ac", -1) >= 0 else None)}
        for h in H]
    side["parts"] = strings
    return w.serialise(), {"n": len(H), "parts": len(pk), "verts": len(rx),
                           "profPts": len(pu)}


def main() -> int:
    check = "--check" in sys.argv
    H, side = read_shipped()
    seed_keys = {h["k"] for h in json.loads(SEED.read_text())["heroes"]}

    # ── THE ROUND TRIP, AND IT IS THE ONLY THING THAT MAKES A MERGE SAFE ────
    # This file rewrites a chunk it did not write. If reading the eleven back
    # out and re-encoding them is not byte-identical to what is on disk, then
    # every re-run of this script silently rewrites eleven landmarks, and the
    # first symptom is a hero moving. Asserted before anything is added.
    import copy
    rt, _ = encode(copy.deepcopy(H), json.loads(json.dumps(side)))
    on_disk = (OUT / "base" / "heroes.qc").read_bytes()
    if rt != on_disk:
        raise SystemExit(f"the eleven do not survive a read/re-encode round "
                         f"trip: {len(rt)} bytes against {len(on_disk)} on disk")
    if "--roundtrip" in sys.argv:
        print(f"round trip: IDENTICAL, {len(rt):,} bytes, {len(H)} heroes")
        return 0

    # ── A SEED THAT DROPS A HERO HAS TO DROP IT ON DISK TOO ────────────────
    # A merge that only ever adds is not idempotent with respect to its own
    # seed: taking a row out of `heroes_extra.json` would leave it shipped
    # forever, and the only way back would be re-running the whole city
    # encoder. The manifest records which keys this file put there, so a key
    # that WAS ours and is no longer claimed is removed. Rows that came out of
    # the mock are never touched by this.
    prev = json.loads(MANIFEST.read_text()).get("landmarks", {}) \
                                           .get("authoredHere", {}).get("keys", [])
    dropped = [k for k in prev if k not in seed_keys]
    if dropped:
        H = [h for h in H if h["k"] not in dropped]
        print(f"    dropped (no longer in the seed): {', '.join(dropped)}")
    # THIS SCRIPT IS RE-RUNNABLE, SO "how many came out of the mock" CANNOT BE
    # `len(H)`: on the second run the register on disk already carries the rows
    # this file put there, and a row this run is about to drop is still in it.
    # Counted after the drop, over the rows this seed does not claim.
    base_n = sum(1 for h in H if h["k"] not in seed_keys)
    B = read_bldg()
    seed = json.loads(SEED.read_text())

    # ── EVERY HERO IS RE-ATTACHED BY IDENTITY, INCLUDING THE MOCK'S ELEVEN ──
    # See WHICH BUILDING A HERO IS ON. The key lives in this file's own seed
    # because it has to be written down somewhere to be stable, and it is
    # harvested from the register rather than typed: `--harvest-identity`.
    keys = seed.get("attachments", {}).get("keys", {})
    if "--harvest-identity" in sys.argv:
        want = {h["k"]: h["b"] for h in H} | {x["k"]: x["b"] for x in seed["heroes"]}
        got = {k: identity_of(B, b) for k, b in sorted(want.items())}
        seed.setdefault("attachments", {})["keys"] = got
        seed["attachments"]["note"] = ATTACH_NOTE
        SEED.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n")
        for k, v in got.items():
            print(f"    {k:14s} centroid ({v['cx']}, {v['cy']})  {v['nv']} vertices  "
                  f"{v['areaM2']:,} m2   margin {identity_margin(B, v, want[k]):.1f} m")
        print(f"harvested {len(got)} identities into {SEED.name}")
        return 0

    resolved: dict[str, int] = {}
    margins: dict[str, float] = {}
    for k in sorted({h["k"] for h in H} | {x["k"] for x in seed["heroes"]}):
        if k not in keys:
            raise SystemExit(
                f"{k}: no published footprint identity in {SEED.name}. A hero "
                f"may not name its building by a raw stream index -- see WHICH "
                f"BUILDING A HERO IS ON. Run:\n"
                f"    python3 pipeline/scripts/us_sf_places/emit_heroes.py "
                f"--harvest-identity")
        resolved[k] = resolve_identity(B, keys[k], k)
        margins[k] = identity_margin(B, keys[k], resolved[k])
    for h in H:
        if h["k"] in resolved and resolved[h["k"]] != h["b"]:
            raise SystemExit(
                f"{h['k']}: the shipped register has it on building {h['b']} and "
                f"its published footprint identity resolves to "
                f"{resolved[h['k']]}. The building stream has changed under the "
                f"chunk -- re-run encode_city_chunks.py, then this. Nothing "
                f"written.")

    # ── AND THE KEY HAS TO SURVIVE THE INSERTION IT EXISTS FOR ─────────────
    # Modelled exactly: two records inserted at 135,905 and 137,646, which is
    # where rescuing 1190 Mission and Salesforce Tower would put them. The two
    # inserted rows carry a placeholder ring far outside the city -- this test
    # is about INDEX INDEPENDENCE and makes no claim about their geometry; what
    # protects the key from a real neighbour is the margin printed above.
    shifted = _with_inserts(B, (135905, 137646))
    for k, want in resolved.items():
        b2 = resolve_identity(shifted, keys[k], k)
        expect = want + (1 if want >= 135905 else 0)
        expect += 1 if expect >= 137646 else 0
        if b2 != expect:
            raise SystemExit(f"{k}: the identity key is NOT index-independent: "
                             f"{want} -> {b2}, expected {expect}")
    stale = sum(1 for k, want in resolved.items()
                if want != want + (1 if want >= 135905 else 0))

    # the emphasis fit, asserted against the eleven it was fitted to
    worst = 0.0
    for h in H:
        got = em_for(h["ms"]["t"])
        for b, v in h["em"].items():
            worst = max(worst, abs(got[b] - v))
    if worst > EM_TOL:
        raise SystemExit(f"the emphasis fit no longer reproduces the shipped "
                         f"register: worst error {worst:.4f} > {EM_TOL}")

    added = []
    for s in seed["heroes"]:
        # THE RESOLVED INDEX, NOT THE LITERAL. `b` in the seed is advisory --
        # it records which index this resolved to when the row was written, and
        # it is asserted rather than trusted.
        b = resolved[s["k"]]
        if b != s["b"]:
            raise SystemExit(
                f"{s['k']}: the seed's advisory index is {s['b']} and its "
                f"published footprint identity resolves to {b}. The stream has "
                f"changed under the seed; update `b` to {b} (the identity is "
                f"what selects the building, so the drawing is unaffected) and "
                f"re-run. Nothing written.")
        if not 0 <= b < B["n"]:
            raise SystemExit(f"{s['k']}: building index {b} out of range")
        o = int(B["off"][b]); c = int(B["cnt"][b])
        ring = [(float(B["IX"][o + k]), float(B["IY"][o + k])) for k in range(c)]
        sec = s["section"]
        if sec.get("form") == "temple":
            top_m = float(B["h"][b])
            parts, geo = build_temple(ring, top_m, sec)
            roof_m = top_m
        elif sec.get("form") == "pyramid":
            # THE PUBLISHED TOP REPLACES THE FABRIC'S, and that is the point of
            # the record: base/heroes carries its own `top` and the hero
            # replaces the prism entirely, so the median-LIDAR height never
            # reaches the frame for this building.
            parts, geo = build_pyramid(ring, sec)
            top_m = geo["topM"]
            roof_m = geo["shaftTopM"]
        else:
            top_m = float(B["h"][b])
            parts, geo = build_parts(ring, top_m, sec)
            roof_m = top_m

        # ── §11's GATE, run here before a byte is written ──────────────────
        # AGAINST THE RING THE PARTS WERE BUILT ON. For a hull form that is the
        # hull, and the record says so — testing a hull-built part against the
        # notched ring would fail on a vertex that is inside the drawn solid.
        gate_ring = ring
        for p in parts:
            for k in range(len(p["r"]) // 2):
                px, py = p["r"][2 * k], p["r"][2 * k + 1]
                if not contained(gate_ring, px, py):
                    raise SystemExit(f"{s['k']}: a part vertex is outside the "
                                     f"published footprint at ({px:.2f},{py:.2f})")
            if p["z1"] > top_m + 1e-6:
                raise SystemExit(f"{s['k']}: a part stands above the measured top")

        rec = {
            "k": s["k"], "n": s["n"], "b": b, "y": s["y"], "an": s["an"],
            "ys": s["ys"], "dr": s["dr"], "ac": -1,
            "hull": int(geo.get("hull", 0)),
            "hu": (None if not geo.get("hull") else
                   f"The containment reference is the published ring's own "
                   f"CONVEX HULL, which is the relaxation Sutro Tower already "
                   f"declares. The drawn base is the register's own plan area "
                   f"({geo.get('planM2')} m2, `base_plan_size` 165x165 ft) laid "
                   f"on the footprint's orientation; the published ring is the "
                   f"PARCEL outline ({geo.get('ringM2')} m2) and carries a "
                   f"concave notch the tower's plan does not have. One vertex "
                   f"of the published plan lies **{geo.get('worstOutM')} m** "
                   f"outside the ring, over that notch, and no uniform scale "
                   f"clears it without drawing a base smaller than the one the "
                   f"publisher states. Measured and declared rather than "
                   f"waived."),
            # the roofline is the top of the BULK: for a section it is the
            # building, for a pyramid it is where the architectural cap starts,
            # so the cap is a crown and is drawn at the crown factor
            "zr": roof_m,
            "ax": float(B["cx"][b]), "ay": float(B["cy"][b]),
            "ms": {"a": round(abs(ring_area(ring)), 1), "h": roof_m, "t": top_m,
                   "r": 0.0, "yr": int(B["yr"][b]) + 1849, "nv": c},
            "p": parts,
        }
        rec["em"] = em_for(top_m)
        H = [x for x in H if x["k"] != s["k"]]
        H.append(rec)
        added.append((s["k"], geo, rec))

    # ── the published top, applied AFTER the emphasis fit is asserted ─────
    # The fit above is checked against the register as shipped, which is the
    # only thing it can be checked against; `em` for an overridden hero is then
    # recomputed from its new top by the same `em_for`.
    tops = apply_published_tops(H, seed)

    blob, stat = encode(H, side)
    if check:
        cur = (OUT / "base" / "heroes.qc").read_bytes()
        print("round trip:", "IDENTICAL" if blob == cur else
              f"differs ({len(blob)} vs {len(cur)} bytes)")
        return 0

    (OUT / "base" / "heroes.qc").write_bytes(blob)
    (OUT / "base" / "heroes.json").write_text(
        json.dumps(side, separators=(",", ":"), ensure_ascii=False))

    man = json.loads(MANIFEST.read_text())
    for ch in man["chunks"]:
        if ch["k"] == KEY:
            ch["b"] = len(blob)
            ch["gz"] = len(gzip.compress(blob, 9))
            ch["n"] = stat["n"]
            ch["parts"] = stat["parts"]
            ch["verts"] = stat["verts"]
            ch["profPts"] = stat["profPts"]
    lm = man["landmarks"]
    lm.update({k: stat[k] for k in ("n", "parts", "verts", "profPts")})
    lm["publishedTops"] = {
        "note": ("A hero whose drawn top was the MEDIAN LIDAR return over its "
                 "footprint and whose own record cites a published height. The "
                 "authored heights are fractions of the old top, so one factor "
                 "on every z evaluates the same authored form against the "
                 "published number; no ring moves."),
        "applied": {k: {"wasM": was, "isM": want, "factor": round(f, 6),
                        "dofAglFt": agl,
                        "src": seed["publishedTops"][k]["src"]}
                    for k, was, want, f, agl, _ in tops},
    }
    lm["authoredHere"] = {
        "script": "pipeline/scripts/us_sf_places/emit_heroes.py",
        "seed": "pipeline/scripts/us_sf_places/heroes_extra.json",
        "n": len(added),
        "keys": [k for k, _, _ in added],
        "fromTheMock": base_n,
        "note": ("These heroes are NOT in the mock's wonder/hero-data.js. Every "
                 "ring, area, height, ground anchor and roll year is read out "
                 "of the published footprint the seed names; the SECTION is "
                 "drawn, on the same rule the 68 shaped caps are drawn under, "
                 "and each record's `dr` says which is which. Re-running "
                 "encode_city_chunks.py rebuilds base/heroes.* from the mock "
                 "and drops these; re-run this after it."),
        "emphasis": {
            "zexb": EM_ZEXB, "H": EM_H, "base": EM_BASE, "z": EM_Z,
            "note": ("`em` is landmarks.ts's own emphasis() at the three preset "
                     "cameras. The mock ships the eleven values and not the two "
                     "parameters behind them, so they are fitted here and "
                     f"asserted: worst error over the shipped register "
                     f"{worst:.4f}, tolerance {EM_TOL}."),
        },
    }
    MANIFEST.write_text(json.dumps(man, separators=(",", ":")))

    print(f"    identity: all {len(resolved)} heroes re-attached by their published "
          f"footprint (centroid, vertex count, area); worst margin to another "
          f"building {min(margins.values()):.1f} m; index-independence proved "
          f"against a two-record insertion at 135,905 and 137,646, which moves "
          f"{stale} of {len(resolved)} raw indices")
    for k, was, want, f, agl, already in tops:
        src = (f"FAA DOF re-read: {agl} ft" if agl is not None
               else "!! faa_dof.zip ABSENT - NOT re-verified this run")
        if already:
            print(f"    {k:12} already at its published top {want} m ({src})")
        else:
            print(f"    {k:12} top {was} m -> {want} m, x{f:.4f} on every "
                  f"authored z; rings untouched ({src})")
    print(f"base/heroes.qc    {len(blob):,} bytes  "
          f"({len(gzip.compress(blob, 9)):,} gzipped)  "
          f"{stat['n']} heroes ({base_n} from the mock, {len(added)} here)")
    for k, geo, rec in added:
        print(f"    {k:12} b={rec['b']}  {rec['ms']['a']:,.1f} m2 on "
              f"{rec['ms']['nv']} vertices, top {rec['ms']['t']} m")
        if geo["kind"] == "pyramid":
            print(f"      pyramid: top {geo['topM']} m (published 853 ft), shaft "
                  f"to {geo['shaftTopM']} m, plan {geo['joinScale']:.4f} of base "
                  f"at the join, {geo['ftPerStorey']} ft a storey-equivalent")
            print(f"      base: the largest convex figure the published "
                  f"footprint contains -- {geo['drawnM2']} m2 of "
                  f"{geo['ringM2']} m2 ({100 * geo['drawnM2'] / geo['ringM2']:.1f} %), "
                  f"{geo['baseNv']} of its {geo['ringNv']} vertices, no shrink; "
                  f"the hull would be {geo['hullM2']} m2 and the register's own "
                  f"base_plan_size {geo['planM2']} m2, and neither fits")
            print(f"      em: {rec['em']}")
            continue
        if geo["kind"] == "temple":
            print(f"      temple: face {geo['faceI']}->{geo['faceJ']}, "
                  f"{geo['faceM']} m, deepest safe inset {geo['deepestInsetM']} m; "
                  f"base to {geo['zBaseM']} m, wall to {geo['zWallM']} m, "
                  f"cornice to {geo['zCorniceM']} m, top {geo['topM']} m")
            print(f"      portico {geo['porticoM2']} m2 and {geo['columns']} "
                  f"columns at {geo['columnPitchM']} m centres")
            print(f"      em: {rec['em']}")
            continue
        print(f"      section: {geo['kind']}, half-width {geo['w']} m, deepest "
              f"safe inset {geo['dmax']} m, eaves {geo['eaves']} m, roof rise "
              f"{geo['rise']} m" + (f" off a segmental arc of rise {geo['arcRise']} m"
                                    if geo['kind'] == 'segmental' else ""))
        print(f"      em: {rec['em']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
