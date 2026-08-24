"""base/places.qc + base/places.json — the named places, as a chunk.

    python3 pipeline/scripts/us_sf_places/emit_places.py
    python3 pipeline/scripts/us_sf_places/emit_places.py --marks   also rewrite
                                                                   base/marks.json

THE SIDECAR PATTERN, and why this is a second emitter and not an edit to
`encode_city_chunks.py`. That encoder owns the mock's own arrays and re-runs
must stay byte-identical; this block's registers are not in the mock at all.
So this file follows `emit_surround_coast.py`: its own script, its own output,
the SHARED `_chunk.ChunkWriter` so the container is the same container, and a
read-modify-write of the manifest so the provenance lands in the same place as
everybody else's.

THE SPLIT BETWEEN CHUNK AND SIDECAR is §3 of `src/lib/city/DATA.md`, unchanged:
numbers go in the chunk as typed arrays the client can view with no parsing;
STRINGS go in a small JSON companion, because a name is not a number and
`base/marks.json` and `base/blocks-id.json` already do exactly this.

`--marks` additionally writes the merged list back into `base/marks.json` in
that file's existing shape. THAT IS A COMPATIBILITY STEP, not the deliverable:
it is what lets the shipped `CityMap.tsx` fetch — which this block does not own
and must not edit — pick the new places up with no code change at all. It must
be re-run after `encode_city_chunks.py`, which rebuilds `base/marks.json` from
the mock and would otherwise put the 1,243 back.
"""
from __future__ import annotations

import base64
import gzip
import json
import math
import pathlib
import struct
import sys

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "pipeline" / "scripts" / "us_sf_city"))
from _chunk import ChunkWriter  # noqa: E402

SRC_IN = HERE / "cache" / "_places.json"
OUT = ROOT / "website/public/data/us/sf/city"
MANIFEST = OUT / "manifest.json"

KEY = "base/places"
KIND = "places"

# ── the published source of every field, verbatim from the publishers ───────
SOURCES = {
    "place_a10": {
        "dataset": "97yj-54sx",
        "publisher": "DataSF",
        "what": "Landmarks Listed in Article 10 of the San Francisco Planning Code — the City's own statement of what it has DESIGNATED a landmark",
        "rows": 370,
    },
    "place_a10_attr": {
        "dataset": "rzic-39gi",
        "publisher": "DataSF",
        "what": "Landmarks, the same register with attributes; joined on landmarkno for yearbuilt only",
        "rows": 362,
    },
    "place_parks": {
        "dataset": "gtr9-ntp6",
        "publisher": "DataSF",
        "what": "Recreation and Parks Properties",
        "rows": 255,
    },
    "place_fac": {
        "dataset": "nc68-ngbr",
        "publisher": "DataSF",
        "what": "City Facilities",
        "rows": 1734,
    },
    "place_tall": {
        "dataset": "5kya-mfst",
        "publisher": "DataSF (Planning / Department of Building Inspection)",
        "what": "Tall Building Inventory — every building over 240 ft as of 1 October 2018, plus 24 over 160 ft",
        "rows": 180,
        "year_field": "date, the publisher's own \"Building's year of construction\", filled on 180 of 180 rows, 1889-2019",
        "dropped": "43 rows whose `name` is the row's own `address` and nothing more",
    },
    "place_a11": {
        "dataset": "ejht-vp5d",
        "publisher": "DataSF (Planning)",
        "what": "Article 11 Rating — parcels rated under Article 11 of the Planning Code (Historic Preservation), the downtown conservation register",
        "rows": 786,
        "named": 450,
        "year_field": "NONE — `datelisted` is 1899-12-30 on all 786 rows, the GIS null sentinel",
        "not_designated": "Article 11 is a rating inside a conservation district; Article 10 is the City designating a landmark. These rows carry no landmark mark.",
        "dropped": "8 rows whose name says the building is DEMOLISHED, 4 that are a cross-reference to another parcel",
    },
    "place_nrhp": {
        "dataset": "nrhp_locations, layers 0 and 1",
        "publisher": "US National Park Service",
        "what": "the National Register of Historic Places — 170 points and 27 polygons in San Francisco County",
        "year_field": "NONE that means existence — `CertDate` is the date the Keeper listed the property, not the year it was built, and is carried as provenance only",
        "dropped": "12 rows of ResType `district`; a district is not a place a name attaches to",
    },
    "place_college": {
        "dataset": "6adp-a5yv",
        "publisher": "DataSF, from the National Center for Education Statistics, as of 2011",
        "what": "Schools_College — campus boundaries",
        "rows": 46,
    },
    "place_popos": {
        "dataset": "65ik-7wqd",
        "publisher": "DataSF (Planning)",
        "what": "Privately Owned Public Open Spaces — the downtown plazas, terraces and atria",
        "rows": 81,
        "year_field": "year, filled on 81 of 81 rows (one reads `Under construction` and takes its footprint's year instead)",
    },
    "place_school": {
        "dataset": "7e7j-59qk",
        "publisher": "DataSF, from the California Department of Education",
        "what": "Schools",
        "rows": 235,
        "year_field": "NONE USED — `open_date` is 1980-07-01 on 146 of the 235 rows, which is where the CDE's own record starts and not when the school opened",
        "dropped": "1 row whose `status` is Pending",
    },
    "place_rpfac": {
        "dataset": "ib5c-xgwu",
        "publisher": "DataSF (Recreation and Parks)",
        "what": "Recreation and Parks Facilities — a structural or physical amenity within a property's boundaries",
        "rows": 2692,
        "dropped": "1,768 rows whose name the register also puts on another row (a category, not a name), then 387 more whose name is built only out of their own property's name and the file's own vocabulary of facility types",
    },
    "place_hero": {
        "dataset": "base/heroes.json",
        "publisher": "this map's own authored landmark register",
        "what": "a hero the map draws at EMPHASIS and that no other register names. Sutro Tower is in none of the ten registers above, none of the 1,243 places already shipped, and not in USGS GNIS either, which carries Mount Sutro and Sutro Reservoir and not the tower. The hero record names its own anchoring register, its own year source and its measured footprint area and top; the row is read off those and `span` is this file's own ladder, max(sqrt(footprint area), the drawn height).",
        "rows": 1,
    },
    "place_extent": {
        "derived_from": ["ynuv-fyni", "wv5m-vpq2"],
        "what": "the extent a name is sized by: the shipped LIDAR building footprint the place resolves to (by assessor parcel, or by its own published point falling inside the ring), else the registry's own polygon",
        "script": "pipeline/scripts/us_sf_places/build_places.py",
    },
    "place_year": {
        "what": "the first year the name may be written, on a four-rung ladder, and which rung is carried per row in `yrule`",
        "rungs": [
            "the register's own published year of construction",
            "the roll year of the building footprint it resolves to (wv5m-vpq2 year_property_built; 0 where the roll has none, which is exactly when the map draws that building in every year)",
            "the first dated building standing inside its own published extent — a statement about the map, not about the place",
            "the made-land year of the ground under it, so nothing is named over open water",
        ],
        "ground_only": "the third and fourth rungs are statements about a piece of GROUND. They date a park or a campus, where the ground is the thing named. They may not date a building or a structure, so a row from a building register that resolves to no dated footprint is NOT SHIPPED.",
    },
}

YRULE = [
    "already shipped in base/marks.json",
    "the register's own year",
    "the roll year of the footprint it resolves to",
    "the first dated building inside its own extent",
    "the made-land year of the ground under it",
]

FIELD_SOURCE = {
    "x": "place_extent",
    "y": "place_extent",
    "span": "place_extent",
    "bi": "place_extent",
    "yr": "place_year",
    "yrule": "place_year",
    "fl": "place_a10",
    "src": "place_extent",
}


HEROES = OUT / "base" / "heroes.json"
PARKS = OUT / "base" / "parks.qc"

# THE GROUND HAS TO BE MATERIALLY BIGGER THAN THE THING STANDING ON IT.
# A ring is a container only where its area is at least this many times the
# place's own extent area (`span` squared, which is how `span` is defined). It
# is a statement about what "inside" is worth saying, not a tuning knob: at 1x
# a park would contain itself, and Golden Gate Park's own point sits inside
# Golden Gate Park.
CONTAINED_RATIO = 4.0


def _park_rings() -> list[tuple[float, float, float, float, float, list]]:
    """`base/parks.qc`'s own polygons, decoded. World metres.

    The published extents of the parks, in the file the map already draws them
    from: `cls` per ring, `len` vertices per ring, `xy` as i32 DECIMETRES. Read
    here rather than re-fetched, so a containment claim is a claim about the
    ground the reader can see.
    """
    if not PARKS.exists():
        return []
    b = PARKS.read_bytes()
    hl, pl_, crc = struct.unpack("<III", b[4:16])
    hdr = json.loads(b[16:16 + hl].decode())
    poff = (16 + hl + 7) // 8 * 8
    pay = b[poff:poff + pl_]
    f = {q["n"]: q for q in hdr["fields"]}
    ln = struct.unpack_from(f"<{f['len']['c']}H", pay, f["len"]["o"])
    xy = struct.unpack_from(f"<{f['xy']['c']}i", pay, f["xy"]["o"])
    out, o = [], 0
    for n in ln:
        r = [(xy[o + 2 * k] / 10.0, xy[o + 2 * k + 1] / 10.0) for k in range(n)]
        o += 2 * n
        if len(r) < 3:
            continue
        a2 = sum(r[k][0] * r[(k + 1) % len(r)][1] - r[(k + 1) % len(r)][0] * r[k][1]
                 for k in range(len(r)))
        xs = [q[0] for q in r]
        ys = [q[1] for q in r]
        out.append((abs(a2) / 2, min(xs), min(ys), max(xs), max(ys), r))
    return out


def _in_ring(r: list, px: float, py: float) -> bool:
    n = len(r)
    ins = False
    for k in range(n):
        x1, y1 = r[k]
        x2, y2 = r[(k + 1) % n]
        if (y1 > py) != (y2 > py):
            if x1 + (py - y1) * (x2 - x1) / (y2 - y1) > px:
                ins = not ins
    return ins


def contained_flags(pl: list[dict]) -> list[bool]:
    """Which places stand INSIDE a published ground materially larger than them.

    THE CLASS OF BUG THIS IS FOR, measured before it was fixed. The whole-city
    frame could not write GOLDEN GATE PARK at any of the five zooms, and the
    only thing on the shared collision grid that overlapped its box was
    `Beach Chalet` — a restaurant standing inside the park, which carries an
    Article 10 designation and therefore runs in the FIRST lane, before the
    neighbourhood capitals. That is not one bad row. **498 of the 2,192 places
    stand inside a park ring at least four times their own extent**, twelve of
    them designated, and every one of them is a candidate to spend a ground's
    own name: Mother's Building inside the Zoo, the Stow Lake Boathouse inside
    Golden Gate Park, the Trocadero Clubhouse inside Stern Grove, City Cemetery
    inside Lincoln Park, four branch libraries inside their own parks.

    THE RANKING HAD NO NOTION OF ONE PLACE BEING INSIDE ANOTHER, and that is
    the defect. Span order alone says a 129 m restaurant outranks nothing at
    all, because the 2,048 m park it stands in is in a different lane and the
    lanes are ordered by `scene.ts`, not by this file.
    """
    rings = _park_rings()
    if not rings:
        return [False] * len(pl)
    out = []
    for q in pl:
        px, py = float(q["x"]), float(q["y"])
        own = float(q.get("span") or 0.0) ** 2
        hit = False
        for a, x0, y0, x1, y1, r in rings:
            if not (x0 <= px <= x1 and y0 <= py <= y1):
                continue
            if a < CONTAINED_RATIO * own:
                continue
            if _in_ring(r, px, py):
                hit = True
                break
        out.append(hit)
    return out


HERO_SRC = "base/heroes.json"


def hero_rows(pl: list[dict]) -> list[dict]:
    """A hero the map draws at EMPHASIS and never names gets a row of its own.

    SUTRO TOWER IS IN NONE OF THE REGISTERS. It is the most visible object in
    San Francisco — 210 m on a ridge, visible from most of the city on a clear
    day — the map draws it as one of the twelve authored landmarks, and the
    name lane had nothing to write. Checked, one by one, and this list is the
    point of the paragraph:

      * DataSF 97yj-54sx Article 10 landmarks and rzic-39gi — no
      * DataSF ejht-vp5d Article 11 Rating — no
      * DataSF gtr9-ntp6 Recreation and Parks Properties — no
      * DataSF ib5c-xgwu Recreation and Parks Facilities — no
      * DataSF nc68-ngbr City Facilities — no
      * DataSF 5kya-mfst Tall Building Inventory — no; it is a TOWER, not a
        building, and that register's own scope is buildings over 240 ft
      * DataSF 6adp-a5yv Schools_College, 7e7j-59qk Schools,
        65ik-7wqd POPOS — no
      * US NPS National Register of Historic Places — no
      * the 1,243 places already in `base/marks.json` — no
      * **USGS GNIS Domestic Names, California** (in `cache/`, 222 rows in San
        Francisco County) — no. GNIS carries `Mount Sutro` (Summit, id 253951)
        and `Sutro Reservoir` (Reservoir, id 235840). It does not carry the
        tower.

    THE PUBLISHED SOURCE THAT DOES CARRY IT IS THE MAP'S OWN HERO REGISTER, and
    that register is not a guess: `base/heroes.json` names, per hero, the
    register that anchors it to its footprint (`an`), the register its year
    comes from (`ys`), and its measured footprint area and top (`ms`). Every
    field of the row below is read off that record — the name, the ground
    anchor, the footprint index, the year — and `span` is the register's own
    ladder applied unchanged, `max(sqrt(footprint area), the drawn height)`.
    Nothing is authored here.

    The rule is general and it adds exactly one row today: **a hero with no
    place row gets one.** Add a hero and its name follows.
    """
    if not HEROES.exists():
        return []
    side = json.loads(HEROES.read_text())
    # THE GROUND ANCHOR IS ON THE CHUNK, NOT THE SIDECAR. `ax`/`ay` are f32
    # fields of base/heroes.qc — the footprint's own vertex mean, which is what
    # part3.html takes a hero's ground anchor from — so they are read from
    # there rather than approximated from anything else.
    hq = (OUT / "base" / "heroes.qc")
    ax = ay = None
    if hq.exists():
        b = hq.read_bytes()
        hl, plen, _crc = struct.unpack("<III", b[4:16])
        hdr = json.loads(b[16:16 + hl].decode())
        poff = (16 + hl + 7) // 8 * 8
        pay = b[poff:poff + plen]
        f = {q["n"]: q for q in hdr["fields"]}
        ax = struct.unpack_from(f"<{f['ax']['c']}f", pay, f["ax"]["o"])
        ay = struct.unpack_from(f"<{f['ay']['c']}f", pay, f["ay"]["o"])
    have = {q.get("bi") for q in pl if q.get("bi") is not None}
    out = []
    for q, h in enumerate(side["heroes"]):
        if h["b"] in have:
            continue
        if ax is None:
            raise SystemExit("base/heroes.qc is missing; a hero row needs its anchor")
        ms = h["ms"]
        out.append({
            "n": h["n"],
            "x": float(ax[q]),
            "y": float(ay[q]),
            "span": max(math.sqrt(float(ms["a"])), float(ms["t"])),
            "bi": h["b"],
            "y0": int(h["y"]),
            "y0rule": "the register's own year",
            "des": 0,
            "ggb": 0,
            "old": 0,
            "src": HERO_SRC,
            "spanFrom": "hero",
            "fpBy": None, "sid": None, "nrhpListed": None,
            "a11": None, "yrField": None,
        })
    return out


def order_places(pl: list[dict]) -> list[dict]:
    """THE ORDER IN THIS FILE IS THE ORDER THE INK BUDGET IS SPENT IN.

    `labels.ts` `placeNames` walks each class in the order it is handed, and
    the collision grid is first-come, so the array order IS the ranking. What
    `build_places.py` hands over is sorted by `span` descending, and that rule
    — *the biggest thing wins* — is what the whole-city frame of San Francisco
    was measured doing (DRAW.md §21.6):

        written   Golden Gate Bridge · War Memorial Complex · Beach Chalet ·
                  Alcoa Building · Palace Of Fine Arts · Mission High School ·
                  Chronicle Building · Maud's
        refused   San Francisco City Hall (span 106, loses its box to War
                  Memorial Complex, span 149, the block across Van Ness) ·
                  Ferry Building (101, loses to Alcoa Building, 116, four
                  hundred metres away) · Coit Tower (23, the grid is full long
                  before the walk reaches it)

    Every one of those is span order doing exactly what it says. It is not the
    same rule as *the thing a stranger came to find*.

    THE TIE-BREAK ADDED HERE IS NOT A LIST OF FAMOUS BUILDINGS. It is a second
    published register on this same site: `base/heroes.json`, the buildings the
    map spends its EMPHASIS on — drawn up to five times their measured size
    precisely because they would otherwise be too small to recognise. A place
    that resolves to one of those footprints is both the most certainly-a-
    landmark thing the frame can name and the thing most likely to be under the
    reader's eye, because it is the largest object drawn. So those rows go
    first and **everything else keeps `build_places.py`'s span order exactly**:
    the sort is stable and its only key is that one bit.

    Derived, not typed: the building indices come out of the shipped hero
    register. If a hero is added or removed the ranking follows with no edit
    here.
    """
    hero_bi = ({h["b"] for h in json.loads(HEROES.read_text())["heroes"]}
               if HEROES.exists() else set())
    cont = contained_flags(pl)
    for q, c in zip(pl, cont):
        q["_contained"] = bool(c)
    if not hero_bi and not any(cont):
        return pl
    # TWO KEYS, AND WHICH ONE WINS IS THE WHOLE ARGUMENT.
    #
    #   1. a hero's footprint goes FIRST
    #   2. a place standing inside a materially larger published ground goes
    #      LAST
    #
    # A hero beats containment and it has to: Coit Tower stands inside Pioneer
    # Park and the Palace of Fine Arts rotunda inside its own lagoon ring, and
    # both are the REASON a reader is looking at that ground. The map already
    # spends its emphasis on them. Demoting them would undo the fix in the
    # commit above.
    #
    # And demotion is not a re-lane: it cannot put Golden Gate Park ahead of
    # Beach Chalet, because one is designated and the other is not and
    # `scene.ts` walks the classes in a fixed order. What it does is spend the
    # designated class's EXACT ink budget on the rows that are not standing on
    # somebody else's name first — and at the whole-city camera that budget
    # binds after eight names, so the ground gets its box back.
    return sorted(pl, key=lambda q: (0 if q.get("bi") in hero_bi else 1,
                                     1 if q["_contained"] else 0))


def main() -> int:
    doc = json.loads(SRC_IN.read_text())
    extra = hero_rows(doc["places"])
    pl = order_places(doc["places"] + extra)
    rep = dict(doc["report"])
    if extra:
        rep["from_hero_register"] = [q["n"] for q in extra]

    srcs = sorted({p["src"] for p in pl})
    six = {s: i for i, s in enumerate(srcs)}
    yix = {y: i for i, y in enumerate(YRULE)}

    def yruleof(p: dict) -> int:
        if p["old"]:
            return 0
        return yix[p["y0rule"]]

    w = ChunkWriter(KEY, KIND)
    w.add("x", "i32", [int(round(p["x"] * 10)) for p in pl])
    w.add("y", "i32", [int(round(p["y"] * 10)) for p in pl])
    w.add("span", "u16", [max(1, min(65535, int(round(p["span"])))) for p in pl])
    w.add("bi", "i32", [p["bi"] if p["bi"] is not None else -1 for p in pl])
    w.add("yr", "u16", [max(0, min(65535, int(p["y0"]))) for p in pl])
    w.add(
        "fl",
        "u8",
        [(1 if p["des"] else 0) | (2 if p["ggb"] else 0) | (4 if p["old"] else 0)
         | (8 if p.get("_contained") else 0) for p in pl],
    )
    w.add("src", "u8", [six[p["src"]] for p in pl])
    w.add("yrule", "u8", [yruleof(p) for p in pl])
    blob = w.serialise()
    (OUT / "base" / "places.qc").write_bytes(blob)
    gzlen = len(gzip.compress(blob, 9))

    side = {
        "n": len(pl),
        "t": [p["n"] for p in pl],
        "SRC": srcs,
        "YRULE": YRULE,
        "ggb": doc["ggb"],
        "ggbYr": doc["ggbYr"],
        "meta": {
            "generated_by": "pipeline/scripts/us_sf_places/emit_places.py",
            "built_by": "pipeline/scripts/us_sf_places/build_places.py",
            "chunk": f"{KEY}.qc",
            "real": doc["marks_meta"]["real"]
            + [
                "names: DataSF 5kya-mfst (Tall Building Inventory), ejht-vp5d (Article 11 Rating), 6adp-a5yv (Schools_College), 65ik-7wqd (Privately Owned Public Open Spaces), 7e7j-59qk (Schools, from the California Dept of Education), ib5c-xgwu (Recreation and Parks Facilities); US National Park Service, National Register of Historic Places",
                "extent: the shipped LIDAR footprints (ynuv-fyni), or the registry's own polygon",
                "years: the register's own year of construction where one is published, else the roll year of the footprint the place resolves to (wv5m-vpq2)",
            ],
            "modelled": [],
            "report": rep,
        },
    }
    (OUT / "base" / "places.json").write_text(json.dumps(side, separators=(",", ":")))

    # ── the manifest, read-modify-write ──────────────────────────────────
    man = json.loads(MANIFEST.read_text())
    man["chunks"] = [c for c in man["chunks"] if c["k"] != KEY]
    xs = [p["x"] for p in pl]
    ys = [p["y"] for p in pl]
    man["chunks"].append(
        {
            # THE ENTRY SHAPE IS THE OTHER CHUNKS', field for field. The test
            # `every chunk on disk decodes, matches its manifest entry` reads
            # `b` for the byte count and `tier` for the load order; an entry
            # that carries `bytes` instead of `b` fails it, which is how this
            # was found rather than by reading the test.
            "k": KEY,
            "kind": KIND,
            # BASE TIER, and it is the heroes' argument: the names are drawn at
            # the WHOLE-CITY frame, so by the rule this layer is built to —
            # nothing is fetched before the camera can show it — they belong in
            # the first paint and nowhere else. 22.6 KB gzipped.
            "tier": "base",
            "minZ": 0.0,
            "b": len(blob),
            "gz": gzlen,
            "e": [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)],
            "n": len(pl),
        }
    )
    man["chunks"].sort(key=lambda c: c["k"])
    man["kinds"][KIND] = {
        "fields": [{"n": f["n"], "t": f["t"]} for f in w.fields()],
        "provenance": FIELD_SOURCE,
        "note": (
            "One row a NAMED PLACE. `x`/`y` are i32 DECIMETRES: world metres = v / 10, "
            "the same quantum base/marks.json uses. `span` is how big the thing is in "
            "world metres — max(sqrt(footprint area), the drawn height) where the place "
            "resolves to a building footprint, sqrt(the published plan area) where the "
            "registry publishes its own ring — and it is what the size gate is applied "
            "to. `bi` is the index of that footprint in the map's own building order, "
            "-1 where there is none. `yr` is the first year the name may be written; 0 "
            "means every year, which is what an undated footprint means, and the map "
            "draws an undated building in every year too. `fl` bit 0 = the City has "
            "DESIGNATED it under Article 10 and it carries a mark; bit 1 = the Golden "
            "Gate Bridge deck; bit 2 = this row was already in base/marks.json. `src` "
            "indexes the sidecar's SRC, `yrule` its YRULE — which rung of the year "
            "ladder this row's year came off. NAMES ARE IN base/places.json, beside the "
            "chunk, exactly as base/marks.json and base/blocks-id.json are."
        ),
    }
    man["sources"].update(SOURCES)
    man["places"] = {
        "n": len(pl),
        "new": rep["shipped_new"],
        "wasShipped": rep["shipped_total"] - rep["shipped_new"],
        "designated": sum(1 for p in pl if p["des"]),
        "withFootprint": sum(1 for p in pl if p["bi"] is not None),
        "bySource": {s: sum(1 for p in pl if p["src"] == s) for s in srcs},
        "dropped": {
            k: rep[k] for k in rep if k.startswith("dropped")
        },
        "sizeGate": (
            "PLACE_MIN_PX = 10 in src/lib/city/labels.ts: an un-designated name is "
            "written only where the thing it names is at least one line of type across "
            "on screen, span_m * 1.2247 * cam.scale >= 10. At the three preset cameras "
            "(cam.base 0.05565 at 1440x940, z = 1.0 / 2.9 / 7.2) that is 146.7 m at "
            "whole city, 50.6 m at the district and 20.4 m at the block. A DESIGNATED "
            "place is exempt: it is drawn with a mark, and a mark does not shrink."
        ),
        "order": (
            "The row order IS the ranking: labels.ts `placeNames` walks each "
            "class in the order it is handed and the collision grid is "
            "first-come. build_places.py sorts by `span` descending; this file "
            "then stably lifts the rows whose footprint is in base/heroes.json "
            "to the front, and changes nothing else. See `order_places` for "
            "what span order alone was measured doing to City Hall, the Ferry "
            "Building and Coit Tower."),
        "inkNote": (
            "The ink budget is EXACT and it binds at all three cameras, so more places "
            "cannot put more ink on the frame — only different ink. What changes is "
            "which places are named."
        ),
    }
    MANIFEST.write_text(json.dumps(man, separators=(",", ":")))

    gz = gzlen
    sj = (OUT / "base" / "places.json").read_bytes()
    print(f"base/places.qc    {len(blob):,} bytes  ({gz:,} gzipped)  {len(pl):,} places")
    print(f"base/places.json  {len(sj):,} bytes  ({len(gzip.compress(sj, 9)):,} gzipped)")
    for s in srcs:
        print(f"    {s:12s} {sum(1 for p in pl if p['src'] == s):5d}")

    if "--marks" in sys.argv:
        write_marks(pl, doc)
    return 0


def write_marks(pl: list[dict], doc: dict) -> None:
    """`base/marks.json`, in that file's existing shape, carrying the merged list.

    Same fields, same base64 packing, same `d & 1` designation bit — the
    shipped `decodeMarks` in `CityMap.tsx` reads this unchanged. `src` there is
    an index into `SRC`, which grows from three entries to eleven.
    """

    def b64(fmt: str, vals: list[int]) -> str:
        return base64.b64encode(struct.pack(f"<{len(vals)}{fmt}", *vals)).decode()

    srcs = sorted({p["src"] for p in pl})
    six = {s: i for i, s in enumerate(srcs)}
    m = {
        "n": len(pl),
        "t": [p["n"] for p in pl],
        "x": b64("i", [int(round(p["x"] * 10)) for p in pl]),
        "y": b64("i", [int(round(p["y"] * 10)) for p in pl]),
        "s": b64("H", [max(1, min(65535, int(round(p["span"])))) for p in pl]),
        "b": b64("i", [p["bi"] if p["bi"] is not None else -1 for p in pl]),
        "yr": b64("H", [max(0, min(65535, int(p["y0"]))) for p in pl]),
        "d": b64("B", [(1 if p["des"] else 0) | (2 if p["ggb"] else 0)
                       | (8 if p.get("_contained") else 0) for p in pl]),
        "src": b64("B", [six[p["src"]] for p in pl]),
        "SRC": srcs,
        "ggb": doc["ggb"],
        "ggbYr": doc["ggbYr"],
        "meta": {
            "generated_by": "pipeline/scripts/us_sf_places/emit_places.py --marks",
            "note": "the merged list; base/places.qc is the same rows as a chunk",
            "real": doc["marks_meta"]["real"],
            "modelled": [],
        },
    }
    p = OUT / "base" / "marks.json"
    p.write_text(json.dumps(m, separators=(",", ":")))
    print(f"base/marks.json   {p.stat().st_size:,} bytes  {len(pl):,} places (was 1,243)")


if __name__ == "__main__":
    sys.exit(main())
