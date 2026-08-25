#!/usr/bin/env python3
"""THE FILM — eleven moments, and the gate on every line of copy in them.

    python3 pipeline/scripts/us_sf_city/build_film_twelve.py
        -> website/public/data/us/sf/city/film/film.json

WHY THIS FILE EXISTS AND WHAT IT REPLACES
=========================================
The ten shots that shipped were TRUE and four of them were not worth watching:
a request that owners clear their own lots, a bond tally, a repeal that moved
City Hall three blocks, a fifty-five dollar heating duct. Daniel watched it and
said so. The gate in `scratchpad/sf-city-anim/film/build_film.py` guarantees a
line traces to a scanned page; it cannot tell you whether a person would want to
hear it, and the two were being confused.

So the SHOTS are re-chosen here and **the gate is kept, verbatim in behaviour**:
this script will not write a payload unless every line on screen is the headline
of a beat, or a verbatim run of a quote, that already exists in
`scratchpad/sf-city-anim/entries/` at the volume and BookReader leaf the shot
cites. `check_copy` below is `build_film.py`'s own function.

This is a NEW file rather than an edit to `build_film.py` / `camera.json` /
`build_film_payload.py` because those three are shared with other work in this
tree. It reads the same inputs and writes the same output shape, and it folds
the two old stages into one: the camera table that was `camera.json` is the
`SHOTS` literal below, so a reviewer reads the framing, the copy and the
citation in one place instead of three.

WHAT IS DECIDED HERE AND WHAT IS ONLY COPIED
--------------------------------------------
DECIDED here, and only these: which eleven moments, how the camera is framed on
each, and how long each act lasts. Every one of those is an editorial judgement
and none of them is a claim about the world.

COPIED, never invented:
  · every line of copy — out of `entries/`, through the gate
  · every citation — the item and the BookReader leaf of the beat it came from
  · every coordinate — a geocoded entity out of `gen/decisions-data.js`, a
    published hero footprint out of `hero-data.js`, a DataSF centreline, or a
    published landmark position with its dataset named beside it
  · every year on screen — the year the record gives the decision

THE YEAR LINE IS MONOTONE BY CONSTRUCTION. `film.ts`'s `buildTimeline` derives
the year from the previous shot's close and throws on a backward run, and
`film.test.ts` builds it against the shipped payload at module load. A payload
that reintroduces a rewind fails the suite. The twelve years below run
1906, 1915, 1915, 1937, 1942, 1945, 1959, 1972, 1991, 2018, 2019.

Deterministic: same input bytes give byte-identical output.
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from _srcload import MOCK, ROOT  # noqa: E402

CITY = ROOT / "website" / "public" / "data" / "us" / "sf" / "city"
OUT = CITY / "film"

# ── the moments ─────────────────────────────────────────────────────────────
# `t` is the camera target (None = the whole-city fit), `z` the zoom multiple,
# `off` the fraction of the frame the subject is pushed by so the copy plate
# bottom-left does not sit on it. `move` is the travel INTO the shot and `ms`
# the whole shot including it; `film.ts` §SCRIPT holds the acts and
# `buildTimeline` asserts that move + acts == ms, so these two files cannot
# drift apart silently.
SHOTS: list[dict] = [
    # 1 · THE FIRE. Locked. The film's first gesture is the burn line drawing
    # itself round the burned city, and then the Fire Department's own schedule
    # of losses lighting row by row inside it. There is no camera move in this
    # shot and that is the design: shot 2 opens on this exact frame, so the cut
    # between them is a MATCH CUT and the only thing that changes is the year.
    # A push in here would also be the most expensive thing in the piece —
    # FILM.md §15.1 measures a travel at 4 to 32 rasterisations and a locked
    # camera at zero — so the strongest image available is also the cheapest.
    dict(n=1, id="burn", title="The fire, and what it took of the city's own",
         t=(-122.409, 37.783), z=2.05, off=(0.0, 0.0), move=0, ms=13000,
         st=(None, 1906)),
    # 2 · THE MATCH CUT. Same target, same z, no move. Nine years run under a
    # camera that does not move and the fabric comes back inside the hairline.
    dict(n=2, id="rebuild", title="It comes back",
         t=(-122.409, 37.783), z=2.05, off=(0.0, 0.0), move=0, ms=12000,
         st=(1906, 1915)),
    # 3 · THE PALACE. Down to the Marina. The rotunda's own published footprint
    # centroid, out of wonder/hero-data.js — the same ring the renderer draws.
    dict(n=3, id="palace", title="One building stays",
         t=(-122.448403, 37.802924), z=20.0, off=(0.14, -0.16), move=2400, ms=9600,
         st=(1912, 1915)),
    # 4 · THE WIDEST CAMERA IN THE FILM, and the only shot with two subjects.
    # It opens on empty water at 1915, runs to 1936, strokes the Bay Bridge
    # deck out from Rincon Hill, holds, and then runs two more years while the
    # fabric puts the Golden Gate up on its own published date.
    dict(n=4, id="bridges", title="Two bridges",
         t=None, z=1.10, off=(0.0, 0.0), move=2400, ms=11800,
         st=(1915, 1937)),
    # 5 · JAPANTOWN. Tight on the Western Addition and, after the move that
    # gets there, completely still. Nothing rises but the four streets the
    # resolution names. Restraint is the design here.
    dict(n=5, id="japantown", title="Japantown",
         t=(-122.429078, 37.786676), z=5.5, off=(0.0, -0.10), move=2400, ms=11400,
         st=(1937, 1942)),
    dict(n=6, id="charter", title="Fifty nations, in the war memorial",
         t=(-122.420881, 37.778560), z=20.0, off=(0.14, -0.10), move=2400, ms=9600,
         st=(1942, 1945)),
    # 7 · THE FREEWAYS THAT WERE NOT BUILT. High over the whole city, and
    # NOTHING IS DRAWN. `entries/freeway-revolt-1959.json` says in the open
    # that the corridors are "NOT IN RECORD as geometry" — the resolution
    # names seven routes and no alignment for any of them is published here.
    # Ghosting them in would be inventing seven roads. The shot is the city
    # they are not in, and the badge says so.
    dict(n=7, id="freeways", title="The freeways that were not built",
         t=None, z=1.25, off=(0.0, 0.0), move=2400, ms=11000,
         st=(1945, 1959)),
    dict(n=8, id="pyramid", title="The Pyramid",
         t=(-122.402707, 37.795274), z=24.0, off=(0.12, -0.12), move=2400, ms=10400,
         st=(1959, 1972)),
    # 9 · THE WATERFRONT, HELD. The Embarcadero Freeway was never drawn — the
    # fabric is the assessor's roll and the roll dates what is standing — so
    # there is no structure to take down and the film does not pretend there
    # is. The shot is the vote and the ground it gave back.
    dict(n=9, id="embarcadero", title="The road that came down",
         t=(-122.397500, 37.796500), z=3.4, off=(0.10, -0.06), move=2400, ms=11000,
         st=(1972, 1991)),
    # 10 · THE RHYME. Shot 2's move, seventy years later: the camera stops and
    # a district fills in under it.
    dict(n=10, id="mission-bay", title="A rail yard becomes a neighbourhood",
         t=(-122.395141, 37.772878), z=3.6, off=(0.12, -0.06), move=2400, ms=12000,
         st=(1991, 2018)),
    # 11 · OUT TO THE WHOLE CITY, which is where the film started.
    dict(n=11, id="face", title="What the city would not let itself do",
         t=None, z=1.10, off=(0.0, 0.0), move=2400, ms=9600,
         st=(2018, 2019)),
]

# ── the copy, and the record it comes out of ────────────────────────────────
# `find` is what must be present in the beat at (item, leaf): either the beat's
# own `headline`, or a verbatim run of its `quote`. It is NOT the string shown
# on screen when they differ — `copy` is — and the difference is only ever a
# trim, never a rewrite.
#
# The narration line for each shot is written to Daniel's own brief and is a
# plain factual sentence; where the record says the thing better, the RECORD is
# what goes on screen and the narration becomes the shot's title. Six of the
# eleven are the Board's own words for that reason.
COPY: dict[int, dict] = {
    # THE FIRST OF THE THREE DATA SHOTS. The line is one plain sentence and
    # both of its numbers are clickable: 28,000 is the USGS's own count for the
    # three-day conflagration, and 27 is counted by build_fire_losses.py off
    # the Municipal Report's own schedule — which is the second link, and the
    # thing the frame is drawing. A quoted table heading was tried here and it
    # is three lines of nineteenth-century title on a plate that has room for
    # two; the heading is where the link goes instead.
    1: dict(kind="data",
            copy="The fire burned for three days and destroyed some 28,000 "
                 "buildings, twenty-seven of them the Fire Department's own.",
            links=[("28,000 buildings, a three-day fire — USGS",
                    "https://earthquake.usgs.gov/earthquakes/events/1906calif/18april/casualties.php"),
                   ("The Fire Department's own schedule of what it lost, "
                    "Municipal Reports 1906",
                    "https://archive.org/details/excerptsfromsanf1908sanf/page/n8/mode/1up")]),
    2: dict(item="journalofproceed01sanfrich", leaf=25, kind="scan", find="headline",
            copy="The Auditor files next year's budget and notes that the "
                 "valuation it rests on burned six weeks ago."),
    3: dict(item="journalofproceed1915sanfrich", leaf=352, kind="scan", find="quote",
            copy="“if this building was permitted to remain permanently it "
                 "… would very materially add to the beauty of that section "
                 "of our city” — the Board asks for the Palace of Fine "
                 "Arts while the fair is still open.",
            verbatim="would very materially add to the beauty of that section of our city"),
    4: dict(item="journalofproceed31sanfrich", leaf=46, kind="scan", find="headline",
            copy="Nine months from opening, the Mayor prices the bridge at "
                 "$77,600,000 and names the next fight: the tolls."),
    5: dict(item="journalofproceed37sanfrich", leaf=713, kind="scan", find="quote",
            copy="“National Housing Agency and Home Owners Loan Corporation "
                 "Urged to Effectuate Slum Clearance in Japanese Quarter” "
                 "— the Board, 20 April 1942, three weeks after the removal. "
                 "Adopted 8 to 3.",
            verbatim="National Housing Agency and Home Owners Loan Corporation "
                     "Urged to Effectuate Slum Clearance in Japanese Quarter"),
    6: dict(item="journalofproceed40part3sanfrich", leaf=726, kind="scan", find="quote",
            copy="“the four city blocks occupied by the Veterans’ "
                 "Building, Opera House and the Civic Center Plaza” — "
                 "the city measures what it had just held.",
            verbatim="the four city blocks occupied by the Veterans' Building, "
                     "Opera House and the Civic Center Plaza"),
    7: dict(item="journalofproceed54sanfrich", leaf=48, kind="scan", find="quote",
            copy="“It is beyond the power of the Board to delete anything in "
                 "the Master Plan … The resolution merely expresses "
                 "opposition” — and it was enough.",
            verbatim="It is beyond the power of the Board to delete anything in "
                     "the Master Plan"),
    # THE ONE SHOT WHOSE SOURCE IS NOT A SCANNED MINUTE BOOK, AND IT SAYS SO.
    # There is no Journal volume for the Pyramid in this corpus, so the shot
    # carries a DATA chip and cites the two published registers the claim rests
    # on, exactly as the old shot 10 did for the fabric's own dates.
    8: dict(kind="data",
            copy="853 feet, fifty floors, finished in 1972 — the tallest "
                 "building in San Francisco until Salesforce Tower opened in 2018.",
            links=[("Height, floors and completion year, DataSF Tall Building Inventory",
                    "https://data.sfgov.org/d/5kya-mfst"),
                   ("The footprint and its year, DataSF",
                    "https://data.sfgov.org/d/ynuv-fyni")]),
    9: dict(item="journalofproceed85julydecsanfrich", leaf=375, kind="scan", find="quote",
             copy="“the resolution as amended … was refused adoption” "
                  "— beaten 2 to 9, rescinded, and carried 6 to 5 the same "
                  "afternoon.",
             verbatim="was refused adoption by the following vote"),
    # THE SECOND OF THE TWO DATA SHOTS. The Board's own record for Mission Bay
    # is in Legistar rather than in a scanned volume — `mission-bay.json`'s
    # fifteen beats are all `live` matters — and a Legistar matter has no
    # BookReader leaf, so it cannot carry the SCAN chip this film's citations
    # are shaped for. The population is DataSF's own published figure for the
    # Mission Bay analysis neighborhood and the rail yard is OCII's own word.
    10: dict(kind="data",
             copy="The Southern Pacific rail yards became a neighbourhood of "
                  "16,710 people.",
             links=[("Population, DataSF neighborhood demographics (ACS 2019–2023)",
                     "https://data.sfgov.org/d/4qbq-hvtt"),
                    ("\u201cformerly-underutilized Southern Pacific railyards\u201d — OCII",
                     "https://sfocii.org/projects/mission-bay-south/overview")]),
    11: dict(kind="data",
             copy="“it shall be unlawful for any Department to obtain, retain, "
                  "access, or use … any Face Recognition Technology” — "
                  "Ordinance 103-19, finally passed 10 to 1 on 21 May 2019.",
             links=[("Ordinance No. 103-19, File 190110, as passed",
                     "https://sfgov.legistar.com/View.ashx?M=F&ID=7226786&GUID=78A20A6B-F1D1-4044-AA15-82AF55D98040"),
                    ("Board minutes, 21 May 2019 — the final vote",
                     "https://sfbos.org/sites/default/files/bag052119_minutes.pdf")]),
}

# The second thing a shot says, after the first has settled.
COPY2: dict[int, dict] = {
    4: dict(item="journalofproceed32sanfrich", leaf=11, kind="scan", find="headline",
            copy="Four months before it opens, the city learns the road to the "
                 "bridge is its own bill: a third of $1,650,000."),
    5: dict(item="journalofproceed37sanfrich", leaf=543, kind="scan", find="quote",
            copy="“the attention of the Western Defense Command … be "
                 "notified of this condition” — the Board reports the "
                 "city's two Japanese newspapers, 11 to 0, six weeks earlier.",
            verbatim="the attention of the Western Defense Command and 4th Army"),
}

TITLE = dict(
    head="San Francisco builds itself",
    sub="Eleven moments from the city's own record, 1906 to 2019",
)
END = dict(
    head="Every line in that film is a page you can open",
    sub="Stop anywhere and the map becomes the record: 45 entities, "
        "2,051 accepted streets, 166,166 buildings.",
)

# ── which shot raises what ──────────────────────────────────────────────────
# `ring` and `placemark` need a geocoded entity; `footprint` needs a published
# building index; `burnLine`, `fire`, `bridge` and `outline` carry their own
# geometry. Nothing here supplies a coordinate — every one is looked up.
BUILDS: dict[int, dict] = {
    1: dict(what="burnLine", entity=None, ms=1400, curve="enter"),
    # `placemark`, NOT `footprint`, and this is a correction made by looking.
    # A `footprint` build hides the fabric's own drawing for the whole shot and
    # replaces it with the film's flat prism — right for City Hall in the old
    # cut, where the film raised a building the fabric dated 1906. It is wrong
    # for all three of these: the Palace rotunda, the Opera House and the
    # Pyramid are HEROES, drawn by `landmarks.ts` with their colonnade, their
    # drum and their shaft, and the film was covering each with a grey box.
    # `out-m1c/watch-charter-sheet.png` and `watch-pyramid-sheet.png` are the
    # frames that showed it. The mark and the name are the film's; the building
    # is the map's, on its own published year.
    3: dict(what="placemark", entity="palace-of-fine-arts", ms=1200, curve="settle"),
    5: dict(what="outline", entity="japantown-1942", ms=1400, curve="enter"),
    6: dict(what="placemark", entity="united-nations-charter-1945", ms=1200, curve="settle"),
    8: dict(what="placemark", entity="transamerica-pyramid", ms=1200, curve="settle"),
    10: dict(what="ring", entity="mission-bay", ms=900, curve="settle"),
}
BUILD2: dict[int, dict] = {
    4: dict(what="bridge", entity="bay-bridge", ms=1600, curve="travel",
            cnn=["14248000", "14249000"], gate=1936),
}

# Entities the film names that are a PUBLISHED HERO rather than a geocoded
# decision. Position is the hero's own footprint centroid — the same ring the
# renderer draws — except the Pyramid, whose ring is not in the mock's
# hero-data and whose position is DataSF's own published polygon centroid for
# assessor block/lot 0207032, named here beside the number.
HERO_ENTS: dict[str, dict] = {
    "palace-of-fine-arts": dict(
        hero="pofa", f="green", y=1915, n="Palace of Fine Arts",
        why="rotunda footprint centroid, wonder/hero-data.js, which is DataSF "
            "97yj-54sx Article 10 landmark no. 88 joined to its own parcel"),
    "united-nations-charter-1945": dict(
        hero="opera", f="civic", y=1932, n="War Memorial Opera House",
        why="footprint centroid, wonder/hero-data.js"),
    # The 1942 district is not a hero and not a geocoded decision: its geometry
    # IS the four streets the resolution names, so its position is the centre of
    # the box they make and is computed from them below.
    "japantown-1942": dict(
        hero=None, f="civic", y=1942, n="The district the Board named",
        why="the centre of the box made by ELLIS, CALIFORNIA, GOUGH and "
            "FILLMORE — the four streets the resolution itself names, out of "
            "DataSF's own centrelines"),
    "transamerica-pyramid": dict(
        hero="transamerica", f="civic", y=1972, n="Transamerica Pyramid",
        ll=(-122.402707, 37.795274),
        why="polygon centroid of block/lot 0207032, DataSF Tall Building "
            "Inventory 5kya-mfst (600 Montgomery Street, 853 ft, 1972)"),
}

# The district the 1942 resolution names as its own subject. Nothing here draws
# a boundary: it draws the FOUR STREETS the Board named, out of the same
# published centreline file the accepted streets come from, clipped to the box
# they make. See `district_outline`.
DISTRICT_1942 = dict(
    streets=["ELLIS", "CALIFORNIA", "GOUGH", "FILLMORE"],
    said='the district bounded by ELLIS, CALIFORNIA, GOUGH AND FILLMORE STREETS',
)


# ── the gate ────────────────────────────────────────────────────────────────
def load_beats() -> dict:
    out: dict = {}
    for f in sorted((MOCK / "entries").glob("*.json")):
        e = json.loads(f.read_text())
        for b in e.get("beats", []):
            s = b.get("source") or {}
            key = (s.get("item"), s.get("leaf")) if s.get("source_type") == "archive" \
                else (s.get("url"), None)
            if key[0] is None:
                continue
            out.setdefault(key, []).append((e["id"], b, s))
    return out


def check_copy(beats: dict, n: int, c: dict) -> dict | None:
    """Refuse to emit a line the corpus does not hold. `build_film.py`'s own."""
    if c["kind"] == "data":
        return None
    key = (c["item"], c.get("leaf"))
    cands = beats.get(key)
    if not cands:
        sys.exit(f"shot {n} cites {c['item']} leaf {c.get('leaf')} "
                 f"and no beat in entries/ does")
    for eid, b, s in cands:
        if c["find"] == "headline" and (b.get("headline") or "").strip() == c["copy"].strip():
            return dict(entity=eid, year=b.get("year"), url=s.get("url"),
                        item=c["item"], leaf=c.get("leaf"))
        if c["find"] == "quote":
            q = " ".join((b.get("quote") or "").split())
            v = " ".join(c["verbatim"].split())
            if v and v in q:
                return dict(entity=eid, year=b.get("year"), url=s.get("url"),
                            item=c["item"], leaf=c.get("leaf"))
    sys.exit(f"shot {n}: the line on screen is not the {c['find']} of any beat at "
             f"{c['item']} leaf {c.get('leaf')}.\n  on screen: {c['copy']!r}")


# ── published geometry ──────────────────────────────────────────────────────
def _streets() -> list:
    return json.loads((MOCK / "geo" / "cache" / "streets.json").read_text())


def bridge_geometry(cnns: list[str]) -> list:
    """The Bay Bridge west span, as PUBLISHED — DataSF centrelines, layer
    FREEWAYS, cnn 14248000 and 14249000. The modern deck gated on the record's
    own 1936 beat, exactly as an accepted street is the modern centreline gated
    on the year the Board voted."""
    out = [[[round(c[0], 6), round(c[1], 6)] for c in r["line"]["coordinates"]]
           for r in _streets() if r.get("cnn") in cnns and r.get("line")]
    if len(out) != len(cnns):
        sys.exit(f"the bridge deck is not in geo/cache/streets.json under {cnns}")
    return out


def _seg_x(a, b, c, d):
    (x1, y1), (x2, y2) = a, b
    (x3, y3), (x4, y4) = c, d
    den = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3)
    if abs(den) < 1e-14:
        return None
    t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / den
    u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / den
    if 0 <= t <= 1 and 0 <= u <= 1:
        return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
    return None


def district_outline(names: list[str]) -> tuple[list, tuple[float, float]]:
    """The four streets the 1942 resolution names, clipped to the box they make.

    NOT A POLYGON, and the difference matters. The Board named four streets; the
    film draws four streets. The bounding box is the extent of their own mutual
    intersections, and each street is emitted over that box only.

    THREE OF THE FOUR CORNERS EXIST IN THE 2026 CENTRELINE FILE AND ONE DOES
    NOT: Ellis no longer reaches Fillmore. The redevelopment this very
    resolution asked Washington for is what cut it — so the missing corner is
    the resolution's own consequence, and the box is taken from the three
    crossings that do exist plus Fillmore's own longitude at Ellis's latitude.
    """
    S = _streets()

    def segs(nm):
        out = []
        for r in S:
            if r.get("street", "").upper() == nm and r.get("layer") == "STREETS" \
                    and r.get("line"):
                c = r["line"]["coordinates"]
                out += [(c[i], c[i + 1]) for i in range(len(c) - 1)]
        return out

    by = {nm: segs(nm) for nm in names}
    ns, ew = names[:2], names[2:]          # Ellis, California | Gough, Fillmore
    pts = []
    for a in ns:
        for b in ew:
            for s1 in by[a]:
                for s2 in by[b]:
                    p = _seg_x(s1[0], s1[1], s2[0], s2[1])
                    if p:
                        pts.append(p)
    if len(pts) < 3:
        sys.exit(f"the 1942 district: only {len(pts)} of the four corners are in "
                 "the centreline file")
    lon0, lon1 = min(p[0] for p in pts), max(p[0] for p in pts)
    lat0, lat1 = min(p[1] for p in pts), max(p[1] for p in pts)
    # widen west to Fillmore's own longitude at Ellis's latitude — the corner
    # the modern file has lost. Read off Fillmore, not invented.
    for s in by[names[3]]:
        if min(s[0][1], s[1][1]) <= lat0 <= max(s[0][1], s[1][1]):
            lon0 = min(lon0, s[0][0], s[1][0])

    pad = 1e-5
    lines = []
    for nm in names:
        for s in by[nm]:
            (x1, y1), (x2, y2) = s
            if (lon0 - pad <= x1 <= lon1 + pad and lat0 - pad <= y1 <= lat1 + pad
                    and lon0 - pad <= x2 <= lon1 + pad and lat0 - pad <= y2 <= lat1 + pad):
                lines.append([[round(x1, 6), round(y1, 6)], [round(x2, 6), round(y2, 6)]])
    if not lines:
        sys.exit("the 1942 district clipped to nothing")
    return lines, ((lon0 + lon1) / 2, (lat0 + lat1) / 2)


def hero_rings() -> dict:
    t = (MOCK / "wonder" / "hero-data.js").read_text()
    m = re.search(r"(?:window\.|const\s+)\w+\s*=\s*([\[{])", t)
    v, _ = json.JSONDecoder().raw_decode(t[m.start(1):])
    out = {}
    for h in v["h"]:
        pts = []
        for part in h.get("p", []):
            r = part["r"]
            pts += [(r[i], r[i + 1]) for i in range(0, len(r), 2)]
        if pts:
            out[h["k"]] = (sum(p[0] for p in pts) / len(pts),
                           sum(p[1] for p in pts) / len(pts))
    return out


def _assign(rel: str, var: str):
    text = (MOCK / rel).read_text()
    m = re.search(rf"(?:window\.|const\s+){re.escape(var)}\s*=\s*([\[{{])", text)
    if not m:
        raise ValueError(f"{rel}: no assignment to {var}")
    value, _ = json.JSONDecoder().raw_decode(text[m.start(1):])
    return value


# ── the payload ─────────────────────────────────────────────────────────────
def main() -> None:
    proj = json.loads((CITY / "manifest.json").read_text())["proj"]
    kx, ky = proj["mpd"] * proj["cosl"], proj["mpd"]
    lon0, lat0 = proj["lon0"], proj["lat0"]

    def to_m(lon, lat):
        return ((lon - lon0) * kx, (lat - lat0) * ky)

    def to_dm(lon, lat):
        x, y = to_m(lon, lat)
        return [round(x * 10), round(y * 10)]

    beats = load_beats()
    decisions = _assign("gen/decisions-data.js", "DECISIONS")
    by_id = {d["id"]: d for d in decisions}
    heroes = json.loads((CITY / "base" / "heroes.json").read_text())
    hero_bi = {h["k"]: h["b"] for h in heroes["heroes"]}
    rings = hero_rings()

    district, dcent = district_outline(DISTRICT_1942["streets"])

    shots, wanted = [], set()
    for s in SHOTS:
        n = s["n"]
        c = COPY[n]
        prov = check_copy(beats, n, c)
        target = s["t"]
        if s["id"] == "japantown":
            target = (round(dcent[0], 6), round(dcent[1], 6))
        o = dict(n=n, id=s["id"], title=s["title"], z=s["z"],
                 ox=s["off"][0], oy=s["off"][1],
                 y0=0, y1=0,            # the clock is derived; see the header
                 run=0, move=s["move"], hold=0, shot=s["ms"],
                 curve="travel", copy=c["copy"], kind=c["kind"])
        if target:
            o["lon"], o["lat"] = target[0], target[1]
            wx, wy = to_m(*target)
            o["wx"], o["wy"] = round(wx, 3), round(wy, 3)
        if prov:
            o["cite"] = dict(item=prov["item"], leaf=prov["leaf"],
                             url=prov["url"], entity=prov["entity"])
        if c["kind"] == "data":
            o["links"] = [dict(t=a, u=b) for a, b in c["links"]]

        b = BUILDS.get(n)
        if b:
            o["build"] = dict(what=b["what"], entity=b["entity"], ms=b["ms"],
                              curve=b["curve"])
            if b["entity"]:
                wanted.add(b["entity"])
            if b["what"] == "outline":
                o["build"]["w"] = [[to_dm(p[0], p[1]) for p in ln] for ln in district]
                o["build"]["said"] = DISTRICT_1942["said"]

        b2 = BUILD2.get(n)
        c2 = COPY2.get(n)
        if b2 or c2:
            d2: dict = {}
            if b2:
                d2.update(what=b2["what"], entity=b2["entity"], ms=b2["ms"],
                          curve=b2["curve"], gate=b2.get("gate"))
                if b2.get("cnn"):
                    d2["w"] = [[to_dm(p[0], p[1]) for p in ln]
                               for ln in bridge_geometry(b2["cnn"])]
                if b2["entity"]:
                    wanted.add(b2["entity"])
            if c2:
                p2 = check_copy(beats, n, c2)
                d2["copy"] = c2["copy"]
                if p2:
                    d2["cite"] = dict(item=p2["item"], leaf=p2["leaf"],
                                      url=p2["url"], entity=p2["entity"])
            o["build2"] = d2

        o["stFrom"], o["stTo"] = s["st"]
        shots.append(o)

    # the year line, for the payload's own record. `film.ts` derives the clock
    # from SCRIPT and does not read these, but a reader of the JSON should not
    # have to run the TypeScript to see what year a shot is about.
    YEARS = [1906, 1915, 1915, 1937, 1942, 1945, 1959, 1972, 1991, 2018, 2019]
    prev = 1906
    for o, y in zip(shots, YEARS):
        o["y0"], o["y1"] = prev, y
        prev = y

    # ── the subjects ────────────────────────────────────────────────────────
    ents = {}
    for eid in sorted(wanted):
        h = HERO_ENTS.get(eid)
        if h:
            ll = h.get("ll") or None
            if ll is None and h["hero"] is None:
                ll = dcent
            if ll is None:
                r = rings.get(h["hero"])
                if r is None:
                    sys.exit(f"{eid}: hero {h['hero']} has no ring in hero-data.js "
                             "and no published position is given")
                ll = (lon0 + r[0] / kx, lat0 + r[1] / ky)
            wx, wy = to_m(*ll)
            row = {"n": h["n"], "f": h["f"], "y": h["y"],
                   "wx": round(wx, 3), "wy": round(wy, 3),
                   "lon": round(ll[0], 6), "lat": round(ll[1], 6),
                   "prec": "facility", "biBy": h["why"]}
            if h["hero"] and h["hero"] in hero_bi:
                row["bi"] = hero_bi[h["hero"]]
            ents[eid] = row
            continue
        d = by_id.get(eid)
        if d is None:
            sys.exit(f"the film names {eid} and nothing published locates it")
        row = {"n": d["n"], "f": d["f"], "y": d["y"]}
        if d.get("ll"):
            wx, wy = to_m(d["ll"][0], d["ll"][1])
            row.update(wx=round(wx, 3), wy=round(wy, 3),
                       lon=d["ll"][0], lat=d["ll"][1])
        if d.get("rad") is not None:
            row["radM"] = d["rad"]
        if d.get("prec"):
            row["prec"] = d["prec"]
        ents[eid] = row

    # ── the accepted streets ────────────────────────────────────────────────
    accepted = json.loads((MOCK / "film" / "out" / "accept-lines.json").read_text())
    accepted.sort(key=lambda r: (r["y"], r["cnn"]))
    vols = sorted({r["v"] for r in accepted})
    vix = {v: i for i, v in enumerate(vols)}
    ys, vi, leaf, off, xs, yss = [], [], [], [0], [], []
    for r in accepted:
        ys.append(r["y"])
        vi.append(vix[r["v"]])
        leaf.append(r["leaf"])
        for c in r["ll"]:
            x, y = to_dm(c[0], c[1])
            xs.append(x)
            yss.append(y)
        off.append(len(xs))

    total = sum(s["shot"] for s in shots)
    payload = {
        "meta": {
            "generated_by": "pipeline/scripts/us_sf_city/build_film_twelve.py",
            "copy": "Every line of copy and every citation here is checked at build "
                    "time against scratchpad/sf-city-anim/entries/: a line on screen "
                    "is a beat's own headline, or a verbatim run of a beat's quote, "
                    "at the volume and BookReader leaf the shot cites. Two shots "
                    "carry a DATA chip instead, because their source is a published "
                    "register and an enacted ordinance rather than a scanned minute "
                    "book, and they name it.",
            "geometry": "Accepted centrelines: DataSF street centrelines, lit in the "
                        "year the Board voted acceptance. The Bay Bridge west span: "
                        "the same file, layer FREEWAYS, cnn 14248000 and 14249000. "
                        "The 1942 district: the four streets the resolution itself "
                        "names, clipped to the box of their own crossings.",
            "world": "x and y are world DECIMETRES in the map's own frame — "
                     "((lon - proj.lon0) * proj.mpd * proj.cosl, "
                     "(lat - proj.lat0) * proj.mpd), times ten.",
            "streets_note": "The corpus opens in April 1906, so every street accepted "
                            "before the fire was accepted before the record starts. "
                            "1,826 of the 2,051 are lit by 1930 and the last lands in "
                            "1947. Thirteen years in the span have no ingested volume, "
                            "so the curve sits flat through them: that is the sweep, "
                            "not the city.",
            "fire": "The 1906 losses the first shot draws are a separate published "
                    "file, film/fire.json, built by "
                    "pipeline/scripts/us_sf_city/build_fire_losses.py.",
        },
        "runtime": {"titleMs": 3000, "endMs": 4000, "shotsMs": total,
                    "totalMs": total + 7000},
        "title": TITLE,
        "end": END,
        "shots": shots,
        "ents": ents,
        "st": {"vols": vols, "y": ys, "vi": vi, "leaf": leaf, "off": off,
               "x": xs, "yv": yss, "n": len(accepted)},
    }

    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "film.json"
    path.write_text(json.dumps(payload, separators=(",", ":"), sort_keys=False))
    print(f"{path}: {path.stat().st_size:,} bytes · {len(shots)} shots · "
          f"{len(ents)} subjects · {len(accepted):,} accepted segments")
    print(f"  {total/1000:.1f} s of shots + 3.0 title + 4.0 end = "
          f"{(total+7000)/1000:.0f} s")
    print(f"  the 1942 district: {len(district)} published centreline segments, "
          f"centre {dcent[0]:.6f} {dcent[1]:.6f}")


if __name__ == "__main__":
    main()
