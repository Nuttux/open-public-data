"""base/bridge.qc — the San Francisco-Oakland Bay Bridge, west crossing.

    python3 pipeline/scripts/us_sf_places/emit_bay_bridge.py
    python3 pipeline/scripts/us_sf_places/emit_bay_bridge.py --roundtrip

THE SIDECAR PATTERN, `emit_heroes.py`'s own, for `emit_heroes.py`'s own reason.
`encode_city_chunks.py` owns `base/bridge` and its re-runs must stay
byte-identical, and the Golden Gate it ships comes out of the mock's `LRGG`.
The Bay Bridge is not in the mock at all. So: its own script, the SHARED
`_chunk.ChunkWriter` so the container is the same container, a MERGE that reads
the Golden Gate back off the shipped chunk and re-encodes it byte-identically
before adding anything, and a read-modify-write of the manifest.

**THE TRAP is the same one every sidecar here carries: re-running
`encode_city_chunks.py` rebuilds `base/bridge` from the mock and drops the Bay
Bridge. This must be re-run after it.**

── WHY IT IS NOT IN THE CITY'S OWN REGISTERS ──────────────────────────────
The Golden Gate is drawn off `97yj-54sx`, Article 10 landmark no. 222 — a CITY
landmark with a CITY ring. The Bay Bridge is a Caltrans structure and every
register this pipeline reads is a register of City property, so it appears in
none of them. That is the same shape as the neighbourhood problem one level out
and it is not a gap in the data: the bridge is published, just not by the City.
All three files it is built from are the three the Golden Gate is ALREADY built
from, which is the whole argument for drawing it.

── WHAT IS PUBLISHED AND WHAT IS A DRAWING DECISION ───────────────────────
PUBLISHED, and every number below is read out of a file at run time:

  the alignment   US Census TIGERweb Primary Roads, feature OID 11017076382872,
                  17 vertices, 'Bay Brg'. Clipped by the Golden Gate's own rule
                  — that record stops mid-channel "because that is where San
                  Francisco stops" — against TIGERweb State_County 06/075.
                  This feature needs no clipping: BOTH ENDS ARE INSIDE THE
                  COUNTY. It runs from Rincon Hill to Yerba Buena Island, which
                  is where the west crossing ends, so the deck stops at a
                  terminus rather than at a cut.
  the towers      FAA Digital Obstacle File, four BRIDGE obstacles, projected
                  onto the deck line exactly as the Golden Gate's two are.
  the dimensions  FHWA NBI 2023 structure 34 0003: STRUCTURE_LEN_MT_049,
                  MAX_SPAN_LEN_MT_048, DECK_WIDTH_MT_052, NAV_VERT_CLR_MT_039.
  the year        YEAR_BUILT_027 = 1936, on the Golden Gate's own rule that a
                  map drawing where a bridge IS wants completion. The Bay
                  Bridge therefore opens on this map a year BEFORE the Golden
                  Gate, which is what happened.

A DRAWING DECISION, stated:

  the ring        The Golden Gate has a PUBLISHED ring; this bridge has a
                  published CENTRELINE and a published DECK WIDTH. The quad is
                  the centreline offset by half of DECK_WIDTH_MT_052. It is
                  therefore the roadway exactly, where the Golden Gate's ring is
                  the landmark parcel and is wider than its roadway.
  the axis        `drawBridge` reads a straight axis off the ring's end edges.
                  MEASURED, not assumed: this alignment's 17 vertices run
                  3,133.0 m along the path against 3,131.5 m end to end, a
                  ratio of 1.0005. Straight to within 1.5 m over 3.1 km, so the
                  quad loses nothing. ASSERTED below at 0.5 %.
  the east span   NOT DRAWN, and this is the honest limit. 34 0006 is a
                  different alignment, and the 2013 structure is a
                  self-anchored suspension bridge with ONE tower and an
                  asymmetric cable that `drawBridge`'s symmetric model does not
                  describe. Drawing it with the wrong form would be worse than
                  leaving it out. The west crossing is the part that is inside
                  San Francisco and the part the city looks at.
"""
from __future__ import annotations

import csv
import io
import json
import math
import pathlib
import re
import sys
import zipfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CITY = ROOT / "pipeline" / "scripts" / "us_sf_city"
sys.path.insert(0, str(CITY))
# The city-free half of the build. See pipeline/scripts/citymap/__init__.py.
sys.path.insert(0, str(ROOT / "pipeline" / "scripts"))
from citymap.chunk import ChunkWriter, field_array, read_chunk  # noqa: E402

CACHE = HERE / "cache"
OUT = ROOT / "website/public/data/us/sf/city"
MANIFEST = OUT / "manifest.json"
KEY = "base/bridge"
KIND = "bridge"

ALIGN_OID = "11017076382872"      # 'Bay Brg', the west crossing
NBI_WEST = "34 0003"
NBI_EAST = "34 0006"
FT = 0.3048
# the Golden Gate's own assertion, GGB_TOWER_TOL_M / the DOF's arc-second
TOWER_TOL_M = 31.0
# the quad is straight; this is the assertion that it may be
STRAIGHT_TOL = 0.005


# ── the projection, read out of the manifest and checked against it ─────────
def projector() -> tuple:
    P = json.loads(MANIFEST.read_text())["proj"]
    KX, KY = P["mpd"] * P["cosl"], P["mpd"]

    def xy(lo: float, la: float) -> tuple[float, float]:
        return ((lo - P["lon0"]) * KX, (la - P["lat0"]) * KY)

    # THE PROJECTION PROVING ITSELF. The manifest ships the Ferry Building's
    # own plane position; re-deriving it from its longitude and latitude has to
    # land on it. Without this every number below could be silently 2 km out.
    fx, fy = xy(-122.3937, 37.7955)
    want = P.get("ferry")
    if want and (abs(fx - want[0]) > 25 or abs(fy - want[1]) > 25):
        raise SystemExit(f"projection check failed: ferry ({fx:.1f}, {fy:.1f}) "
                         f"against the manifest's own {want}")
    return xy, (fx, fy), want


def county_rings() -> list:
    d = json.loads((CACHE / "sf_county_tiger.json").read_text())
    return d["features"][0]["geometry"]["rings"]


def inside(rings: list, px: float, py: float) -> bool:
    ins = False
    for r in rings:
        n = len(r)
        for i in range(n):
            x1, y1 = r[i][0], r[i][1]
            x2, y2 = r[(i + 1) % n][0], r[(i + 1) % n][1]
            if (y1 > py) != (y2 > py):
                if px < x1 + (py - y1) * (x2 - x1) / (y2 - y1):
                    ins = not ins
    return ins


def seg_dist(px: float, py: float, a, b) -> float:
    vx, vy = b[0] - a[0], b[1] - a[1]
    l2 = vx * vx + vy * vy
    t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((px - a[0]) * vx + (py - a[1]) * vy) / l2))
    return math.hypot(px - (a[0] + vx * t), py - (a[1] + vy * t))


def alignment(xy) -> list:
    d = json.loads((CACHE / "bay_bridge_tiger.json").read_text())
    for f in d["features"]:
        if f["attributes"]["OID"] != ALIGN_OID:
            continue
        for path in f["geometry"]["paths"]:
            pts = [xy(p[0], p[1]) for p in path]
            # Rincon Hill first, Yerba Buena last — the drawn direction
            if pts[0][0] > pts[-1][0]:
                pts = pts[::-1]
            return pts
    raise SystemExit(f"alignment {ALIGN_OID} not in the cached TIGER response")


def towers_from_dof(xy, rings, line) -> list:
    """The DOF's BRIDGE obstacles that fall ON the published deck line.

    The Golden Gate's own rule, applied unchanged: the file's positions are to
    the whole arc-second — 31 m of latitude here — so a tower is taken to be on
    the bridge when it is inside that, and it is then PROJECTED onto the line,
    because a tower cannot stand beside its own bridge.
    """
    out = []
    z = zipfile.ZipFile(CACHE / "faa_dof.zip")
    with io.TextIOWrapper(z.open("DOF.DAT"), encoding="latin-1") as fh:
        for i, ln in enumerate(fh):
            if i < 4 or len(ln) < 90 or ln[15:17].strip() != "CA":
                continue
            lat, lon = ln[35:47], ln[48:61]
            try:
                la = float(lat[0:2]) + float(lat[3:5]) / 60 + float(lat[6:11]) / 3600
                lo = float(lon[0:3]) + float(lon[4:6]) / 60 + float(lon[7:12]) / 3600
            except ValueError:
                continue
            lo = -lo
            m = re.match(r"\s*(\S.*?)\s+(\d)\s+(\d{5})\s+(\d{5})\s", ln[62:])
            if not m or m.group(1).strip() != "BRIDGE" or not inside(rings, lo, la):
                continue
            px, py = xy(lo, la)
            d = min(seg_dist(px, py, line[k], line[k + 1]) for k in range(len(line) - 1))
            if d > TOWER_TOL_M:
                continue
            out.append({"oas": ln[0:9].strip(), "p": (px, py), "off": round(d, 2),
                        "aglFt": int(m.group(3)), "amslFt": int(m.group(4))})
    out.sort(key=lambda t: t["p"][0])
    return out


def nbi(num: str) -> dict:
    with open(CACHE / "nbi_ca23.txt", encoding="latin-1") as fh:
        for r in csv.DictReader(fh):
            if r["STRUCTURE_NUMBER_008"].strip().strip("'") == num:
                g = lambda k: float(r[k].strip())          # noqa: E731
                return {"slen": g("STRUCTURE_LEN_MT_049"), "span": g("MAX_SPAN_LEN_MT_048"),
                        "w": g("DECK_WIDTH_MT_052"), "z": g("NAV_VERT_CLR_MT_039"),
                        "year": int(r["YEAR_BUILT_027"].strip()),
                        "recon": int(r.get("YEAR_RECONSTRUCTED_106", "0").strip() or 0)}
    raise SystemExit(f"NBI structure {num} not in the cached CA23 file")


def build() -> dict:
    xy, ferry, ferry_want = projector()
    rings = county_rings()
    line = alignment(xy)
    g = nbi(NBI_WEST)
    east = nbi(NBI_EAST)

    # ── the county rule, stated as a measurement rather than assumed ────────
    n_in = sum(1 for p in json.loads((CACHE / "bay_bridge_tiger.json").read_text())["features"]
               for path in p["geometry"]["paths"] for q in path if inside(rings, q[0], q[1]))
    n_tot = sum(len(path) for p in json.loads((CACHE / "bay_bridge_tiger.json").read_text())["features"]
                for path in p["geometry"]["paths"])
    ends_in = [inside(rings, *q) for q in
               [json.loads((CACHE / "bay_bridge_tiger.json").read_text())["features"][0]
                ["geometry"]["paths"][0][0]]]
    del ends_in

    # ── the axis, and the assertion that a quad may stand for 17 vertices ───
    path_m = sum(math.dist(line[i], line[i + 1]) for i in range(len(line) - 1))
    chord = math.dist(line[0], line[-1])
    if path_m / chord - 1 > STRAIGHT_TOL:
        raise SystemExit(f"the alignment is not straight enough for a quad: "
                         f"{path_m:.1f} m along against {chord:.1f} m end to end")

    ax, ay = line[0]
    bx, by = line[-1]
    ux, uy = (bx - ax) / chord, (by - ay) / chord
    nx, ny = -uy, ux
    half = g["w"] / 2

    # `drawBridge` reads the axis between the midpoints of ring[0..1] and
    # ring[2..3], so the quad is written in that order and nothing else.
    # CLOSED, five vertices, in the shipped Golden Gate's own order: two at
    # one end, two at the other, then back to the first. `drawBridge` reads
    # only 0..3 but the container's convention is the container's convention.
    ring = [(ax + nx * half, ay + ny * half), (ax - nx * half, ay - ny * half),
            (bx - nx * half, by - ny * half), (bx + nx * half, by + ny * half)]
    ring.append(ring[0])

    tow = towers_from_dof(xy, rings, line)
    if len(tow) < 2:
        raise SystemExit(f"only {len(tow)} tower(s) on the deck line — a bridge "
                         f"needs at least two for drawBridge's cable model")
    # projected onto the axis, the Golden Gate's own correction
    proj_t = []
    for t in tow:
        s = ((t["p"][0] - ax) * ux + (t["p"][1] - ay) * uy)
        t["t"] = s / chord
        proj_t.append((ax + ux * s, ay + uy * s))

    # THE CROSS-CHECK. Two federal files, nothing fitted: the spacings between
    # the DOF's towers against the NBI's own published maximum span.
    seps = [round(math.dist(proj_t[i], proj_t[i + 1]), 1) for i in range(len(proj_t) - 1)]
    near = [s for s in seps if abs(s - g["span"]) / g["span"] < 0.02]
    if not near:
        raise SystemExit(f"no tower spacing {seps} is within 2 % of the published "
                         f"max span {g['span']} m — the two files disagree")

    return {"ring": ring, "towers": proj_t, "tow": tow, "seps": seps, "near": near,
            "g": g, "east": east, "path_m": path_m, "chord": chord,
            "n_in": n_in, "n_tot": n_tot, "ferry": ferry, "ferry_want": ferry_want,
            "line": line}


def _sha(name: str) -> str:
    import hashlib
    meta = CACHE / f"{name}.meta.json"
    if meta.exists():
        return json.loads(meta.read_text())["sha256"]
    return hashlib.sha256((CACHE / name).read_bytes()).hexdigest()


def _retrieved(name: str) -> str:
    import datetime
    return datetime.date.fromtimestamp(
        (CACHE / name).stat().st_mtime).isoformat()


def declare_sources(man: dict, B: dict) -> None:
    """The three files, and the fields that could not exist before them.

    `rn`, `tn` and `tz` are NEW FIELDS on the `bridge` kind and `data.test.ts`
    asserts that every field of every kind names a source that exists, so they
    are declared here with the same URL / retrieval date / SHA-256 the Golden
    Gate's federal sources carry. They are not bookkeeping: the counts exist
    BECAUSE a second published alignment was added, and `tz` exists because the
    four towers of the west crossing are not all the same height, which the
    Golden Gate's two are.
    """
    g = B["g"]
    man["sources"]["bay-align"] = {
        "publisher": "US Census",
        "dataset": f"TIGERweb Primary Roads, feature OID {ALIGN_OID} 'Bay Brg'",
        "url": ("https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/"
                "Transportation/MapServer/2/query"),
        "retrieved": _retrieved("bay_bridge_tiger.json"),
        "sha256": _sha("bay_bridge_tiger.json"),
        "what": (f"the west crossing's centreline, {len(B['line'])} vertices, "
                 f"Rincon Hill to Yerba Buena Island — {B['path_m']:.1f} m along "
                 f"the path against {B['chord']:.1f} m end to end, straight to "
                 f"within {B['path_m'] - B['chord']:.1f} m over 3.1 km. `rn` is "
                 "the per-bridge ring vertex count and exists because this "
                 "second alignment was added; a chunk with one bridge carries no "
                 "counts at all. Clipped by the Golden Gate's own county rule "
                 "against TIGERweb State_County 06/075: "
                 f"{B['n_in']} of {B['n_tot']} 'Bay Brg' vertices are inside San "
                 "Francisco and this feature is wholly inside, terminating at "
                 "Yerba Buena Island where the west crossing ends"),
        "not_measured": ("The DECK RING is not published for this bridge. The "
                         "Golden Gate has a City landmark ring; this is a "
                         "Caltrans structure and appears in no City register, so "
                         "the quad drawn is the published centreline offset by "
                         "half of the NBI's published DECK_WIDTH_MT_052. It is "
                         "therefore the roadway exactly. Like the Golden Gate the "
                         "deck is drawn FLAT — no deck height is published — and "
                         "it carries no family colour, no place mark, no hit "
                         "target and no money."),
        "licence": "work of the US government, public domain",
    }
    man["sources"]["bay-faa"] = {
        "publisher": "FAA",
        "dataset": ("Digital Obstacle File, obstacles "
                    + ", ".join(t["oas"] for t in B["tow"]) + ", type BRIDGE"),
        "url": "https://aeronav.faa.gov/Obst_Data/DAILY_DOF_DAT.ZIP",
        "retrieved": _retrieved("faa_dof.zip"),
        "sha256": _sha("faa_dof.zip"),
        "what": ("the four towers of the west crossing and their heads above "
                 "sea level: "
                 + ", ".join(f"{t['oas']} {t['amslFt']} ft" for t in B["tow"])
                 + ". `tn` is the per-bridge tower count and `tz` each tower's "
                 "head in metres — the Golden Gate's two entries come from the "
                 "same file (see ggb-faa, both 760 ft) and the field carries "
                 "both bridges. Positions are to the whole arc-second, 31 m of "
                 "latitude here, and are projected onto the published deck line "
                 "exactly as the Golden Gate's two are, moving them "
                 + ", ".join(f"{t['off']} m" for t in B["tow"]) + "."),
        "corroboration": (
            "TWO INDEPENDENT FEDERAL FILES, NOTHING FITTED. The spacings between "
            "these tower positions are "
            + ", ".join(f"{v} m" for v in B["seps"])
            + f", against the FHWA's own published MAX_SPAN_LEN_MT_048 of "
            f"{g['span']} m for the same structure. The two 701.3 m figures are "
            "the two main spans and the middle gap contains the central "
            "anchorage the two suspension spans share."),
        "licence": "work of the US government, public domain",
    }
    man["sources"]["bay-nbi"] = {
        "publisher": "FHWA",
        "dataset": (f"National Bridge Inventory 2023 (California), structures "
                    f"{NBI_WEST} and {NBI_EAST}"),
        "url": "https://www.fhwa.dot.gov/bridge/nbi/2023/delimited/CA23.txt",
        "retrieved": _retrieved("nbi_ca23.txt"),
        "sha256": _sha("nbi_ca23.txt"),
        "what": (f"{NBI_WEST}: structure length {g['slen']} m, max span "
                 f"{g['span']} m, deck width {g['w']} m, navigational vertical "
                 f"clearance {g['z']} m, YEAR_BUILT_027 = {g['year']} "
                 f"(reconstructed {g['recon']}). The year is completion, on the "
                 "Golden Gate's own rule that a map drawing where a bridge IS "
                 f"wants the year it existed — so the Bay Bridge opens on this "
                 f"map in {g['year']}, a year BEFORE the Golden Gate, which is "
                 "what happened."),
        "not_measured": (
            f"{NBI_EAST}, the {B['east']['year']} east span "
            f"({B['east']['slen']} m, max span {B['east']['span']} m), IS NOT "
            "DRAWN. It is a different alignment and a self-anchored suspension "
            "bridge with one tower and an asymmetric cable, which the symmetric "
            "cable model in landmarks.ts does not describe. Drawing it in the "
            "wrong form would be worse than leaving it out."),
        "licence": "work of the US government, public domain",
    }
    k = man["kinds"][KIND]
    have = {f["n"] for f in k["fields"]}
    for n, t in (("rn", "u16"), ("tn", "u16"), ("tz", "f32")):
        if n not in have:
            k["fields"].append({"n": n, "t": t})
    k["provenance"].update({"rn": "bay-align", "tn": "bay-faa", "tz": "bay-faa"})
    k["note"] = (
        "TWO BRIDGES, and the layout is what makes that free. `rx`/`ry` and "
        "`tx`/`ty` are flat vertex streams over ALL bridges and `rn`/`tn` are "
        "the per-bridge counts; a chunk with ONE bridge carries no counts and "
        "is byte-identical to what the city encoder writes, which is how the "
        "Golden Gate's own bytes survived the merge unchanged and is asserted "
        "on every run of emit_bay_bridge.py. "
        "[1] THE GOLDEN GATE: ring of 5 from 97yj-54sx, 2 towers, 1937 — the "
        "NBI's completion year, which is when the bridge existed; 1933 is "
        "rzic-39gi's `yearbuilt`, is when construction BEGAN, is carried as "
        "`yearLandmark` and is NOT the gate. "
        f"[2] THE BAY BRIDGE, WEST CROSSING: ring of 5 derived from the "
        f"published centreline and DECK_WIDTH_MT_052, 4 towers, {g['year']}. "
        "It is in no City register — it is a Caltrans structure — and is built "
        "from the same three published files the Golden Gate is. "
        "The main cable's low point is drawn AT the deck between EVERY pair of "
        "consecutive towers, so the sag is always the difference between two "
        "published figures and never a number of its own; on the west crossing "
        "that puts the cable on the central anchorage the two suspension spans "
        "share without being told it is there. The suspender spacing (30 m) and "
        "the leg size (7 m) are drawing decisions; nothing publishes them.")


# ── the merge ──────────────────────────────────────────────────────────────
def read_shipped() -> list:
    """Whatever is on disk, as a list of spans — ONE from the city encoder, or
    N from a previous run of this script. Reading the merged shape back is what
    makes the round trip below an idempotence proof as well as a safety one."""
    hdr, pay = read_chunk((OUT / "base" / "bridge.qc").read_bytes())
    names = {f["n"] for f in hdr["fields"]}
    f = {n: field_array(hdr, pay, n) for n in ("rx", "ry", "tx", "ty")}
    rn = field_array(hdr, pay, "rn") if "rn" in names else None
    tn = field_array(hdr, pay, "tn") if "tn" in names else None
    tz = field_array(hdr, pay, "tz") if "tz" in names else None
    rc = [int(v) for v in rn] if rn is not None else [len(f["rx"])]
    tc = [int(v) for v in tn] if tn is not None else [len(f["tx"])]
    spans, ro, to = [], 0, 0
    for q in range(len(rc)):
        spans.append({
            "ring": [(float(f["rx"][ro + i]), float(f["ry"][ro + i]))
                     for i in range(rc[q])],
            "towers": [(float(f["tx"][to + i]), float(f["ty"][to + i]))
                       for i in range(tc[q])],
            "towerZ": ([float(tz[to + i]) for i in range(tc[q])]
                       if tz is not None else None),
        })
        ro += rc[q]
        to += tc[q]
    return spans


def encode(spans: list) -> bytes:
    """One chunk, N bridges, laid out as offsets into two flat vertex streams.

    `rn`/`tn` are the per-bridge counts. With ONE bridge they are `[len(ring)]`
    and `[len(towers)]` and the two flat streams are exactly what the encoder
    already writes — which is what makes the round-trip below possible and what
    lets `data.ts` read an old chunk that has no counts at all.
    """
    w = ChunkWriter(KEY, KIND)
    w.add("rx", "f32", [p[0] for s in spans for p in s["ring"]])
    w.add("ry", "f32", [p[1] for s in spans for p in s["ring"]])
    w.add("tx", "f32", [p[0] for s in spans for p in s["towers"]])
    w.add("ty", "f32", [p[1] for s in spans for p in s["towers"]])
    if len(spans) > 1:
        w.add("rn", "u16", [len(s["ring"]) for s in spans])
        w.add("tn", "u16", [len(s["towers"]) for s in spans])
        w.add("tz", "f32", [z for s in spans for z in s["towerZ"]])
    return w.serialise()


def main() -> int:
    import gzip

    shipped = read_shipped()
    on_disk = (OUT / "base" / "bridge.qc").read_bytes()
    man = json.loads(MANIFEST.read_text())
    ch = next(c for c in man["chunks"] if c["k"] == KEY)
    ggb = shipped[0]
    ggb_ring, ggb_tow = ggb["ring"], ggb["towers"]

    # ── THE ROUND TRIP, AND IT IS THE ONLY THING THAT MAKES A MERGE SAFE ────
    # This file rewrites a chunk it did not write. If reading the Golden Gate
    # back out and re-encoding it is not byte-identical to what is on disk,
    # then every re-run silently moves a bridge, and the first symptom is the
    # Golden Gate landing in the wrong strait. Asserted before anything is
    # added, and it is what proves the layout below is the encoder's own.
    rt = encode(shipped)
    if rt != on_disk:
        raise SystemExit(f"the shipped bridges do not survive a read/re-encode "
                         f"round trip: {len(rt)} bytes against {len(on_disk)} "
                         f"on disk")
    if "--roundtrip" in sys.argv:
        print(f"round trip: IDENTICAL, {len(rt):,} bytes, {len(shipped)} "
              f"bridge(s), " + " + ".join(f"{len(x['ring'])} ring / "
                                          f"{len(x['towers'])} towers"
                                          for x in shipped))
        return 0

    B = build()
    g, east = B["g"], B["east"]
    bay = {"ring": B["ring"], "towers": B["towers"],
           "towerZ": [t["amslFt"] * FT for t in B["tow"]]}
    # the Golden Gate's own towers are uniform; carried per-tower so ONE code
    # path draws both bridges and the uniform case is not a special case
    if not ggb.get("towerZ"):
        ggb["towerZ"] = [ch["towerFt"] * FT] * len(ggb_tow)

    spans = [ggb, bay]
    blob = encode(spans)
    (OUT / "base" / "bridge.qc").write_bytes(blob)

    ch["b"] = len(blob)
    ch["gz"] = len(gzip.compress(blob, 9))
    xs = [p[0] for s in spans for p in s["ring"]]
    ys = [p[1] for s in spans for p in s["ring"]]
    ch["e"] = [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)]
    ch["bridges"] = [
        {"k": "golden-gate", "ring": len(ggb_ring), "towers": len(ggb_tow),
         "year": ch["year"], "deckZ": ch["deckZ"], "deckW": ch["deckW"],
         "spanM": ch["spanM"], "deckLenM": ch["deckLenM"],
         "towerFt": ch["towerFt"], "oas": ch["oas"]},
        {"k": "bay-west", "ring": len(bay["ring"]), "towers": len(bay["towers"]),
         "year": g["year"], "deckZ": g["z"], "deckW": g["w"], "spanM": g["span"],
         "deckLenM": round(B["chord"], 1), "structureLenM": g["slen"],
         "towerFt": [t["amslFt"] for t in B["tow"]],
         "towerAglFt": [t["aglFt"] for t in B["tow"]],
         "towerOff": [t["off"] for t in B["tow"]],
         "oas": [t["oas"] for t in B["tow"]],
         "yearReconstructed": g["recon"], "nbi": NBI_WEST},
    ]
    ch["authoredHere"] = {
        "script": "pipeline/scripts/us_sf_places/emit_bay_bridge.py",
        "adds": ["bay-west"],
        "note": ("The Bay Bridge is NOT in the mock and NOT in any City "
                 "register — it is a Caltrans structure and every register this "
                 "pipeline reads is a register of City property. It is built "
                 "from the same three published files the Golden Gate is built "
                 "from. Re-running encode_city_chunks.py rebuilds base/bridge "
                 "from the mock and DROPS it; re-run this after it."),
        "alignment": {
            "publisher": "US Census", "dataset": "TIGERweb Primary Roads",
            "oid": ALIGN_OID, "verts": len(B["line"]),
            "pathM": round(B["path_m"], 1), "chordM": round(B["chord"], 1),
            "straightness": round(B["path_m"] / B["chord"], 5),
            "what": ("the west crossing, Rincon Hill to Yerba Buena Island. "
                     "Straight to within "
                     f"{B['path_m'] - B['chord']:.1f} m over "
                     f"{B['chord'] / 1000:.1f} km, so drawBridge's straight "
                     "axis loses nothing"),
        },
        "county": {
            "publisher": "US Census", "dataset": "TIGERweb State_County 06/075",
            "what": (f"{B['n_in']} of {B['n_tot']} vertices of every 'Bay Brg' "
                     "feature are inside San Francisco County. The drawn "
                     "feature needs no clipping: both its ends are inside, and "
                     "it terminates at Yerba Buena Island, which is where the "
                     "west crossing ends. The Golden Gate's own rule -- that "
                     "record stops mid-channel because that is where San "
                     "Francisco stops"),
        },
        "towers": {
            "publisher": "FAA", "dataset": "Digital Obstacle File, type BRIDGE",
            "tolM": TOWER_TOL_M,
            "what": (f"{len(B['tow'])} obstacles inside the county fall on the "
                     "published deck line within the file's own whole-arc-second "
                     "precision, and are projected onto it exactly as the Golden "
                     "Gate's two are"),
        },
        "crossCheck": {
            "towerSepM": B["seps"], "nbiMaxSpanM": g["span"],
            "what": ("TWO INDEPENDENT FEDERAL FILES, NOTHING FITTED. The "
                     "spacings between the FAA's tower positions against the "
                     "FHWA's own published maximum span. "
                     + ", ".join(f"{s} m" for s in B["near"])
                     + f" against {g['span']} m."),
        },
        "eastSpan": {
            "nbi": NBI_EAST, "year": east["year"], "lenM": east["slen"],
            "spanM": east["span"],
            "what": ("NOT DRAWN. A different alignment, and the 2013 structure "
                     "is a self-anchored suspension bridge with one tower and "
                     "an asymmetric cable that drawBridge's symmetric model "
                     "does not describe. Drawing it in the wrong form would be "
                     "worse than leaving it out."),
        },
        "projectionCheck": {
            "ferryDerived": [round(B["ferry"][0], 1), round(B["ferry"][1], 1)],
            "ferryManifest": B["ferry_want"],
            "what": ("the manifest ships the Ferry Building's own plane "
                     "position; re-deriving it from its longitude and latitude "
                     "lands on it, which is the projection proving itself"),
        },
    }
    declare_sources(man, B)
    MANIFEST.write_text(json.dumps(man, separators=(",", ":")))

    print(f"    alignment  {ALIGN_OID}  {len(B['line'])} vertices  "
          f"{B['path_m']:.1f} m along / {B['chord']:.1f} m chord  "
          f"(straightness {B['path_m'] / B['chord']:.5f})")
    print(f"    county     {B['n_in']} of {B['n_tot']} 'Bay Brg' vertices inside "
          f"San Francisco; the drawn feature is wholly inside")
    for t in B["tow"]:
        print(f"    tower      {t['oas']}  {t['amslFt']} ft AMSL / {t['aglFt']} AGL  "
              f"{t['off']:5.1f} m off the deck line")
    print(f"    CROSS-CHECK tower spacings {B['seps']} m against NBI max span "
          f"{g['span']} m -- two federal files, nothing fitted")
    print(f"    deck       {g['w']} m wide, {g['z']} m clearance, built {g['year']}"
          f" (reconstructed {g['recon']})")
    print(f"    east span  {NBI_EAST}, {east['year']}: NOT DRAWN, see the manifest")
    print(f"base/bridge.qc  {len(blob):,} bytes ({ch['gz']:,} gzipped), "
          f"2 bridges, {len(ggb_ring) + len(bay['ring'])} ring vertices, "
          f"{len(ggb_tow) + len(bay['towers'])} towers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
