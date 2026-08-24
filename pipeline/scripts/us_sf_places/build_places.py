"""Eight published registers -> ONE list of named places, with the reason for
every cut carried beside the row.

    python3 pipeline/scripts/us_sf_places/build_places.py

Reads `cache/` only (see fetch_places.py) plus two things the map already
ships:

  * `scratchpad/sf-city-anim/marks/cache/fpidx.pkl` — the footprint index
    `marks/join_fp.py` built, opened READ ONLY. It is the shipped footprints'
    own rings, areas, heights, roll years and parcel numbers, keyed on the
    index `bldg-data.js` is keyed on. Re-implementing it would risk a
    different index; this way a `bi` in this chunk is the same building as a
    `bi` in `base/marks.json`.
  * `scratchpad/sf-city-anim/marks/marks-data.js` — the 1,243 places already
    on the map, so the dedup is against what is drawn and not against nothing.

THE RULES, and every one of them is a property of a file.

 1. A NAME. The row's name field, non-empty, whitespace collapsed. Nothing is
    renamed, re-cased or re-punctuated.
 2. A PUBLISHED EXTENT. Either the row's own polygon, or a building footprint
    the row resolves to by parcel or by containment. **No extent, not drawn** —
    that is BLOCK-N's rule and it is what dropped the bathrooms and the sheds.
 3. THE NAME MUST NAME ONE PLACE. A name the register attaches to more than one
    row of its own file is a CATEGORY, not a name: `Tennis Courts` sits on 59
    Recreation and Parks properties and `Landscaped Areas` on 422. Applied to
    the facilities register only, where the file has that shape, and counted.
 4. ONE NAME PER FOOTPRINT, across the union with what already ships. The
    survivor key is BLOCK-N's, unchanged: designated first, then the row whose
    own registry publishes an extent, then the shorter name.
 5. ONE NAME PER SAN FRANCISCO BLOCK — the same name twice inside 275 m is one
    place published twice.
 6. INSIDE THE DRAWN CITY — the bound is the shipped footprints' own extent.
 7. A YEAR, on BLOCK-N's four-rung ladder, and which rung is carried per row.

WHAT IS DELIBERATELY NOT DONE
    No register is ranked above another for importance, no name is filtered for
    reading oddly, and no year is guessed. Where a file publishes a date that
    does not mean "this existed from", the date is NOT used and §3 of PLACES.md
    says which and why.
"""
from __future__ import annotations

import json
import math
import pathlib
import pickle
import re
import sys
import unicodedata
from collections import Counter, defaultdict

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
CACHE = HERE / "cache"
MOCK = ROOT / "scratchpad" / "sf-city-anim"
FPIDX = MOCK / "marks" / "cache" / "fpidx.pkl"
MARKSJS = MOCK / "marks" / "marks-data.js"
MADELAND = MOCK / "geo" / "cache" / "made_land.json"
OUT = CACHE / "_places.json"

sys.path.insert(0, str(HERE))
from _geom import (  # noqa: E402
    centroid,
    exterior_rings,
    inside,
    point_of,
    poly_area,
)

CELL = 120.0  # the footprint index's own bucket, marks/join_fp.py
SF_BLOCK = (275.0, 125.0)  # part3.html's PREC_MAX figure for one SF block

WS = re.compile(r"\s+")


def clean(n: str | None) -> str | None:
    if not n:
        return None
    s = WS.sub(" ", unicodedata.normalize("NFC", str(n))).strip()
    return s or None


def _words(s: str | None) -> list[str]:
    return [w for w in re.split(r"[^A-Za-z0-9]+", (s or "").lower()) if w]


def _residue(name: str, prop: str | None, kind: str | None,
             vocab: tuple[str, ...] = ()) -> bool:
    """True if the name says something its own property name and the file's own
    vocabulary of KINDS do not.

    A word is covered when it shares a four-character prefix with one of them
    (`Roadways` against `Road`, `Hardscape` against `Hardscaped`). `vocab` is
    every token that appears in any `facility_type` in the file — the
    register's own controlled list of what kinds of thing it holds — so a name
    assembled out of kind-words and its own property's name has named a kind
    and not a place. A residue that is only a catalogue code — a token with a
    digit in it, or shorter than three letters — is not a word.
    """
    cover = _words(prop) + _words(kind) + list(vocab)
    left = []
    for w in _words(name):
        if any(w[:4] == c[:4] and len(c) >= 4 for c in cover) or w in cover:
            continue
        left.append(w)
    return any(len(w) >= 3 and not any(ch.isdigit() for ch in w) for w in left)


# ── the registers ───────────────────────────────────────────────────────────
#
# One entry per file. `rows()` yields dicts with: n (name), x, y (world m),
# a (published plan area m2 or None), apn (assessor parcel or None),
# yr (a published year that means "existed from", or None), sid (the row's own
# published id), src (the four-by-four or the federal file name).


def _load(name: str) -> list[dict]:
    return json.loads((CACHE / f"{name}.geojson").read_text())["features"]


def reg_tall() -> list[dict]:
    """`5kya-mfst` Tall Building Inventory.

    `date` is the publisher's own "Building's year of construction" and it is
    filled on 180 of 180 rows, 1889 to 2019. This is the only new register that
    dates itself.

    Rows whose `name` is the row's own `address` with nothing added
    (`350 Mission Street`, `33 Tehama Street`, `555 Mission St` against an
    address of `555 Mission Street`) tell a reader nothing the street layer
    does not already say. The test is a prefix comparison between two columns
    of the same row once case and punctuation are removed, so those rows are
    dropped and counted rather than judged one by one.
    """
    out = []
    dropped = 0
    for f in _load("tall_buildings"):
        p = f["properties"]
        n = clean(p.get("name"))
        if not n:
            continue
        # PREFIX, NOT EQUALITY. `555 Mission St` against an `address` of
        # `555 Mission Street` is not an equal string and is the same address;
        # it went onto the block frame as a name and read as a street label
        # lying on a tower. Same test the POPOS register gets.
        norm = lambda s: re.sub(r"[^a-z0-9]", "", (s or "").lower())  # noqa: E731
        nn, na = norm(p.get("name")), norm(p.get("address"))
        if nn and na and na[: len(nn)] == nn:
            dropped += 1
            continue
        c = centroid(f.get("geometry"))
        if not c:
            continue
        yr = p.get("date")
        out.append(
            dict(
                n=n, x=c[0], y=c[1], a=poly_area(f.get("geometry")),
                apn=(p.get("mapblocklot") or "").strip() or None,
                yr=int(yr) if yr and str(yr).strip().isdigit() else None,
                # THE ONLY REGISTER HERE THAT PUBLISHES A HEIGHT, and `resolve`
                # uses it to break the footprint tie. `height_ft` is filled on
                # every row this register ships and its scope is buildings over
                # 240 ft, so a row that resolves to a 12 m footprint has
                # resolved to the podium and not the tower.
                hft=(float(p["height_ft"]) if str(p.get("height_ft") or "").strip()
                     .replace(".", "", 1).isdigit() else None),
                yrField="date", sid=str(p.get("objectid") or ""), src="5kya-mfst",
            )
        )
    reg_tall.dropped_name_is_address = dropped  # type: ignore[attr-defined]
    return out


def reg_article11() -> list[dict]:
    """`ejht-vp5d` Article 11 Rating — the downtown conservation register.

    450 of 786 rows carry a name; the other 336 are rated parcels the file
    names only by address. Two kinds of row are dropped and both are the file
    talking about itself rather than about a place:

      * 8 rows whose name says the building is DEMOLISHED
        (`DEMOLISHED 1989:LOMA PREITA QUAKE`, `POWELL CINEMA:DEMOLISHED`);
      * 4 rows whose name is a cross-reference to another parcel
        (`MANX HOTEL (SEE 315/003)`).

    `datelisted` is `1899-12-30` on all 786 rows — the GIS null sentinel — so
    this register dates nothing and its rows take their year from the footprint
    they stand on.

    THE CLASS IS `named`, NOT `designated`. Article 11 is a rating inside a
    downtown conservation district; Article 10 is the City designating a
    landmark. Two different published statements, and the mark on this map
    means the second one.
    """
    out = []
    dem = see = 0
    for f in _load("article11"):
        p = f["properties"]
        n = clean(p.get("individuals_article_11_name"))
        if not n:
            continue
        if "DEMOL" in n.upper():
            dem += 1
            continue
        if re.search(r"\(SEE\b", n.upper()):
            see += 1
            continue
        c = centroid(f.get("geometry"))
        if not c:
            continue
        out.append(
            dict(
                n=n, x=c[0], y=c[1], a=poly_area(f.get("geometry")),
                apn=(p.get("individuals_article_11_apn") or "").strip() or None,
                yr=None, yrField=None,
                sid=str(p.get("individuals_article_11_id") or ""), src="ejht-vp5d",
                a11=(p.get("dwntwnrate_rating") or "").strip() or None,
            )
        )
    reg_article11.dropped_demolished = dem  # type: ignore[attr-defined]
    reg_article11.dropped_crossref = see  # type: ignore[attr-defined]
    return out


def reg_nrhp() -> list[dict]:
    """The National Register of Historic Places, from the NPS's own service.

    Filtered to `County == 'San Francisco'` — the query box reaches into Marin,
    Alameda and San Mateo and those rows are somebody else's county.

    `ResType == 'district'` rows are dropped: a district is not a place a name
    attaches to, which is the reason BLOCK-N gave for setting `knm6-5ej6`
    aside, and it is the same reason here.

    `CertDate` IS NOT A YEAR THE PLACE EXISTED FROM. It is the date the
    Keeper of the Register listed it: the Haas-Lilienthal House was built in
    1886 and listed in 1973. It is carried as provenance and never gates a
    label; the year comes from the footprint the listing stands on.
    """
    out = []
    dist = 0
    for src, name in (("nrhp_polys", "poly"), ("nrhp_points", "point")):
        for f in _load(src):
            p = f["properties"]
            if p.get("County") != "San Francisco":
                continue
            if (p.get("ResType") or "").lower() == "district":
                dist += 1
                continue
            n = clean(p.get("RESNAME"))
            if not n:
                continue
            g = f.get("geometry")
            c = centroid(g) if name == "poly" else point_of(g)
            if not c:
                continue
            out.append(
                dict(
                    n=n, x=c[0], y=c[1],
                    a=poly_area(g) if name == "poly" else None,
                    apn=None, yr=None, yrField=None,
                    sid=str(p.get("NRIS_Refnum") or ""), src="nps-nrhp",
                    nrhpListed=p.get("CertDate"),
                    nhl=1 if (p.get("Is_NHL") or "").strip() == "X" else 0,
                )
            )
    reg_nrhp.dropped_district = dist  # type: ignore[attr-defined]
    return out


def reg_colleges() -> list[dict]:
    """`6adp-a5yv` Schools_College — campus boundaries, from NCES, as of 2011.

    The polygon IS the campus, which is the thing being named, so it is not
    gated the way an Article 10 ring is. The name is `institutio`, and where
    the file also carries a `campus` that is not already inside the institution
    name it is appended — both halves are the file's own text.
    """
    out = []
    for f in _load("colleges"):
        p = f["properties"]
        n = clean(p.get("institutio"))
        if not n:
            continue
        camp = clean(p.get("campus"))
        if camp and camp.lower() not in n.lower():
            n = f"{n} — {camp}"
        c = centroid(f.get("geometry"))
        if not c:
            continue
        out.append(
            dict(n=n, x=c[0], y=c[1], a=poly_area(f.get("geometry")),
                 apn=None, yr=None, yrField=None, ground=1, sid=n, src="6adp-a5yv")
        )
    return out


def reg_popos() -> list[dict]:
    """`65ik-7wqd` Privately Owned Public Open Spaces.

    A point per space and a published `year`. One row reads
    `Under construction` instead of a year and takes the footprint's year
    instead — the file said it does not have one.

    **The same name-is-the-address rule the Tall Building Inventory gets.**
    This register names a space by the address of the tower it sits in as often
    as by a name — `425 Market St`, `555 Mission St`, `135 Main St`. Written on
    a building at block zoom those read as street labels lying on the wrong
    thing, which is what the frame showed. The test is a string comparison
    between `name` and the row's own `popos_address`, with the row's own
    lettered-space suffix (`- A`, `- East B`) removed first, because that
    suffix is the file distinguishing two spaces at one address and not a name
    either. What survives is `Millenium Tower Plaza`, `Transamerica Redwood
    Park`, `Empire Park` — spaces the file has actually named.
    """
    out = []
    dropped = 0
    for f in _load("popos"):
        p = f["properties"]
        n = clean(p.get("name"))
        c = point_of(f.get("geometry"))
        if not n or not c:
            continue
        stem = re.sub(r"\s*[-–]\s*(?:[A-Za-z]+\s+)?[A-Z]$", "", n).strip()
        norm = lambda s: re.sub(r"[^a-z0-9]", "", (s or "").lower())  # noqa: E731
        addr = norm(p.get("popos_address"))
        if addr and norm(stem) and norm(stem) == addr[: len(norm(stem))]:
            dropped += 1
            continue
        y = str(p.get("year") or "").strip()
        bl = (p.get("block_num") or "").strip(), (p.get("lot_num") or "").strip()
        apn = f"{bl[0]}{bl[1]}" if bl[0] and bl[1] else None
        out.append(
            dict(n=n, x=c[0], y=c[1], a=None, apn=apn,
                 yr=int(y) if y.isdigit() else None, yrField="year" if y.isdigit() else None,
                 sid=str(p.get("map_id") or ""), src="65ik-7wqd")
        )
    reg_popos.dropped_name_is_address = dropped  # type: ignore[attr-defined]
    return out


def reg_schools() -> list[dict]:
    """`7e7j-59qk` Schools, the California Department of Education's list.

    `open_date` IS NOT USED, and the file says why itself: **146 of the 235
    rows carry 1980-07-01**, which is where the CDE's own record starts and not
    when the school opened. Mission High School is on that date and its
    building is on the roll at 1927. A year that is wrong on 62 % of rows is
    not a year, so these rows take the year of the building they stand in.

    `status` is `Active` on 234 of 235 and `Pending` on one; the pending row is
    a school that does not exist yet and is dropped.
    """
    out = []
    pend = 0
    for f in _load("schools"):
        p = f["properties"]
        if (p.get("status") or "") != "Active":
            pend += 1
            continue
        n = clean(p.get("school"))
        c = point_of(f.get("geometry"))
        if not n or not c:
            continue
        out.append(
            dict(n=n, x=c[0], y=c[1], a=None, apn=None, yr=None, yrField=None,
                 sid=str(p.get("cds_code") or ""), src="7e7j-59qk")
        )
    reg_schools.dropped_pending = pend  # type: ignore[attr-defined]
    return out


def reg_rpfac() -> list[dict]:
    """`ib5c-xgwu` Recreation and Parks Facilities.

    2,689 of 2,692 rows carry a `facility_name`, and most of those names are
    not names. TWO rules, and both are the file's own arithmetic on its own
    columns.

    **A name the register puts on more than one row is a CATEGORY.**
    `Landscaped Areas` is on 422 rows, `Hardscaped Areas` on 354, `Tennis
    Courts` on 59. A name that occurs once names one place. 1,768 rows go.

    **A name made only of its own `property_name` and its own `facility_type`
    has not named anything the map does not already say.** `Golden Gate Park
    Roadways` is the property `Golden Gate Park` plus the type `Road`;
    `Glen Park Hardscape` is `Glen Park` plus `Hardscaped Area`; `Lake Merced`
    is the property `Lake Merced Park`. The property itself is already on the
    map from `gtr9-ntp6`, so these rows would put a second, worse name on a
    place that has one. The residue is computed by stripping every word of the
    row's own property name and own facility type (prefix match, four
    characters or more) and what is left has to be a word — not a catalogue
    code like `GGP1`.

    What survives is what the two rules were for: `Silver Tree Clubhouse`,
    `Strybing Arboretum`, `Harding Golf Course`, `North Lake`, `Polo Fields
    and Stadium`.
    """
    feats = _load("rp_facilities")
    names = [clean(f["properties"].get("facility_name")) for f in feats]
    cnt = Counter(n.lower() for n in names if n)
    # the file's own controlled vocabulary of kinds, and its own property names
    # recovered by property_id for the 128 rows that leave the column empty
    vocab = tuple({w for f in feats for w in _words(f["properties"].get("facility_type"))})
    propof = {}
    for f in feats:
        q = f["properties"]
        if q.get("property_id") and q.get("property_name"):
            propof[str(q["property_id"])] = q["property_name"]
    out = []
    cat = res = 0
    for f, n in zip(feats, names):
        if not n:
            continue
        if cnt[n.lower()] > 1:
            cat += 1
            continue
        p = f["properties"]
        prop = p.get("property_name") or propof.get(str(p.get("property_id") or ""))
        if not _residue(n, prop, p.get("facility_type"), vocab):
            res += 1
            continue
        c = centroid(f.get("geometry"))
        if not c:
            continue
        out.append(
            dict(n=n, x=c[0], y=c[1], a=poly_area(f.get("geometry")),
                 apn=None, yr=None, yrField=None, ground=1,
                 sid=str(p.get("facility_id") or ""), src="ib5c-xgwu",
                 prop=clean(prop))
        )
    reg_rpfac.dropped_category = cat  # type: ignore[attr-defined]
    reg_rpfac.dropped_residue = res  # type: ignore[attr-defined]
    return out


REGISTERS = [
    ("5kya-mfst", reg_tall),
    ("ejht-vp5d", reg_article11),
    ("nps-nrhp", reg_nrhp),
    ("6adp-a5yv", reg_colleges),
    ("65ik-7wqd", reg_popos),
    ("7e7j-59qk", reg_schools),
    ("ib5c-xgwu", reg_rpfac),
]


# ── what already ships ──────────────────────────────────────────────────────


def shipped() -> list[dict]:
    """The 1,243 in `base/marks.json`, read from the file that generated it.

    `marks-data.js` is what `encode_city_chunks.py::encode_marks` copies into
    `base/marks.json`, so reading it here means this build stays right even if
    that encoder is re-run.
    """
    import base64
    import struct

    text = MARKSJS.read_text()
    body = text[len("window.MARKS=") :].strip().rstrip(";").strip()
    m = json.loads(body)
    unp = lambda f, s, k: struct.unpack(f"<{m['n']}{f}", base64.b64decode(s))  # noqa: E731
    xs = unp("i", m["x"], 4)
    ys = unp("i", m["y"], 4)
    ss = unp("H", m["s"], 2)
    bs = unp("i", m["b"], 4)
    yr = unp("H", m["yr"], 2)
    dd = unp("B", m["d"], 1)
    sr = unp("B", m["src"], 1)
    out = []
    for k in range(m["n"]):
        out.append(
            dict(n=m["t"][k], x=xs[k] * 0.1, y=ys[k] * 0.1, span=float(ss[k]),
                 bi=bs[k] if bs[k] >= 0 else None, y0=yr[k], des=dd[k] & 1,
                 ggb=(dd[k] >> 1) & 1, src=m["SRC"][sr[k]], old=1)
        )
    return out, m


# ── the footprint join ──────────────────────────────────────────────────────


def resolve(places: list[dict], meta, grid, by_apn, rings) -> tuple[int, int]:
    """`marks/join_fp.py::resolve`, same two rules, same tie-break."""
    nap = nco = nh = 0
    FT_M = 0.3048

    def pick(cand, p):
        """THE BIGGEST FOOTPRINT ON THE PARCEL WINS — and for a tower standing
        on a podium that is the podium.

        `marks/join_fp.py`'s rule is `max(area)`, and it is right for a register
        that publishes only a point: the largest ring on the parcel is the
        building the point is most likely to mean. It is wrong for the one
        register here that publishes a HEIGHT. Measured against `height_ft`
        over the 99 Tall Building Inventory rows that reach a footprint:
        **eight of them joined a footprint under 75 % of their published height
        while a footprint within 60 m matched it** — Spear Tower took a 28 m
        ring with a 172 m one beside it, Four Embarcadero Center an 11 m ring
        with a 151 m one, the PG&E Building a 12 m ring with a 145 m one.

        So where the row carries a published height, the tie is broken on
        HEIGHT AGREEMENT instead of area. Rows from every other register are
        untouched: none of them publishes one, `hft` is absent, and the rule
        falls straight back to `max(area)`.
        """
        hft = p.get("hft")
        if hft:
            want = hft * FT_M
            return min(cand, key=lambda i: (abs(meta[i][5] - want), -meta[i][0])), True
        return max(cand, key=lambda i: meta[i][0]), False

    for p in places:
        bi = None
        how = None
        apn = p.get("apn")
        if apn:
            cand = by_apn.get(apn, [])
            if cand:
                bi, byh = pick(cand, p)
                how = "apn"
                nap += 1
                nh += 1 if byh else 0
        if bi is None:
            gx, gy = int(p["x"] // CELL), int(p["y"] // CELL)
            hits = []
            for i in grid.get((gx, gy), ()):
                A, mnx, mny, mxx, mxy, h, yr, pn = meta[i]
                if p["x"] < mnx or p["x"] > mxx or p["y"] < mny or p["y"] > mxy:
                    continue
                if not inside(rings[i], p["x"], p["y"]):
                    continue
                hits.append(i)
            if hits:
                bi, byh = pick(hits, p)
                how = "contain"
                nco += 1
                nh += 1 if byh else 0
        if bi is not None:
            A, mnx, mny, mxx, mxy, h, yr, pn = meta[bi]
            p["bi"] = bi
            p["fpBy"] = how
            p["fpA"] = A
            p["fpH"] = h
            p["fpYr"] = yr
            p["fpPn"] = pn
    resolve.by_height = nh  # type: ignore[attr-defined]
    return nap, nco


def main() -> int:
    print("reading the footprint index the map already ships …")
    meta, grid, by_apn, rings = pickle.loads(FPIDX.read_bytes())
    print(f"  {len(meta):,} footprints, {len(by_apn):,} parcels")

    old, marksfile = shipped()
    print(f"  {len(old):,} places already on the map")

    fresh: list[dict] = []
    per_src = {}
    for key, fn in REGISTERS:
        rows = fn()
        for r in rows:
            r.setdefault("ground", 0)
        per_src[key] = len(rows)
        fresh.extend(rows)
    print(f"read {len(fresh):,} candidate rows from {len(REGISTERS)} registers")
    for k, v in per_src.items():
        print(f"   {k:12s} {v:5d}")

    nap, nco = resolve(fresh, meta, grid, by_apn, rings)
    print(f"footprint join: {nap} by parcel, {nco} by containment, "
          f"{nap + nco} of {len(fresh)} ({100.0 * (nap + nco) / len(fresh):.1f} %)")
    print(f"   of those, {getattr(resolve, 'by_height', 0)} broke the tie on the "
          f"register's own published height rather than on area")

    # ── SPAN. BLOCK-N's ladder, unchanged. ──────────────────────────────
    for p in fresh:
        if p.get("bi") is not None:
            p["span"] = max(math.sqrt(p["fpA"]), float(p["fpH"]))
            p["spanFrom"] = "footprint"
        elif p.get("a"):
            p["span"] = math.sqrt(p["a"])
            p["spanFrom"] = "ring"
        else:
            p["span"] = 0.0
            p["spanFrom"] = None
    no_extent = sum(1 for p in fresh if p["span"] <= 0)
    print(f"dropped, no published geometry so no published extent  {no_extent}")

    # ── INSIDE THE DRAWN CITY ───────────────────────────────────────────
    BX0 = min(m[1] for m in meta)
    BX1 = max(m[3] for m in meta)
    BY0 = min(m[2] for m in meta)
    BY1 = max(m[4] for m in meta)
    off = 0
    for p in fresh:
        if p["span"] <= 0:
            continue
        if not (BX0 <= p["x"] <= BX1 and BY0 <= p["y"] <= BY1):
            p["span"] = 0.0
            off += 1
    print(f"dropped, outside the drawn city                        {off}")

    live = [p for p in fresh if p["span"] > 0]

    # ── ONE NAME PER FOOTPRINT, ACROSS THE UNION ────────────────────────
    #    BLOCK-N's key, and the already-shipped row breaks a tie so the merge
    #    is stable: re-running this build never reshuffles the map.
    union = [dict(q) for q in old] + live
    for q in union:
        q.setdefault("des", 0)
        q.setdefault("old", 0)
    keep: dict[int, tuple] = {}
    for p in union:
        bi = p.get("bi")
        if bi is None:
            continue
        key = (p["des"], 1 if p.get("a") or p.get("old") else 0, -len(p["n"]), p["old"])
        cur = keep.get(bi)
        if cur is None or key > cur[0]:
            keep[bi] = (key, id(p))
    dup_new = dup_old = 0
    for p in union:
        bi = p.get("bi")
        if bi is not None and keep[bi][1] != id(p):
            p["_dup"] = 1
            if p["old"]:
                dup_old += 1
            else:
                dup_new += 1
    print(f"dropped, shares a footprint with a better-sourced row  "
          f"{dup_new} new, {dup_old} already shipped")

    # ── ONE NAME PER SAN FRANCISCO BLOCK ────────────────────────────────
    survivors = [p for p in union if not p.get("_dup")]
    # DESIGNATED FIRST HERE TOO. Article 10 publishes `Jack's Restaurant
    # Building`; Article 11 publishes `JACK'S RESTAURANT BUILDING` over the same
    # place with a polygon and therefore a larger span. Sorting this rule by
    # span alone handed the row to the register that has NOT designated it and
    # silently took the landmark mark off the map. The survivor key is the
    # footprint rule's, so both dedups answer "which register outranks which"
    # the same way.
    survivors.sort(key=lambda q: (-q["des"], -q["span"], -q["old"], q["n"]))
    byname = defaultdict(list)
    out = []
    dropped_name_new = dropped_name_old = 0
    for p in survivors:
        k = p["n"].lower()
        if any(math.hypot(p["x"] - q["x"], p["y"] - q["y"]) < SF_BLOCK[0] for q in byname[k]):
            if p["old"]:
                dropped_name_old += 1
            else:
                dropped_name_new += 1
            continue
        byname[k].append(p)
        out.append(p)
    print(f"dropped, same name inside one San Francisco block      "
          f"{dropped_name_new} new, {dropped_name_old} already shipped")

    # ── THE YEAR ────────────────────────────────────────────────────────
    ml = json.loads(MADELAND.read_text())
    made_of: dict[str, int] = {}
    for bk in ml["buckets"]:
        for bn in bk["blocks"]:
            made_of[bn] = max(made_of.get(bn, 0), bk["built"][1])
    rung = Counter()
    for p in out:
        if p["old"]:
            rung["already shipped"] += 1
            continue
        if p.get("yr"):
            p["y0"], how = int(p["yr"]), "the register's own year"
        elif p.get("bi") is not None:
            p["y0"], how = int(p["fpYr"]), "the roll year of the footprint it resolves to"
        elif not p.get("ground"):
            # A BUILDING REGISTER MAY NOT TAKE ITS YEAR FROM THE GROUND.
            # The two lower rungs — the first dated building standing inside
            # the extent, and the made-land year of the ground — are
            # statements about a piece of GROUND. They can honestly date a
            # park or a campus, because there the ground is the thing being
            # named. They cannot date a building or a structure: the NPS
            # register's own Bay Bridge row has no construction year and no
            # footprint, and dating it from the ground under it would put
            # SAN FRANCISCO--OAKLAND BAY BRIDGE on the 1906 frame, thirty
            # years before it was built. So a row from a building register
            # that resolves to no footprint has no published year, and this
            # block does not ship it.
            p["span"] = 0.0
            p["_noyear"] = 1
            how = None
        else:
            first = None
            gx0 = int((p["x"] - p["span"] / 2) // CELL)
            gx1 = int((p["x"] + p["span"] / 2) // CELL)
            gy0 = int((p["y"] - p["span"] / 2) // CELL)
            gy1 = int((p["y"] + p["span"] / 2) // CELL)
            for gx in range(gx0, gx1 + 1):
                for gy in range(gy0, gy1 + 1):
                    for i in grid.get((gx, gy), ()):
                        A, mnx, mny, mxx, mxy, h, byr, pn = meta[i]
                        cx, cy = (mnx + mxx) / 2.0, (mny + mxy) / 2.0
                        if abs(cx - p["x"]) > p["span"] / 2 or abs(cy - p["y"]) > p["span"] / 2:
                            continue
                        if byr and (first is None or byr < first):
                            first = byr
            if first is not None:
                p["y0"], how = int(first), "the first dated building inside its own extent"
            else:
                mb = 0
                for i in grid.get((int(p["x"] // CELL), int(p["y"] // CELL)), ()):
                    pn = meta[i][7]
                    if pn:
                        mb = made_of.get(pn[:4], 0)
                        break
                p["y0"], how = int(mb or 0), "the made-land year of the ground under it"
        p["y0rule"] = how
        rung[how if how else "DROPPED — a building register row with no published year"] += 1

    noyear = sum(1 for p in out if p.get("_noyear"))
    out = [p for p in out if not p.get("_noyear")]
    print(f"dropped, a building register row with no published year and no "
          f"dated footprint  {noyear}")

    out.sort(key=lambda q: (-q["span"], q["n"]))
    new = [p for p in out if not p["old"]]
    print()
    print(f"ALREADY SHIPPED that survive the merge   {len(out) - len(new):5d} of {len(old)}")
    print(f"NEW                                      {len(new):5d}")
    print(f"TOTAL                                    {len(out):5d}")
    print("year rung:")
    for k, v in rung.most_common():
        print(f"   {v:5d}  {k}")

    doc = {
        "places": [
            {
                "n": p["n"],
                "x": round(p["x"], 2),
                "y": round(p["y"], 2),
                "span": round(p["span"], 2),
                "bi": p.get("bi"),
                "y0": int(p.get("y0") or 0),
                "des": int(p["des"]),
                "ggb": int(p.get("ggb") or 0),
                "src": p["src"],
                "old": int(p["old"]),
                "spanFrom": p.get("spanFrom"),
                "fpBy": p.get("fpBy"),
                "y0rule": p.get("y0rule"),
                "sid": p.get("sid"),
                "nrhpListed": p.get("nrhpListed"),
                "a11": p.get("a11"),
                "yrField": p.get("yrField"),
            }
            for p in out
        ],
        "report": {
            "footprints_indexed": len(meta),
            "already_shipped": len(old),
            "candidates_read": len(fresh),
            "per_register": per_src,
            "join_apn": nap,
            "join_contain": nco,
            "dropped_no_extent": no_extent,
            "dropped_outside": off,
            "dropped_dup_footprint_new": dup_new,
            "dropped_dup_footprint_old": dup_old,
            "dropped_dup_name_new": dropped_name_new,
            "dropped_dup_name_old": dropped_name_old,
            "dropped_name_is_address": reg_tall.dropped_name_is_address
            + reg_popos.dropped_name_is_address,
            "dropped_demolished": reg_article11.dropped_demolished,
            "dropped_crossref": reg_article11.dropped_crossref,
            "dropped_nrhp_district": reg_nrhp.dropped_district,
            "dropped_schools_pending": reg_schools.dropped_pending,
            "dropped_rpfac_category": reg_rpfac.dropped_category,
            "dropped_rpfac_residue": reg_rpfac.dropped_residue,
            "dropped_no_published_year": noyear,
            "year_rung": dict(rung),
            "bounds": [BX0, BY0, BX1, BY1],
            "shipped_total": len(out),
            "shipped_new": len(new),
        },
        "marks_meta": marksfile["meta"],
        "ggb": marksfile["ggb"],
        "ggbYr": marksfile["ggbYr"],
    }
    OUT.write_text(json.dumps(doc, separators=(",", ":")))
    print(f"\n{OUT.relative_to(ROOT)}  {OUT.stat().st_size:,} bytes")

    print("\ntop 30 NEW by span")
    for p in new[:30]:
        print(f"   {p['span']:7.1f} m  {p['src']:10s}  {p['n'][:58]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
