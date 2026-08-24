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
from _chunk import ChunkWriter, field_array, read_chunk  # noqa: E402
from _bldgsrc import read_bldg  # noqa: E402

SEED = HERE / "heroes_extra.json"
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
        b = s["b"]
        if not 0 <= b < B["n"]:
            raise SystemExit(f"{s['k']}: building index {b} out of range")
        o = int(B["off"][b]); c = int(B["cnt"][b])
        ring = [(float(B["IX"][o + k]), float(B["IY"][o + k])) for k in range(c)]
        top_m = float(B["h"][b])
        parts, geo = build_parts(ring, top_m, s["section"])

        # ── §11's GATE, run here before a byte is written ──────────────────
        for p in parts:
            for k in range(len(p["r"]) // 2):
                px, py = p["r"][2 * k], p["r"][2 * k + 1]
                if not contained(ring, px, py):
                    raise SystemExit(f"{s['k']}: a part vertex is outside the "
                                     f"published footprint at ({px:.2f},{py:.2f})")
            if p["z1"] > top_m + 1e-6:
                raise SystemExit(f"{s['k']}: a part stands above the measured top")

        rec = {
            "k": s["k"], "n": s["n"], "b": b, "y": s["y"], "an": s["an"],
            "ys": s["ys"], "dr": s["dr"], "hu": None, "ac": -1, "hull": 0,
            "zr": top_m,               # no crown: the section IS the building
            "ax": float(B["cx"][b]), "ay": float(B["cy"][b]),
            "ms": {"a": round(abs(ring_area(ring)), 1), "h": top_m, "t": top_m,
                   "r": 0.0, "yr": int(B["yr"][b]) + 1849, "nv": c},
            "p": parts,
        }
        rec["em"] = em_for(top_m)
        H = [x for x in H if x["k"] != s["k"]]
        H.append(rec)
        added.append((s["k"], geo, rec))

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

    print(f"base/heroes.qc    {len(blob):,} bytes  "
          f"({len(gzip.compress(blob, 9)):,} gzipped)  "
          f"{stat['n']} heroes ({base_n} from the mock, {len(added)} here)")
    for k, geo, rec in added:
        print(f"    {k:12} b={rec['b']}  {rec['ms']['a']:,.1f} m2 on "
              f"{rec['ms']['nv']} vertices, top {rec['ms']['t']} m")
        print(f"      section: {geo['kind']}, half-width {geo['w']} m, deepest "
              f"safe inset {geo['dmax']} m, eaves {geo['eaves']} m, roof rise "
              f"{geo['rise']} m" + (f" off a segmental arc of rise {geo['arcRise']} m"
                                    if geo['kind'] == 'segmental' else ""))
        print(f"      em: {rec['em']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
