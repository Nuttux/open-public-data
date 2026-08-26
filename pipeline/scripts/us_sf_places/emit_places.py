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
sys.path.insert(0, str(ROOT / "pipeline" / "scripts"))
from citymap.chunk import ChunkWriter  # noqa: E402

sys.path.insert(0, str(HERE))
import place_kinds  # noqa: E402

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
    "place_seed": {
        "dataset": "pipeline/scripts/us_sf_places/places_extra.json",
        "publisher": "this repository — the name is authored, everything else is read",
        "what": "a building the map DRAWS from a published footprint and that no register this pipeline reads gives a name to. The seed carries the name and the footprint it belongs to; the anchor, the span and the year are read off that footprint, and the entry is refused unless the shipped ring still matches the fingerprint the seed records. `src` names this file rather than a dataset id, so a reader who opens the provenance can see at once which half is authored.",
        "rows": 1,
    },
    "place_kind": {
        "what": "the FAMILY a place's mark is drawn as - what kind of thing the register says it is",
        "script": "pipeline/scripts/us_sf_places/place_kinds.py",
        "fields": {
            "nc68-ngbr": "department_name - the City department that OWNS the parcel",
            "gtr9-ntp6": "propertytype",
            "ib5c-xgwu": "facility_type",
            "7e7j-59qk": "entity_type",
            "5kya-mfst": "occupancy",
            "65ik-7wqd": "type",
            "6adp-a5yv": "NONE - Schools_College is a register of college campuses and the kind is its identity, not a column",
        },
        "no_kind_published": {
            "97yj-54sx": "Article 10 publishes a name, an APN, an address, a landmark number, a year of designation and two links. No field says what the place is.",
            "ejht-vp5d": "Article 11 publishes a rating, A/B/C/D.",
            "nps-nrhp": "ResType is `building` on 33 of 37 rows and `site` on 1 - a form class, not a use.",
        },
        "gap": "684 of 2,199 places - 31.1 percent - come from the two historic-designation registers and carry no kind at all. They keep the plain mark. Churches are in none of these registers and USGS GNIS no longer carries a Church feature class (222 San Francisco rows, all natural or civil), so a church cannot be drawn as a church from any source this pipeline reads.",
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
    "the completion year of the structure the renderer draws under it",
    # THE ONLY RUNG THAT IS NOT READ OFF A PUBLISHER. A seeded place may say
    # when its name STARTS applying — a building renamed by a change of
    # occupant, which no register this pipeline reads records — and
    # `places_extra.json` has to state the reason beside the year or the
    # emitter refuses it. `yrule` is provenance, so a reader who opens this row
    # is told, in the same field that tells everybody else which publisher gave
    # them their year, that this one came from us.
    "the year this repository's own seed states, with its reason",
]

FIELD_SOURCE = {
    "x": "place_extent",
    "y": "place_extent",
    "span": "place_extent",
    "bi": "place_extent",
    "yr": "place_year",
    # `yrTo` is NOT `place_year`. Every other year on this chunk is read off a
    # publisher; the year a name STOPS applying is only ever the year the next
    # authored name opens, so it points at the seed that states it.
    "yrTo": "place_seed",
    "yrule": "place_year",
    "yb": "place_year",
    "fl": "place_a10",
    "src": "place_extent",
    "kind": "place_kind",
}


HEROES = OUT / "base" / "heroes.json"
PARKS = OUT / "base" / "parks.qc"

SEED = HERE / "places_extra.json"
SEED_SRC = "pipeline/scripts/us_sf_places/places_extra.json"

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
HERO_SEED = HERE / "heroes_extra.json"


def _hero_bi() -> set:
    """The hero footprints the ranking is built against — and a REFUSAL if the
    register on disk is the mock's rather than the merged one.

    THIS FILE'S OUTPUT DEPENDS ON A FILE IT DOES NOT OWN. `order_places` lifts
    hero footprints to the front and `hero_rows` gives a hero with no place row
    one, so `base/places.*` is a function of `base/heroes.json`. Re-running
    `encode_city_chunks.py` rebuilds that register from the mock and drops
    every hero `emit_heroes.py` merged in — and this file would then quietly
    write a DIFFERENT, still perfectly deterministic, `places.qc`. Two agents
    on the same commit would hold different bytes and every byte-count
    assertion in the suite would be reading one of them.

    Measured this session: two consecutive runs on unchanged input are
    byte-identical (`--check` proves it). What was not stable was the INPUT,
    three times in one night. So the input is now asserted: if
    `heroes_extra.json` claims a hero the shipped register does not carry, this
    refuses to write rather than emitting an ordering built against half a
    register.
    """
    if not HEROES.exists():
        return set()
    side = json.loads(HEROES.read_text())
    have = {h["k"] for h in side["heroes"]}
    if HERO_SEED.exists():
        want = {h["k"] for h in json.loads(HERO_SEED.read_text())["heroes"]}
        missing = sorted(want - have)
        if missing:
            raise SystemExit(
                f"base/heroes.json is missing {', '.join(missing)}, which "
                f"heroes_extra.json claims. The city encoder has rebuilt it "
                f"from the mock. Run:\n"
                f"    python3 pipeline/scripts/us_sf_places/emit_heroes.py\n"
                f"then re-run this. The place ranking is a function of that "
                f"register and must not be built against a stale one.")
    return {h["b"] for h in side["heroes"]}


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
    _hero_bi()                       # the same refusal, before anything is read
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


# `build_bldg.py`'s own sentinel: bit 4 of `u` means no parcel on the block
# carried a year, and `yr` then holds 1906 as a fallback rather than as a fact.
# A seeded row may not take a year off a footprint flying it.
FLAG_NOYEAR = 16

# ── §HELD: A NAME IS A CLAIM AND A YEAR ON IT IS A SECOND ONE ───────────────
#
# THE BUG, measured on the shipped `base/marks.json`: of 2,199 labels, **934
# assert they exist in 1906 or earlier — 399 carrying year 0, which the
# renderer draws in every year, and 326 carrying exactly 1906.** Sampled, most
# of those are false, and falsifiable by anyone who looks them up:
#
#     Opera House               1906     the War Memorial opera house opened 1932
#     Palace Of Fine Arts       1906     built for the 1915 Exposition
#     San Francisco Zoo         1906     opened 1929
#     John McLaren Park         1906     laid out in the 1920s
#     Sigmund Stern Rec Grove   1906     the Sterns gave the land in 1931
#
# **1906 is not a year here. It is `SCRUB_MIN`, the map's own floor**, arriving
# by two routes: `build_bldg.py` writes it into `yr` beside `FLAG_NOYEAR` for a
# footprint no parcel dates, and the year ladder's lower rungs then read it back
# out as if a publisher had said it. `Parkside Square` came out of the same
# register on the same day and got 0 instead — the same ignorance, written two
# different ways, neither of them a date.
#
# **AND NO PUBLISHED CITY DATASET CAN FIX IT.** All five candidate park
# registers were opened and every column read (DRAW.md §33.6, §33.8b): three
# carry only GIS load stamps — `gtr9-ntp6.created_date`'s own description is
# *"timestamp from ArcGIS Online"* and its distribution is one ArcGIS write on
# 2025-12-18, 77 rows in a single second — and two have no date column at all.
# There is no acquisition date to go and get.
#
# ── WHAT IS DONE ABOUT IT, AND WHY IT IS THE LABEL AND NOT THE SHAPE ────────
#
# **The polygon draws and the NAME is held.** A park shape on 1906 dune says
# nothing a reader can check: the ground was there, and the map makes no claim
# about it. A NAME on that shape is a dated assertion, and this map has a clock
# under it, so a reader is entitled to read the frame's year as part of the
# sentence. That is the one difference between this cohort and every other
# undated cohort on the map — the undated street trees, the canopy, the 2,916
# `FLAG_NOYEAR` footprints — all of which are declared, counted and drawn in
# every year (`time.ts`). Those are shapes. This is a name.
#
# **HELD MEANS HELD OFF THE CLOCK, NOT DELETED.** `labels.ts`'s gate is
# `p.year !== undefined && f.year !== undefined && f.year < p.year`, and the map
# has no year until the reader gives it one — the page lands with
# `renderer.year === undefined` and holds it there until the rail is touched or
# the film runs. So a row carrying `YR_NONE`:
#
#     the un-clocked map (the page's own front door)  →  the name is written
#     any year on the rail, and every frame of the film  →  the name is held
#
# which is exactly the sentence the record supports: *this register names this
# place; no published field says when.* Nothing is lost from the default view,
# and no name is asserted into a year no file reaches. Measured on the real
# page: the 1906 whole-city frame goes from 26 place names to 13, keeps every
# true one (Ferry Building 1898, The Old U.S. Mint 1869, Chronicle Building,
# Fairmont Hotel, Ghirardelli Square) and loses every false one, while the
# neighbourhood and street lanes — which carry the orientation at that camera —
# are untouched.
#
# **AND IT IS NARROWER THAN "PRE-1907".** Holding every label older than 1907
# would delete true things: the Ferry Building really is 1898 and the Old Mint
# 1869, both off `97yj-54sx`'s own `yearbuilt`. What is held is a year that was
# BORROWED or DEFAULTED, and which rung of the ladder each year came off is
# already recorded per row. §YBASIS is that recording, made total.
YR_NONE = 65535

# THE VALUE IS NOT A YEAR AND CANNOT BE MISTAKEN FOR ONE, which is the whole
# point — the defect being fixed is a floor value sitting in a year column
# looking like a fact. 65535 is `u16`'s ceiling, it is outside the rail at both
# ends (`SCRUB_MIN` 1906 … `SCRUB_MAX` 2025), and both encodings this file
# writes clamp there already, so no reader has to be changed to see it. It
# travels beside `yb`, below, which says in words why the row has no year.

# ── §YBASIS: what each label's year actually rests on ───────────────────────
# The ladder in `build_places.py` records a `y0rule` per row, but only for rows
# it built: the 1,206 rows inherited from `base/marks.json` come through
# `shipped()`, which reads `marks-data.js` — and that file was written WITHOUT
# the rung, so more than half the register arrived saying only "already
# shipped", which is a provenance for the ROW and not for its YEAR. This
# recovers the rung for those rows from the same two published files the ladder
# itself read, and then reduces all seven rungs to the only question the label
# gate needs answered: **does this year rest on a statement about the thing
# being named?**
YBASIS = [
    "the register's own published year of construction",
    "the assessor roll year of the footprint the place stands on",
    "this repository's own seed, with the reason it states",
    "NONE - the 1906 no-year fallback of the footprint it stands on",
    "NONE - a statement about the GROUND, not about the thing named",
    "NONE - no published field gives it a year at all",
]
YB_KNOWN = (0, 1, 2)

# `gtr9-ntp6` (Recreation and Parks Properties) and `nc68-ngbr` (City
# Facilities) publish a name, an owner and a geometry. **Neither publishes a
# year of construction or of acquisition** — DRAW.md §33.8b read every column of
# both. So an inherited row from either of them that resolved to no footprint
# cannot have taken rung 1, and its year is necessarily one of the two GROUND
# rungs. That is what makes the recovery below exact rather than a guess.
YEARLESS_REGISTERS = ("gtr9-ntp6", "nc68-ngbr")

# The mock's own footprint index, which is what the year ladder READ. It is a
# different file from the drawn building stream and the two disagree about the
# roll year on 7,559 of 166,166 footprints, so each is used only for what it is
# authoritative about: `fpidx` for *which year did this row take off the
# footprint* (it is the number the ladder copied), and `bldg-data.js`'s `u` for
# *is that footprint dated at all* (`FLAG_NOYEAR` is `build_bldg.py`'s own
# sentinel, and `time.ts` counts 2,916 of them). Verified to share one index
# space: same row count, and 400 sampled centroids agree to within a metre.
FPIDX = ROOT / "scratchpad" / "sf-city-anim" / "marks" / "cache" / "fpidx.pkl"


def _year_basis(pl: list[dict]) -> tuple[list[int], list[int], dict]:
    """Per row: which YRULE rung its year came off, and what that rests on.

    Returns `(yrule column, ybasis column, report)`. **`y0` is not touched
    here** — this only says what each year IS. `hold_unknown_years` acts on it.

    THE RECOVERY, and every branch of it is a published file rather than an
    inference about one:

    * A row the ladder built carries `y0rule` and needs no recovery at all.
      Rung 2 is the only one that can be a floor in disguise, and it is one
      exactly when the footprint it read flies `FLAG_NOYEAR` **and** the row
      copied that footprint's year rather than overriding it.
    * An inherited row that resolved to a footprint and whose year is NOT that
      footprint's year cannot have come off the footprint, and rung 1 is the
      only rung above rung 2 — so it is the register's own year. Traced on the
      rows themselves: Ferry Building 1898 against a 1896 roll, The Old U.S.
      Mint 1869 against 1914, Coit Tower 1934 against 1952. All three are
      `97yj-54sx` `yearbuilt`, and all three are correct.
    * An inherited row that resolved to a footprint and DID take its year is
      rung 2 — a real assessor roll year, or the 1906 fallback, and `u` says
      which.
    * An inherited row with no footprint took a GROUND rung, unless its register
      publishes a construction year. Only `97yj-54sx` does, so the split is by
      register and it is exact.
    """
    import pickle

    from _bldgsrc import read_bldg          # noqa: E402 — the encoder's reader

    meta = pickle.loads(FPIDX.read_bytes())[0]
    B = read_bldg()
    if len(meta) != B["n"]:
        raise SystemExit(
            f"the footprint index holds {len(meta):,} rows and the drawn "
            f"building stream {B['n']:,}. They are indexed by the same `bi` "
            f"and a recovery that reads one for the other is only sound while "
            f"they are the same length. Re-run the encoders together.")

    yix = {y: i for i, y in enumerate(YRULE)}
    rung: list[int] = []
    basis: list[int] = []
    recovered = 0
    for p in pl:
        bi = p.get("bi")
        bi = None if bi is None or bi < 0 else int(bi)
        # the number the ladder would have copied off the footprint …
        took = int(meta[bi][6]) if bi is not None else None
        # … and whether that footprint is dated at all
        undated = bi is not None and bool(int(B["u"][bi]) & FLAG_NOYEAR)
        y0 = int(p.get("y0") or 0)
        rule = p.get("y0rule")

        if rule is None:
            # INHERITED FROM `marks-data.js`, WHICH DROPPED THE RUNG.
            recovered += 1
            if bi is not None:
                rule = YRULE[1] if y0 != took else YRULE[2]
            elif p["src"] in YEARLESS_REGISTERS:
                rule = YRULE[3] if y0 else YRULE[4]
            else:
                rule = YRULE[1] if y0 else YRULE[4]

        r = yix[rule]
        if r == 1 or r == 5:
            b = 0                       # the register's own year, or the
        elif r == 2:                    # structure's completion year (§GGB)
            b = 3 if (undated and y0 == took) else 1
        elif r == 3:
            b = 4
        elif r == 4:
            b = 4 if y0 else 5
        elif r == 6:
            b = 2
        else:
            raise SystemExit(f"{p['n']!r}: rung {r} has no basis")
        if b in YB_KNOWN and not y0:
            # A KNOWN RUNG WITH NO YEAR ON IT IS STILL NO YEAR. Nothing hits
            # this today; it exists so a future register that publishes an
            # empty `yearbuilt` cannot smuggle a 0 past the gate as a fact.
            b = 5
        rung.append(r)
        basis.append(b)

    rep = {
        "rungs_recovered_from_evidence": recovered,
        "byRung": {YRULE[i]: rung.count(i) for i in range(len(YRULE))},
        "byBasis": {YBASIS[i]: basis.count(i) for i in range(len(YBASIS))},
        "known": sum(1 for b in basis if b in YB_KNOWN),
        "held": sum(1 for b in basis if b not in YB_KNOWN),
    }
    return rung, basis, rep


def hold_unknown_years(pl: list[dict], basis: list[int]) -> dict:
    """Give every label whose year is borrowed or defaulted `YR_NONE`. §HELD.

    THE COUNTS THIS TURNS OVER ARE THE POINT OF THE WHOLE PASS, so they are
    reported per year rather than as one total: what the reader stops being
    told at 1906, at 1925 and at 1960.
    """
    was = [int(p.get("y0") or 0) for p in pl]
    held = []
    for p, b, y in zip(pl, basis, was):
        if b in YB_KNOWN:
            continue
        p["y0"] = YR_NONE
        held.append((p["n"], y))

    def eligible(y: int, yr: int) -> bool:
        """what `labels.ts` would let onto the frame for year `y`"""
        return yr == 0 or yr <= y

    rep = {
        "held": len(held),
        "of": len(pl),
        # the two shapes the floor arrived in, named separately because they
        # looked like different bugs and are one
        "was_year_0": sum(1 for _, y in held if y == 0),
        "was_1906": sum(1 for _, y in held if y == 1906),
        "was_other_year": sum(1 for _, y in held if y and y != 1906),
        "no_longer_written_at": {
            str(y): sum(1 for _, w in held if eligible(y, w))
            for y in (1906, 1925, 1960, 2020)
        },
        # `pl` is already in the order the ink budget is spent, so the head of
        # this list is what a reader actually stops seeing first
        "held_first_24": [p["n"] for p, b in zip(pl, basis)
                          if b not in YB_KNOWN][:24],
    }
    return rep


def seed_rows(pl: list[dict]) -> list[dict]:
    """A building the map draws, that no register names, and that this
    repository names instead — under every name it has carried in turn.

    THE SEED CARRIES NAMES AND A FOOTPRINT. NOTHING ELSE IS AUTHORED.
    `x`/`y` is the shipped ring's own vertex mean, `span` is this file's
    existing ladder — max(sqrt(footprint area), the drawn height), the same
    line `build_places.py` runs for every register row that resolves to a
    footprint — and the FIRST name's year is 1849 + the roll year the map
    already ships on that ring. So the anchor, the extent and the opening year
    all come out of the same stream the encoder read.

    A BUILDING OUTLIVES ITS OCCUPANTS, AND THE MAP HAS A CLOCK. A seed entry
    is a list of names in order, each with the year it starts applying, and
    each becomes its own row: the first runs from the footprint's roll year,
    every later one from the year the seed states, and each is closed at the
    year the NEXT one opens. So no row carries a year twice, one name is
    drawable in any given year, and dragging the map's own year rail through
    the switch swaps the label. `until` rides to the client on `base/marks.json`
    and `base/places.qc` as `yrTo`, 0 where a name has no end.

    A YEAR THIS REPOSITORY STATES HAS TO SAY WHY. The opening year of a later
    name is in no register here — a change of occupant is not a thing DataSF
    publishes — so it is authored, it takes YRULE's last rung rather than
    borrowing a publisher's, and this refuses to write it without a `why`
    beside it. That is the same bargain the name itself strikes.

    IT REFUSES RATHER THAN DRIFTS, which is `_hero_bi()`'s rule for the same
    hazard. `b` is an index into a delta-chained stream, and a footprint rescue
    that inserts records ahead of it renumbers everything after — DATA-TRUTH
    13.5a describes exactly such an insertion, at 135,905 and 137,646. An
    integer alone would then quietly name a different building, so the seed
    also records the ring's fingerprint (vertex mean, vertex count, area) and
    this refuses to write unless the shipped ring still matches it.

    A seeded name never displaces a published one: a footprint some register
    already names is skipped whole, and the register keeps it.
    """
    if not SEED.exists():
        return []
    doc = json.loads(SEED.read_text())
    seeds = doc.get("places", [])
    if not seeds:
        return []

    sys.path.insert(0, str(ROOT / "pipeline" / "scripts" / "us_sf_city"))
    from _bldgsrc import read_bldg  # noqa: E402  — the encoder's own reader

    B = read_bldg()
    have = {q.get("bi") for q in pl if q.get("bi") is not None}
    out = []
    for q in seeds:
        b = int(q["b"])
        if not 0 <= b < B["n"]:
            raise SystemExit(
                f"places_extra.json: {q['k']!r} names footprint {b}, and the "
                f"shipped stream holds {B['n']:,}.")
        lo = int(B["off"][b])
        hi = lo + int(B["cnt"][b])
        xs = B["IX"][lo:hi].astype(float)
        ys = B["IY"][lo:hi].astype(float)
        n = len(xs)
        area = 0.5 * abs(sum(xs[i] * ys[(i + 1) % n] - ys[i] * xs[(i + 1) % n]
                             for i in range(n)))
        cx, cy = float(B["cx"][b]), float(B["cy"][b])
        at = q["at"]
        got = (round(cx, 2), round(cy, 2), int(B["cnt"][b]), round(area, 1))
        want = (round(float(at["cx"]), 2), round(float(at["cy"]), 2),
                int(at["nv"]), round(float(at["areaM2"]), 1))
        if got != want:
            raise SystemExit(
                f"places_extra.json: {q['k']!r} claims footprint {b} is "
                f"{want} (vertex mean x, y, vertex count, m2) and the shipped "
                f"register holds {got}. The footprint stream has been rebuilt "
                f"and the indices have moved. Re-resolve the ring, correct "
                f"`b` and `at` together, and re-run. A name will not be "
                f"written against a fingerprint that does not match.")
        if b in have:
            continue                    # a register already names it; it wins
        if int(B["u"][b]) & FLAG_NOYEAR:
            raise SystemExit(
                f"places_extra.json: {q['k']!r} stands on a footprint whose "
                f"year is the 1906 FLAG_NOYEAR fallback, not a published roll "
                f"year. There is no year to open the first name in.")

        roll = 1849 + int(B["yr"][b])
        names = q["names"]
        span = max(math.sqrt(area), float(B["h"][b]))
        years = []
        for i, nm in enumerate(names):
            if i == 0:
                if nm.get("from") is not None:
                    raise SystemExit(
                        f"places_extra.json: {q['k']!r} gives its first name "
                        f"a `from`. The first name opens in the footprint's "
                        f"own roll year and that year is not authored here.")
                years.append((roll, YRULE[2]))
                continue
            if nm.get("from") is None or not str(nm.get("why", "")).strip():
                raise SystemExit(
                    f"places_extra.json: {q['k']!r} name {nm['n']!r} needs "
                    f"both a `from` and a `why`. A year this repository states "
                    f"rather than reads has to say what it rests on.")
            years.append((int(nm["from"]), YRULE[6]))
        if any(years[i][0] >= years[i + 1][0] for i in range(len(years) - 1)):
            raise SystemExit(
                f"places_extra.json: {q['k']!r} names do not run forward in "
                f"time: {[y for y, _ in years]}. A later name cannot open in "
                f"the same year the one before it did, or earlier.")

        for i, nm in enumerate(names):
            y0, rule = years[i]
            out.append({
                "n": nm["n"],
                "x": cx,
                "y": cy,
                "span": span,
                "bi": b,
                "y0": y0,
                # closed where the NEXT name opens, so the switch year is
                # written once and the two rows cannot disagree about it
                "until": years[i + 1][0] if i + 1 < len(years) else None,
                "y0rule": rule,
                "des": 0,
                "ggb": 0,
                "old": 0,
                "src": SEED_SRC,
                "spanFrom": "footprint",
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
    hero_bi = _hero_bi()
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
    # THE SEED GOES FIRST, AND THE ORDER IS LOAD-BEARING. `hero_rows` gives a
    # hero with no place row one of its own, and a hero standing on a footprint
    # the seed names would take that name — collapsing the seed's names-in-turn
    # back to one. Both functions skip a footprint that is already spoken for,
    # so running the seed first is the whole fix.
    seeded = seed_rows(doc["places"])
    extra = hero_rows(doc["places"] + seeded)
    pl = order_places(doc["places"] + seeded + extra)
    rep = dict(doc["report"])
    if extra:
        rep["from_hero_register"] = [q["n"] for q in extra]
    if seeded:
        rep["from_seed"] = [q["n"] for q in seeded]

    # THE NAME MAY NOT PREDATE THE THING. `97yj-54sx` gives the Golden Gate
    # Bridge `yearbuilt` 1933 — the year construction BEGAN — and this file was
    # writing that as the first year the name may be drawn. `landmarks.ts`
    # §GGB already made the correction in its own words ("construction began
    # and 1937 is when the bridge was completed, 19 April") and this file
    # already ships `ggbYr: 1937` beside the ring. Two independent statements
    # of one quantity, and the label was reading the wrong one: verified on the
    # film's own frames, "Golden Gate Bridge" was written over open water at
    # map-year 1935, two shots before the deck it names arrives.
    #
    # The row that carries the structure is flagged in the data itself, so this
    # is an exact join and not a name match. It asserts rather than falls back:
    # a rung that silently does nothing is how the first version of this bug
    # survived.
    ggb_yr = int(doc["ggbYr"])
    ggb_rows = [q for q in pl if q.get("ggb")]
    assert ggb_rows, "no place row carries the ggb flag - the rung cannot fire"
    for q in ggb_rows:
        q["y0"] = ggb_yr
        q["y0rule"] = YRULE[5]
    rep["structure_year_applied"] = {q["n"]: ggb_yr for q in ggb_rows}

    # ── §HELD. WHAT EACH YEAR RESTS ON, AND THE ONES THAT REST ON NOTHING ───
    # This runs LAST of the year passes and it has to: §GGB above rewrites a
    # year and its rung, and the basis is a reading of the final `y0rule`, not
    # of the one `build_places.py` happened to write first.
    yrule_col, yb_col, yb_rep = _year_basis(pl)
    rep["year_basis"] = yb_rep
    rep["held_labels"] = hold_unknown_years(pl, yb_col)
    print(f"year basis: {yb_rep['known']:,} known, {yb_rep['held']:,} held "
          f"({yb_rep['rungs_recovered_from_evidence']:,} rungs recovered from "
          f"the footprint files)")
    for k, v in yb_rep["byBasis"].items():
        print(f"   {v:5d}  {k}")
    print("names no longer written on a dated frame: "
          + ", ".join(f"{y} {n:,}" for y, n
                      in rep["held_labels"]["no_longer_written_at"].items()))

    # WHAT KIND OF THING EACH PLACE IS, joined from the registers' own category
    # fields. See `place_kinds.py`: the join is the normalised name inside the
    # place's OWN register, gated on distance, and the mapping onto the mark
    # families is an exhaustive table that raises on a value it has not seen.
    # A place whose register publishes no kind gets 0 and keeps the plain
    # treatment; NOTHING here reads a name to decide what a place is.
    fams = place_kinds.kinds_for(pl)[0]
    fix = {f: i + 1 for i, f in enumerate(place_kinds.FAMILIES)}
    kcol = [fix[f] if f else 0 for f in fams]
    rep["byFamily"] = {f: sum(1 for g in fams if g == f)
                       for f in place_kinds.FAMILIES}
    rep["withKind"] = sum(1 for k in kcol if k)

    srcs = sorted({p["src"] for p in pl})
    six = {s: i for i, s in enumerate(srcs)}

    w = ChunkWriter(KEY, KIND)
    w.add("x", "i32", [int(round(p["x"] * 10)) for p in pl])
    w.add("y", "i32", [int(round(p["y"] * 10)) for p in pl])
    w.add("span", "u16", [max(1, min(65535, int(round(p["span"])))) for p in pl])
    w.add("bi", "i32", [p["bi"] if p["bi"] is not None else -1 for p in pl])
    w.add("yr", "u16", [max(0, min(65535, int(p["y0"]))) for p in pl])
    # THE LAST YEAR A NAME MAY BE DRAWN, 0 where it has none — which is every
    # row but the ones `places_extra.json` closes when a later name opens. A
    # reader that does not know this column ignores it, exactly as `kind` was
    # shipped ahead of its decoder.
    w.add("yrTo", "u16", [max(0, min(65535, int(p.get("until") or 0))) for p in pl])
    w.add(
        "fl",
        "u8",
        [(1 if p["des"] else 0) | (2 if p["ggb"] else 0) | (4 if p["old"] else 0)
         | (8 if p.get("_contained") else 0) for p in pl],
    )
    w.add("src", "u8", [six[p["src"]] for p in pl])
    # WHICH RUNG, FOR EVERY ROW AND NOT JUST THE ONES BUILT TODAY. This column
    # used to answer `0` — *"already shipped in base/marks.json"* — for 1,206 of
    # 2,199 rows, which says where the ROW came from and nothing about where its
    # YEAR came from, and it silently swallowed §GGB's rung 5 as well, because
    # the Golden Gate Bridge row is one of the inherited ones. §YBASIS recovers
    # the rung from the footprint files, so rung 0 is now empty and every row
    # names the publisher that dated it.
    w.add("yrule", "u8", yrule_col)
    # AND WHAT THAT RUNG IS WORTH, which is the question the label gate asks.
    # 0-2 are a statement about the thing named; 3-5 are not, and every row
    # carrying one of those also carries `yr = YR_NONE`. §HELD.
    w.add("yb", "u8", yb_col)
    w.add("kind", "u8", kcol)
    blob = w.serialise()
    (OUT / "base" / "places.qc").write_bytes(blob)
    gzlen = len(gzip.compress(blob, 9))

    side = {
        "n": len(pl),
        "t": [p["n"] for p in pl],
        "SRC": srcs,
        "YRULE": YRULE,
        "YBASIS": YBASIS,
        "YR_NONE": YR_NONE,
        "KIND": place_kinds.FAMILIES,
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
                f"years, WHERE THERE ARE NONE: a label whose year was borrowed from the ground under it or defaulted to the 1906 no-year fallback carries yr = {YR_NONE}, which is not a year. Its name is written on the un-clocked map and held on every dated frame, because no published field says when that name starts applying. `yb` says which of the six bases each row's year rests on.",
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
            f"draws an undated building in every year too. `yr` = {YR_NONE} is NOT A "
            "YEAR: it means no published field says when this name starts applying, so "
            "the name is written on the un-clocked map and held on every dated frame. "
            "`yb` says why, indexing the sidecar's YBASIS — 0-2 are a year read off a "
            "publisher about the thing itself, 3-5 are a year borrowed from the ground "
            "under it or defaulted to the 1906 no-year fallback, and every 3-5 row "
            f"carries yr = {YR_NONE}. `fl` bit 0 = the City has "
            "DESIGNATED it under Article 10 and it carries a mark; bit 1 = the Golden "
            "Gate Bridge deck; bit 2 = this row was already in base/marks.json. `src` "
            "indexes the sidecar's SRC, `yrule` its YRULE — which rung of the year "
            "ladder this row's year came off. `kind` is 0 where the place's register "
            "publishes no kind of thing, else 1 + the index into the sidecar's KIND — "
            "the family the mark is drawn as, joined from that register's own category "
            "field by pipeline/scripts/us_sf_places/place_kinds.py. NAMES ARE IN "
            "base/places.json, beside the chunk, exactly as base/marks.json and "
            "base/blocks-id.json are."
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
        "kinds": dict(place_kinds.provenance(),
                      withKind=rep["withKind"],
                      byFamily=rep["byFamily"]),
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

    write_kind_module(pl, fams)

    if "--marks" in sys.argv:
        write_marks(pl, doc, kcol, yb_col)
    return 0


KIND_TS = ROOT / "website/src/lib/city/place-kinds.generated.ts"


def write_kind_module(pl: list[dict], fams: list) -> None:
    """`src/lib/city/place-kinds.generated.ts` — the family, by place name.

    WHY A GENERATED MODULE AND NOT THE CHUNK, said plainly so it can be undone.
    The renderer gets its places from `CityMap.tsx::decodeMarks`, which builds a
    `PlaceLabel` out of five columns of `base/marks.json` and would need one
    more line to carry a sixth. `base/marks.json` now ships that sixth column
    (`k` + `KIND`, written above) so that line is all it takes — but until it is
    taken, `labels.ts` reads the family out of this table instead, and
    `PlaceLabel.kind` wins wherever it is set. **When `decodeMarks` learns the
    column this file is deleted and one import goes with it; nothing else
    moves.**

    The key is the name because the name is what the label pass has: 2,197
    places, **6 duplicate names**, and a duplicate is written only where every
    row of that name agrees on its family, so the table can never attach a
    kind to the wrong place.
    """
    byname: dict[str, set] = {}
    for q, f in zip(pl, fams):
        byname.setdefault(q["n"], set()).add(f)
    rows = sorted((n, next(iter(v))) for n, v in byname.items()
                  if len(v) == 1 and next(iter(v)))
    dropped = sum(1 for v in byname.values() if len(v) > 1)
    lines = [
        "/**",
        " * GENERATED by pipeline/scripts/us_sf_places/emit_places.py — do not edit.",
        " *",
        " * What KIND of thing each named place is, by name. The family is the",
        " * register's OWN published category value mapped onto a short vocabulary of",
        " * marks; the join and the mapping are"
        " pipeline/scripts/us_sf_places/place_kinds.py",
        " * and the provenance is in the manifest under `places.kinds`.",
        " *",
        f" * {len(rows):,} of {len(pl):,} places carry a family. The rest come from",
        " * registers that publish no kind — Article 10 (a name and a designation),",
        " * Article 11 (a rating) — and keep the plain mark. Churches are in none of",
        " * these registers, so a church is one of them.",
        " *",
        " * THIS FILE IS A STOPGAP WITH A DELETION CONDITION. `base/marks.json` already",
        " * ships the same column as `k` + `KIND`; the day `CityMap.tsx::decodeMarks`",
        " * reads it into `PlaceLabel.kind`, delete this module and its import.",
        " */",
        "",
        "/** the mark families, in the order the chunk's `kind` column indexes them */",
        "export const PLACE_KIND_FAMILIES = [",
    ]
    for f in place_kinds.FAMILIES:
        lines.append(f'  "{f}",')
    lines += [
        "] as const;",
        "",
        "export type PlaceKind = (typeof PLACE_KIND_FAMILIES)[number];",
        "",
        f"/** {len(rows):,} entries; {dropped} name(s) dropped for disagreeing with themselves */",
        "const BY_NAME = new Map<string, PlaceKind>([",
    ]
    for n, f in rows:
        lines.append(f'  [{json.dumps(n)}, "{f}"],')
    lines += [
        "]);",
        "",
        "/** the family the register published for this place, or undefined */",
        "export function placeKindOf(name: string): PlaceKind | undefined {",
        "  return BY_NAME.get(name);",
        "}",
        "",
    ]
    KIND_TS.write_text("\n".join(lines))
    print(f"place-kinds.generated.ts  {KIND_TS.stat().st_size:,} bytes  "
          f"{len(rows):,} names")


def write_marks(pl: list[dict], doc: dict, kcol: list[int],
                yb_col: list[int]) -> None:
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
        # `YR_NONE` RIDES THIS COLUMN AND NEEDS NO NEW READER. `decodeMarks`
        # already unpacks `yr` as a Uint16Array and sets `PlaceLabel.year` from
        # any non-zero value, and `labels.ts`'s gate then holds the name on
        # every year of the rail and writes it on the un-clocked map — which is
        # exactly the treatment §HELD argues for. The client is unchanged.
        "yr": b64("H", [max(0, min(65535, int(p["y0"]))) for p in pl]),
        # WHY A ROW HAS NO YEAR, beside the row that has none. Nothing reads it
        # yet; it ships for the same reason `k` shipped ahead of its decoder —
        # so the file can be inspected without re-running the pipeline, and so
        # the day a fiche wants to say "no published field dates this" the
        # sentence is already on the wire. Indexes YBASIS.
        "yb": b64("B", yb_col),
        "YBASIS": YBASIS,
        "YR_NONE": YR_NONE,
        # `yt` is `yr`'s closing bracket: the first year the name is NO LONGER
        # drawn, 0 where it never stops. Only a building this repository names
        # under more than one name in turn carries it.
        "yt": b64("H", [max(0, min(65535, int(p.get("until") or 0))) for p in pl]),
        "d": b64("B", [(1 if p["des"] else 0) | (2 if p["ggb"] else 0)
                       | (8 if p.get("_contained") else 0) for p in pl]),
        "src": b64("B", [six[p["src"]] for p in pl]),
        # THE KIND TRAVELS ON THE SHIPPED FILE AS WELL AS THE CHUNK, so the
        # renderer's own fetch can stop reading it out of a generated module the
        # day `decodeMarks` is taught the column. `k` is 0 for no published kind
        # and 1 + the index into `KIND` otherwise; a reader that does not know
        # the key ignores it and nothing changes.
        "k": b64("B", kcol),
        "KIND": place_kinds.FAMILIES,
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


OUTPUTS = ("places.qc", "places.json", "marks.json", "place-kinds.generated.ts")


def _snapshot() -> dict:
    d = {n: (OUT / "base" / n).read_bytes()
         for n in OUTPUTS if (OUT / "base" / n).exists()}
    if KIND_TS.exists():
        d[KIND_TS.name] = KIND_TS.read_bytes()
    return d


def check() -> int:
    """TWO RUNS ON UNCHANGED INPUT MUST BE BYTE-IDENTICAL.

    `emit_heroes.py` proves its merge with a round trip; this proves its
    determinism the same way — by running and comparing, not by reading the
    code and believing it. A file that changes when nothing changed hands every
    other agent in the tree a phantom diff to chase and makes every byte-count
    assertion in the suite untrustworthy.
    """
    if "--marks" not in sys.argv:
        sys.argv.append("--marks")
    main()
    a = _snapshot()
    main()
    b = _snapshot()
    bad = [n for n in a if a[n] != b.get(n)]
    for n in OUTPUTS:
        if n not in a:
            print(f"  {n:12s} not written")
        elif n in bad:
            print(f"  {n:12s} DIFFERS between two runs "
                  f"({len(a[n]):,} then {len(b[n]):,} bytes)")
        else:
            print(f"  {n:12s} identical, {len(a[n]):,} bytes")
    if bad:
        print("NOT DETERMINISTIC")
        return 1
    print("deterministic: two runs, identical bytes")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv else main())
