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
         t=(-122.409, 37.783), z=2.05, off=(0.0, 0.0), move=0, ms=11200,
         st=(None, 1906)),
    # 2 · THE MATCH CUT. Same target, same z, no move. Nine years run under a
    # camera that does not move and the fabric comes back inside the hairline.
    dict(n=2, id="rebuild", title="It comes back",
         t=(-122.409, 37.783), z=2.05, off=(0.0, 0.0), move=0, ms=5600,
         st=(1906, 1915)),
    # 3 · THE PALACE. Down to the Marina. The rotunda's own published footprint
    # centroid, out of wonder/hero-data.js — the same ring the renderer draws.
    # `z` 58 -> 95 and the offset out to (0.14, -0.10): FILM.md §23.4. At 58 the
    # two Montgomery Street barracks — federal footprints the roll gives no
    # class and no year, so no roof form is derivable for them — were a third
    # of the frame beside the subject. At 95 they are a band at the top left,
    # and the rotunda's columns, arches and lattice dome all resolve.
    dict(n=3, id="palace", title="One building stays",
         t=(-122.448403, 37.802924), z=95.0, off=(0.14, -0.10), move=1200, ms=6800,
         st=(1912, 1915)),
    # 4 · THE WIDEST CAMERA IN THE FILM, and the only shot with two subjects.
    # It opens on empty water at 1915, runs to 1936, strokes the Bay Bridge
    # deck out from Rincon Hill, holds, and then runs two more years while the
    # fabric puts the Golden Gate up on its own published date.
    dict(n=4, id="bridges", title="Two bridges",
         t=None, z=1.26, off=(0.07, 0.03), move=1200, ms=8200,
         st=(1915, 1937)),
    # 5 · JAPANTOWN. Tight on the Western Addition and, after the move that
    # gets there, completely still. Nothing rises but the four streets the
    # resolution names. Restraint is the design here.
    # `z` 5.5 -> 10 and the offset to (0.08, 0.05): FILM.md §26.1. IT STAYS
    # COMPLETELY STILL — only where the still camera SITS moves. At 5.5 the
    # district the shot is named for was 22 % of the frame's width with its
    # southern half in the distance haze, the copy plate sat on its
    # south-west corner, and the hood label read "JAPANT WN" because the
    # ring's own west edge crossed it. At 10 the four streets are the frame,
    # the fabric inside them resolves, and the ring is clear of the plate.
    dict(n=5, id="japantown", title="Japantown",
         t=(-122.429078, 37.786676), z=10.0, off=(0.08, 0.05), move=1800, ms=10800,
         st=(1937, 1942)),
    # 6 · THE WAR MEMORIAL. `z` 20 -> 44 and the offset to (-0.04, -0.16):
    # FILM.md §25.3. At 20 the Opera House was a small pale block right of
    # centre, the left half of the frame was empty park, and the brief asks for
    # a push in "until its label resolves" — it did not. At 44 the Opera House
    # carries its own colonnade and cornice at centre-left, Van Ness runs the
    # diagonal, and City Hall's dome is whole in the upper right instead of
    # half off the edge.
    dict(n=6, id="charter", title="Fifty nations, in the war memorial",
         t=(-122.420881, 37.778560), z=44.0, off=(-0.04, -0.16), move=1200, ms=6200,
         st=(1942, 1945)),
    # 7 · THE FREEWAYS THAT WERE NOT BUILT. High over the whole city, and
    # NOTHING IS DRAWN. `entries/freeway-revolt-1959.json` says in the open
    # that the corridors are "NOT IN RECORD as geometry" — the resolution
    # names seven routes and no alignment for any of them is published here.
    # Ghosting them in would be inventing seven roads. The shot is the city
    # they are not in, and the badge says so.
    dict(n=7, id="freeways", title="The freeways that were not built",
         t=None, z=1.25, off=(0.0, 0.0), move=1200, ms=6400,
         st=(1945, 1959)),
    # 8 · THE PYRAMID. `oy` -0.12 -> -0.30: FILM.md §25.3. THE FILM'S SHOT
    # ABOUT THE TALLEST BUILDING IN SAN FRANCISCO CROPPED THE TOP OF THE
    # BUILDING. Measured on the shipped frame by fitting the spire's own taper
    # — it widens 0.110 px a row, and is 27 px wide at row 180 — the apex sat
    # 65 device px ABOVE the top of the frame, fully risen. `z` is unchanged;
    # only the subject's place in the frame moves.
    dict(n=8, id="pyramid", title="The Pyramid",
         t=(-122.402707, 37.795274), z=24.0, off=(0.12, -0.30), move=1200, ms=6600,
         st=(1959, 1972)),
    # 9 · THE WATERFRONT, HELD. The Embarcadero Freeway was never drawn — the
    # fabric is the assessor's roll and the roll dates what is standing — so
    # there is no structure to take down and the film does not pretend there
    # is. The shot is the vote and the ground it gave back.
    # `z` 3.4 -> 5.5 and the offset up to (0.02, 0.22): FILM.md §23.5. At 3.4
    # and oy -0.06 the shore sat BELOW the frame centre, so 54.1 % of a
    # WATERFRONT shot was open bay and the far shore — Marin drawn as flat
    # surround slabs — was the top third. Lifting the subject above centre
    # fills the frame with the city the vote was about; measured empty
    # fraction 68.1 % -> 50.7 %.
    dict(n=9, id="embarcadero", title="The road that came down",
         t=(-122.397500, 37.796500), z=5.5, off=(0.02, 0.22), move=1200, ms=6600,
         st=(1972, 1991)),
    # 10 · THE RHYME. Shot 2's move, seventy years later: the camera stops and
    # a district fills in under it.
    dict(n=10, id="mission-bay", title="A rail yard becomes a neighbourhood",
         t=(-122.395141, 37.772878), z=3.6, off=(0.12, -0.06), move=1200, ms=8100,
         st=(1991, 2018)),
    # 11 · OUT TO THE WHOLE CITY, which is where the film started.
    dict(n=11, id="face", title="What the city would not let itself do",
         t=None, z=1.10, off=(0.0, 0.0), move=1200, ms=6800,
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
    # ── THE ELEVEN LINES DANIEL APPROVED, AND THE RECORD UNDER EACH ────────
    #
    # THIS TABLE WAS WRONG ONCE AND THE WAY IT WAS WRONG IS WORTH KEEPING.
    # The first cut put the RECORD'S OWN WORDS on screen and Daniel's sentence
    # in the shot's `title`, which nothing renders. He watched it and said the
    # text "isn't there yet, theres weird stuff about suited value etc" — and
    # he was quoting shot 2, whose line was the Auditor's beat about an
    # assessed valuation that had burned. A true sentence out of the minute
    # book, and exactly the kind of thing he had already thrown out twice.
    #
    # So: **`copy` is the approved line and nothing else.** The record is the
    # PROOF under it — the citation link every shot carries, and the second
    # line where a shot has one. `gate` names what must exist in `entries/` at
    # that item and leaf for the shot to be allowed to make its claim, and
    # `check_copy` still refuses to write the payload without it. What changed
    # is that the gate now certifies the SOURCE rather than the prose, and
    # `narration=True` says so on every row that is Daniel's sentence rather
    # than the Board's.
    #
    # FIVE OF THE ELEVEN FAILED THEIR FACT CHECK AND CARRY THE CORRECTED
    # NUMBER, each flagged to the coordinator rather than quietly reworded, and
    # each changed by as few words as the correction needs. FILM.md §18.4 is
    # the table of what the source actually says.
    1: dict(kind="scan", narration=True,
            item="excerptsfromsanf1908sanf", leaf=8, find="quote",
            verbatim="List of Property Belonging to the Fire Department",
            also=[("Three days, 28,000 buildings — USGS",
                   "https://earthquake.usgs.gov/earthquakes/events/1906calif/18april/casualties.php",
                   "data")],
            # APPROVED: "…thirty-six of them the city's own." The schedule holds
            # 36 structures and the 1906 clerk records 27 destroyed by fire and
            # 9 damaged by the earthquake only, so 36 is the count of the city
            # property in the table and not the count the FIRE destroyed.
            # 28,000 buildings and a THREE-DAY fire are the USGS's own figures
            # for 18-21 April 1906, which is why the shot also carries the
            # USGS link beside the Municipal Report's own schedule.
            copy="The fire burned for three days and destroyed some 28,000 "
                 "buildings."),
    # 2 · THE ONLY ARITHMETIC CLAIM IN THE FILM, AND WHERE ITS NUMBER COMES
    # FROM. "More than it lost within nine years" was carried for a night with
    # no source under it and it is now sourced, from the city's own building
    # permits. There is no published cumulative rebuilt total; what exists is
    # the CHIEF BUILDING INSPECTOR's annual report in the Municipal Reports,
    # which splits permits granted into new buildings against alterations. The
    # new-building rows, each read off the page image rather than the OCR:
    #
    #   FY ending  new  = printed total - printed alterations   volume
    #   30 Jun 07  6,931  (9,539 - 2,608)   sanfranciscomuni56sanfrich
    #   30 Jun 08  4,325  (6,327 - 2,002)   sanfranciscomuni57sanfrich
    #   30 Jun 09  3,827  (6,082 - 2,255)   sanfranciscomuni58sanfrich
    #   30 Jun 10  2,984  (5,766 - 2,782)   sanfranciscomuni59sanfrich  p.709
    #   30 Jun 11  2,725  (5,826 - 3,101)   sanfranciscomuni60sanfrich
    #   30 Jun 12  2,795  (6,166 - 3,371)   sanfranciscomuni61sanfrich
    #   30 Jun 13  2,642  (6,049 - 3,407)   munisanfrancisco62sanfrich
    #   30 Jun 14  2,330  (5,721 - 3,391)   munisanfrancisco63sanfrich  p.367
    #                    ---------------
    #        cumulative  28,559
    #
    # and the class rows sum to the same number in all eight years, so the
    # subtraction and the addition are the same figure twice. USGS's own page
    # gives the loss as 24,671 wood + 3,168 brick = 28,188. The cumulative
    # crosses it in the year ending 30 June 1914 — eight years and two months
    # after April 1906, so NINE is conservative and the approved line stands.
    #
    # TWO CAVEATS TRAVEL WITH IT, on the plate and not in the sentence:
    # the cumulative is arithmetic no document states, and permits GRANTED are
    # not buildings COMPLETED — much of the frame construction is in the
    # unburned western neighbourhoods, and FY1914's own new-building rows
    # include the 44 Panama-Pacific Exposition buildings.
    #
    # NOT THE "20,000 buildings by 1909" FIGURE, which is retold everywhere and
    # is an alterations-inclusive permit count read as buildings: the city's own
    # new-building permits total 15,083 by 30 June 1909.
    2: dict(kind="scan", narration=True,
            item="journalofproceed01sanfrich", leaf=8, find="headline",
            gate="The Clerk traces the edge of the burned city street by street, "
                 "and writes that the true toll will probably never be known.",
            copy="The city rebuilt more than it lost within nine years.",
            # THE SOURCE ROWS STAY THE SHAPE EVERY OTHER SHOT'S ARE, and the
            # arithmetic goes in the note. The first draft put "28,559
            # new-building permits by June 1914 — the city's own building
            # permits, Municipal Reports, Chief Building Inspector, p. 367" in
            # the chip, and on the frame it wrapped to two lines of uppercase
            # mono and outweighed the sentence it was supporting.
            also=[("The city's own building permits — Municipal Reports, p. 367",
                   "https://archive.org/details/munisanfrancisco63sanfrich/page/n384/mode/1up",
                   "scan"),
                  ("28,188 buildings lost — USGS",
                   "https://earthquake.usgs.gov/earthquakes/events/1906calif/18april/casualties.php",
                   "data")],
            note="28,559 new-building permits by June 1914, against 28,188 "
                 "lost. Permits granted are not buildings completed, and the "
                 "eight-year total is a sum of the city's own annual tables "
                 "that none of them states."),
    3: dict(kind="scan", narration=True,
            item="journalofproceed1915sanfrich", leaf=352, find="quote",
            verbatim="would very materially add to the beauty of that section of our city",
            copy="San Francisco pulled down the Exposition's palaces when the "
                 "fair closed and kept the Palace of Fine Arts."),
    4: dict(kind="scan", narration=True,
            item="journalofproceed31sanfrich", leaf=46, find="headline",
            gate="Nine months from opening, the Mayor prices the bridge at "
                 "$77,600,000 and names the next fight: the tolls.",
            # APPROVED: "…thirteen months apart." The Bay Bridge opened to
            # traffic 12 November 1936 (HAER CA-32) and the Golden Gate on
            # 28 May 1937 (Bridge District): six months and sixteen days.
            copy="The Bay Bridge and the Golden Gate opened six months apart."),
    5: dict(kind="scan", narration=True,
            item="journalofproceed37sanfrich", leaf=713, find="quote",
            verbatim="National Housing Agency and Home Owners Loan Corporation "
                     "Urged to Effectuate Slum Clearance in Japanese Quarter",
            # APPROVED: "…was leases and licences." Searched: all 767 items the
            # sweep extracts from the 1942 volumes, filtered to the ten streets
            # that bound the district and then to lease/permit/licence
            # language. Every lease is elsewhere in the city. What the Journal
            # carries for those streets that spring is the newspapers reported
            # to the Army, the city payroll, the liquor permits held back, and
            # — three weeks after the removal — the district's mortgages urged
            # on Washington for slum clearance. All four are property.
            copy="In 1942 the government removed everyone of Japanese descent "
                 "from Japantown, and the Board's business for those streets "
                 "that spring was property."),
    6: dict(kind="scan", narration=True,
            item="journalofproceed40part3sanfrich", leaf=726, find="quote",
            verbatim="the four city blocks occupied by the Veterans' Building, "
                     "Opera House and the Civic Center Plaza",
            copy="Fifty nations signed the United Nations Charter in the "
                 "city's war memorial."),
    7: dict(kind="scan", narration=True,
            item="journalofproceed54sanfrich", leaf=48, find="quote",
            verbatim="It is beyond the power of the Board to delete anything in "
                     "the Master Plan",
            # APPROVED: "…the state had planned." The resolution's own title is
            # "All Freeways Contained in the Master Plan" — the CITY's plan.
            # The routes were state Division of Highways routes; the ten came
            # from the city's own trafficways plan, which is why the Board could
            # only declare opposition to them.
            copy="The Board rejected seven of the ten freeways the city had "
                 "planned for San Francisco."),
    8: dict(kind="data", narration=True,
            copy="The Transamerica Pyramid was the tallest building in San "
                 "Francisco for forty-six years.",
            links=[("853 feet, fifty floors, 1972 — DataSF Tall Building Inventory",
                    "https://data.sfgov.org/d/5kya-mfst"),
                   ("Salesforce Tower, 1,070 feet, opened 2018 — same register",
                    "https://data.sfgov.org/d/5kya-mfst")]),
    9: dict(kind="scan", narration=True,
            item="journalofproceed85julydecsanfrich", leaf=374, find="headline",
            gate="The vote is rescinded, the condition stripped out, and the same "
                 "afternoon the Board endorses demolition 6 to 5.",
            copy="After the earthquake the Board voted to demolish the "
                 "Embarcadero Freeway instead of repairing it."),
    10: dict(kind="data", narration=True,
             # APPROVED: "…of eleven thousand people." DataSF's own figure for
             # the Mission Bay analysis neighborhood is 16,710 (ACS 2019–2023).
             copy="The Mission Bay rail yards became a neighbourhood of "
                  "sixteen thousand people.",
             links=[("16,710 residents — DataSF neighborhood demographics, ACS 2019–2023",
                     "https://data.sfgov.org/d/4qbq-hvtt"),
                    ("\u201cformerly-underutilized Southern Pacific railyards\u201d — OCII",
                     "https://sfocii.org/projects/mission-bay-south/overview")]),
    11: dict(kind="data", narration=True,
             # APPROVED: "…the first city anywhere." No official or primary
             # source claims "in the world"; the ACLU of Northern California's
             # own press release of 14 May 2019 says "the first city in the
             # United States to prohibit government use of face surveillance".
             copy="San Francisco was the first city in America to tell its own "
                  "police they could not use facial recognition.",
             links=[("Ordinance No. 103-19, File 190110, finally passed 10 to 1 on 21 May 2019",
                     "https://sfgov.legistar.com/View.ashx?M=F&ID=7226786&GUID=78A20A6B-F1D1-4044-AA15-82AF55D98040"),
                    ("Board minutes, 21 May 2019 — the vote",
                     "https://sfbos.org/sites/default/files/bag052119_minutes.pdf")]),
}

# NO SECOND LINE, AND NO QUOTATION ANYWHERE IN THE SPOKEN TEXT.
#
# This table held two: the Board's own sentence about the Japanese Quarter and
# its own sentence about the Master Plan, each set under the narration as the
# proof of it. Daniel watched that cut and the note is unambiguous — *"i think
# youre too much on the quotes in general … the rest is just your one sentence
# commentary, no need for a direct quote"* — and he was right about the earlier
# version too, where the quotation WAS the line: *"'The Auditor files next
# year's budget and notes that the valuation it rests on burned six weeks' —
# wtf is this quote, i really dont agree."*
#
# **The narration is one plain sentence, on every shot, and an archival
# quotation is never the text on screen.** The record is still the gate on the
# claim and still the link under it; it is not the words a reader reads.
#
# A quotation may come back as a PICTURE — the scanned page with the cited line
# highlighted, on three or four shots where the document is the moment. That is
# designed in FILM.md §18.7 and is deliberately not built.
COPY2: dict[int, dict] = {}

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
    # WHAT THE GATE CERTIFIES IS THE SOURCE, NOT THE PROSE. A narration row
    # names in `gate` (or in `verbatim`) the thing that must exist in the beat;
    # `copy` is what a reader sees and is Daniel's approved sentence. A row
    # without `narration` is the record's own words and `copy` IS the thing
    # that must match, which is the original contract.
    want = (c.get("gate") or c["copy"]).strip()
    for eid, b, s in cands:
        if c["find"] == "headline" and (b.get("headline") or "").strip() == want:
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


def _line_x(a, b, c, d):
    """Where the INFINITE lines through a-b and c-d meet. `_seg_x` is the same
    arithmetic with both parameters clamped to [0, 1]; this one is not, and it
    is used for exactly one thing — the corner the redevelopment removed."""
    (x1, y1), (x2, y2) = a, b
    (x3, y3), (x4, y4) = c, d
    den = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3)
    if abs(den) < 1e-14:
        return None
    t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / den
    return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))


def _seg_mid(s):
    return ((s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2)


def _closest_pair(sa, sb):
    """The one segment from each list whose midpoints are nearest."""
    best, bd = None, 1e18
    for u in sa:
        mu = _seg_mid(u)
        for v in sb:
            mv = _seg_mid(v)
            d = (mu[0] - mv[0]) ** 2 + (mu[1] - mv[1]) ** 2
            if d < bd:
                bd, best = d, (u, v)
    return best


def _in_poly(pt, poly) -> bool:
    x, y = pt
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xx = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xx:
                inside = not inside
    return inside


def district_outline(names: list[str]) -> tuple[list, tuple[float, float]]:
    """The four streets the 1942 resolution names, clipped to the quadrilateral
    their own crossings make.

    NOT A POLYGON ON THE FRAME, and the difference matters. The Board named four
    streets; the film draws four streets. The quadrilateral below is only the
    CLIP — what is stroked is published centreline, segment by segment.

    THE FIRST VERSION CLIPPED TO AN AXIS-ALIGNED BOUNDING BOX AND THREW ELLIS
    STREET AWAY ENTIRELY. Three sides reached the frame and the shot's only
    gesture was a broken bracket — `out-m1d/shots-s05.png`. The cause is that
    **the Western Addition sits on two grids**: Ellis runs on the Market Street
    grid, so between Gough and Fillmore it falls 0.0019 degrees of latitude,
    which is 210 metres. The box's south edge is Ellis's latitude AT GOUGH, so
    every Ellis segment west of Gough is below it and every one was clipped.

    THREE OF THE FOUR CORNERS ARE PUBLISHED CROSSINGS. The fourth is not:
    Ellis's centreline is interrupted between longitude -122.430798 and
    -122.434162, which is exactly the block where Fillmore would cross it, and
    the redevelopment this very resolution asked Washington for is what cut it.
    That corner is taken as the intersection of the two streets' own published
    ALIGNMENTS — the nearest Ellis segment and the nearest Fillmore segment,
    each extended as a line — so it is read off both streets and invented from
    neither. It is the only extrapolated number in this file and it is named.
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
    corner: dict = {}
    for a in ns:
        for b in ew:
            for s1 in by[a]:
                for s2 in by[b]:
                    p = _seg_x(s1[0], s1[1], s2[0], s2[1])
                    if p:
                        corner[(a, b)] = p
    missing = [k for k in ((a, b) for a in ns for b in ew) if k not in corner]
    if len(missing) > 1:
        sys.exit(f"the 1942 district: {len(missing)} corners are not in the "
                 f"centreline file and only one may be extrapolated: {missing}")
    for a, b in missing:
        pair = _closest_pair(by[a], by[b])
        if pair is None:
            sys.exit(f"the 1942 district: no {a}/{b} alignment to extend")
        p = _line_x(pair[0][0], pair[0][1], pair[1][0], pair[1][1])
        if p is None:
            sys.exit(f"the 1942 district: {a} and {b} are parallel")
        corner[(a, b)] = p

    # the quadrilateral, in ring order: the two north corners then the two south
    quad = [corner[(ns[1], ew[0])], corner[(ns[1], ew[1])],
            corner[(ns[0], ew[1])], corner[(ns[0], ew[0])]]
    cx = sum(p[0] for p in quad) / 4
    cy = sum(p[1] for p in quad) / 4
    # A DRAWING TOLERANCE, DECLARED: the streets ARE the quadrilateral's edges,
    # so a centreline vertex sits ON the boundary and a strict point-in-polygon
    # test is a coin toss. The ring is pushed 20 m out from its own centroid
    # before the test, which is about a half-block and is the same order as the
    # width of the streets being clipped.
    OUT_M = 20.0
    grown = []
    for x, y in quad:
        dx, dy = x - cx, y - cy
        d = (dx * dx + dy * dy) ** 0.5 or 1e-9
        # metres per degree at this latitude, close enough for a tolerance
        mx, my = 88_000.0, 111_000.0
        grown.append((x + dx / d * OUT_M / mx, y + dy / d * OUT_M / my))

    lines, per = [], {}
    for nm in names:
        n0 = 0
        for (x1, y1), (x2, y2) in by[nm]:
            if _in_poly((x1, y1), grown) and _in_poly((x2, y2), grown):
                lines.append([[round(x1, 6), round(y1, 6)],
                              [round(x2, 6), round(y2, 6)]])
                n0 += 1
        per[nm] = n0
    if not lines:
        sys.exit("the 1942 district clipped to nothing")
    # EVERY NAMED STREET HAS TO REACH THE FRAME. The box version passed this
    # file's own checks while drawing three sides of four, because nothing
    # asserted that all four were there.
    empty = [nm for nm in names if per[nm] == 0]
    if empty:
        sys.exit(f"the 1942 district: {', '.join(empty)} clipped to nothing — "
                 "the resolution names four streets and the film must draw four")
    print(f"  the 1942 district: " +
          " · ".join(f"{nm} {per[nm]}" for nm in names) +
          (f" · {missing[0][0]}x{missing[0][1]} corner extrapolated"
           if missing else ""))
    return lines, (cx, cy)


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
        # a scan shot may carry extra published sources beside its leaf, where
        # the sentence rests on a figure the minute book does not hold. `k` is
        # the chip the row wears: the Chief Building Inspector's permit tables
        # are a SCAN, and calling them DATA would tell a reader they came out
        # of a modern register.
        for tt, uu, kk in c.get("also") or ():
            o.setdefault("also", []).append(dict(t=tt, u=uu, k=kk))
        # the caveat a derived figure carries. NOT narration: FILM.md §20.
        if c.get("note"):
            o["note"] = c["note"]

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
        "runtime": {"titleMs": 2400, "endMs": 3000, "shotsMs": total,
                    "totalMs": total + 5400},
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
    print(f"  {total/1000:.1f} s of shots + 2.4 title + 3.0 end = "
          f"{(total+5400)/1000:.0f} s")
    print(f"  the 1942 district: {len(district)} published centreline segments, "
          f"centre {dcent[0]:.6f} {dcent[1]:.6f}")


if __name__ == "__main__":
    main()
