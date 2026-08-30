"""The threads — what the record keeps coming back to, across the whole city.

A fiche that is a dead end is boring however well it is written. A fiche that
hands the reader a thread — horses, laundries, blasting, libraries — is a place
they keep moving through. This script emits the file those threads are read
from:

    website/public/data/us/sf/city/blocks/threads.json

Nothing here is a classifier and nothing is generated. A thread is a PATTERN
over the line the volume printed, every pattern is anchored on words the record
itself uses, and the build prints a sample of every thread so a wrong pattern is
visible rather than silent.

TWO THINGS MEASURED BEFORE THIS FILE EXISTED, both of which shaped it:

1. **The Board printed its own subject headings — and stopped around 1932.**
   `Stable Permit —`, `Masquerade Ball Permit —`, `Street Lights —`. Those are
   exact and they are lovely, but they cover 12.9 % of records and NOTHING after
   1932, so they cannot be the only engine. The patterns below carry the modern
   half, and the seam is at 1932 rather than hidden.

2. **San Francisco street names collide with subject words.** A first pass put
   *War and the military* at 450 records and *Churches* at 467. Most of both
   were **Army Street** and **Church Street**. With `NOT_A_STREET` they fall to
   165 and 269 — 63 % and 42 % of those hits were the city naming a road. Any
   pattern built on a common word carries the guard, and Market, Post, Bush,
   Mission, Presidio, Grant and Ocean are all the same hazard.

Run:
    python3 pipeline/scripts/us_sf_city/build_threads.py            # build
    python3 pipeline/scripts/us_sf_city/build_threads.py --samples  # + read them
"""
from __future__ import annotations

import collections
import glob
import json
import os
import re
import sys
import unicodedata

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
BLOCKS = os.path.join(ROOT, "website/public/data/us/sf/city/blocks")
OUT = os.path.join(BLOCKS, "threads.json")
IDS = os.path.join(ROOT, "website/public/data/us/sf/city/base/blocks-id.json")

# ── the guard ───────────────────────────────────────────────────────────────
# A subject word is not a subject when the record is naming a street after it.
#
# The first version of this guard only caught the singular, adjacent form —
# "Church street". Reading Castro/Upper Market whole showed what it misses: the
# Board almost never names one street at a time. It writes "Church and Sixteenth
# streets", "Church to Castro streets", "Dolores and Church streets" — and in
# every one of those the type word is plural and sits after the OTHER name. 75
# of the 79 "church" hits in that one neighbourhood were Church Street, which
# would have made a paragraph about churches out of a paragraph about a street.
# So the guard now allows one intervening "and/to <Name>" and accepts the plural.
_ST_TYPE = (
    r"(?:st(?:reet)?|ave(?:nue)?|blvd|boulevard|road|rd|way|drive|dr"
    r"|place|pl|court|ct|alley|lane|terrace|plaza|highway|hwy)s?\b"
)
NOT_A_STREET = (
    r"(?![\s,]+(?:(?:and|to|&|or)[\s,]+[A-Za-z][\w'’.-]*[\s,]+)?" + _ST_TYPE + r")"
)
_NS = NOT_A_STREET

# ── the vocabulary ──────────────────────────────────────────────────────────
# `era` groups the threads the way the record itself groups them: everything in
# `old` is dead within a year or two of 1931, `mid` belongs to the car and the
# freeway, `now` starts with CEQA in the 1970s and is still running. Measured,
# not asserted — every span is printed by the build.
THREADS: list[tuple[str, str, str, str]] = [
    # label, era, pattern, one plain line saying what the thread is
    ("Keeping horses and cows", "old",
     r"\bstable permit|for (?:one|two|three|four|five|six|\d+) horses?\b|\bveterinary\b|for (?:two|\d+) cows\b",
     "Until about 1930 the Board voted on whether you could keep animals at your address."),
    # NOT "Blasting the hills flat", which is a sentence I wrote and not one
    # the record supports. Every match is one permit: "granted permission,
    # revocable at will of the Board of Supervisors, to explode blasts on
    # Wisconsin street", ninety days, 7 a.m. to 6 p.m. Of the 444 whose
    # location phrase parses, 276 name a street, ~90 name private property or a
    # lot corner, 6 are tunnel work — lot-by-lot excavation, not a programme of
    # levelling hills. The title asserted a city-scale project out of a stack of
    # construction permits.
    ("Blasting permits", "old",
     r"\bexplode blasts\b|\bblast(?:s|ing)?\b(?=[^.]{0,80}\b(?:permit|permission|grading|granted)\b)",
     "Permission to set off explosives at a named place — street cuts, "
     "foundations, tunnels — revocable and usually time-limited."),
    ("Oil tanks and boilers", "old",
     r"\boil (?:tank|permit|and boiler)|boiler permit|storage tank of not more than",
     "Fuel-oil tanks and boilers, each one licensed by name and capacity."),
    ("Laundries", "old",
     r"\blaundry permit|\ba laundry\b|\blaundries\b",
     "Laundries needed the Board's permission, and their neighbours sometimes objected."),
    ("Dance halls and masquerades", "old",
     r"\bmasquerade ball|\bdance hall|\bcabaret\b",
     "Permits for balls and dances, named by the club holding them and the hall they hired."),
    ("Taxis and garages", "old",
     r"\btaxicab\b|\bpublic garage\b|\bjitney\b",
     "Taxicab stands and public garages, as the car arrived in the city."),
    # `Railroad Avenue` is the old name for Third Street through Bayview, so
    # the bare word counted the street 100-odd times and made rail the
    # neighbourhood's largest subject. Same trap as Army Street and Church
    # Street; the guard goes on the bare word only.
    ("Railroads and spur tracks", "old",
     r"\brailroad\b" + _NS + r"|railway company|southern pacific|\bspur track\b|union pacific",
     "Rail lines run into factories and yards — the industrial city, mostly gone by 1930."),
    ("Streetcars and transit", "old",
     r"\bstreet ?car\b|municipal railway\b|rapid transit\b|\bmuni\b|\bbus line",
     "Streetcar lines built, extended and pulled up again."),
    ("Cemeteries and funerals", "old",
     r"\bcemeter|\bburial\b|\bmortuary\b|\bcrematory\b|\bundertak",
     "Burial and the trades around it, at their heaviest as the city closed its cemeteries."),

    # ── the ground ──────────────────────────────────────────────────────────
    ("Paving and grading", "old",
     r"\bpaving\b|\brepav|grading to official|changing (?:and re-?establishing )?(?:the )?official grades?",
     "Cutting streets to their official level and surfacing them."),
    ("Sewers", "old",
     r"\bsewer\b|\bcesspool\b|storm drain",
     "Sewers laid, broken, replaced — and occasionally sinking with the ground."),
    # "arc lamp" and "gas lamp" are what the Board called a street light before
    # about 1920, and they were going uncounted — Seacliff's whole early
    # lighting record sat outside this pattern. "M. R." is the clerk's
    # shorthand for the lamp size, and it is removed as often as installed.
    ("Street lights", "old",
     r"\bstreet lights?\b|(?:install|remove|change)\w*\s+\d+\s*M\.\s?R\.|\belectrolier"
     r"|\barc lamps?\b|\bgas lamps?\b|\btriple top lamp\b|\bstreet lamp\b",
     "Lighting a street, block by block."),
    ("Wires put underground", "mid",
     r"underground district",
     "Districts where overhead wires had to come down."),

    # ── mid-century ─────────────────────────────────────────────────────────
    ("Freeways", "mid",
     r"\bfreeway\b|highway 280|\bU\.? ?S\.? 101\b|james lick|bayshore freeway",
     "The freeways, from the land bought for them to the fights about them."),
    ("Streets closed for good", "mid",
     r"\bvacat(?:e|ion|ing) of (?:portions? of )?[A-Z]|ordering the vacation",
     "Streets the city stopped being a street — vacated for a building or a park."),
    ("Streets closed for a day", "mid",
     r"temporary closing of|requesting temporary closing",
     "Parades, street fairs, block parties, ground-breakings, festivals."),
    ("Street name changes", "mid",
     r"changing the name of|\brenaming\b(?=[^.]{0,60}\b(?:street|avenue)\b)",
     "When a street was given a different name."),
    ("Parking", "mid",
     r"\bparking\b|\btow-?away\b",
     "Where you could leave a car, and where you could not."),

    # ── what the city built and kept ────────────────────────────────────────
    ("Libraries", "old",
     r"\bbranch library\b|library and reading room|\bpublic library\b",
     "Branch libraries — several of them shops the city rented one year at a time."),
    # The narrow form (school site/building/purposes/annex) was written to keep
    # every street named after a school out of the count, and it kept out the
    # most important records too: "Ordering the construction of the Jefferson
    # School", "Ordering Construction of Annex to Parkside School". The added
    # forms all require a build or purchase word next to the school, so a street
    # that merely runs past one still does not count.
    ("Schools", "old",
     r"\bschool (?:site|building|purposes|annex|lot)\b|\bgrammar school\b|school district"
     r"|\bconstruction of (?:the |an? )?[^.]{0,40}\bschool\b"
     r"|\bannex to (?:the )?[^.]{0,30}\bschool\b"
     r"|\bschool\b[^.]{0,40}\bto be (?:erected|constructed)\b",
     "School sites bought, built and repaired."),
    ("Parks and playgrounds", "old",
     r"\bplayground\b|\brecreation center\b|\bmini-?park\b",
     "Playgrounds and recreation grounds."),
    ("Fire stations", "old",
     r"\bfire (?:house|station|department)\b|\bengine house\b",
     "Engine houses and fire stations."),
    ("Police stations", "mid",
     r"\bpolice (?:station|department)\b|\bSFPD\b",
     "Police stations and the sites bought for them."),
    ("Clinics and hospitals", "old",
     r"\bclinic\b|\bhospital\b|\bhealth center\b",
     "Clinics, health centres and hospitals."),
    ("Churches", "old",
     r"\bchurch(?:es)?\b" + _NS + r"|\bsynagogue\b|(?<!labor )\btemple\b" + _NS
     + r"|\bcongregation\b|\bparish\b",
     "Congregations, and the buildings they asked the city about."),
    ("Theatres and shows", "old",
     r"\btheat(?:re|er)\b|motion picture|\bcinema\b|\bamusement\b|\bcircus\b|\bconcert\b",
     "Theatres, cinemas and travelling shows."),
    ("War and the military", "old",
     r"war (?:housing|services|emergency|memorial)|\bnaval\b|\barmy\b" + _NS
     + r"|\bpresidio\b" + _NS + r"|\bveterans?\b" + _NS,
     "The military in the city, and what the wars did to it."),
    ("Landmarks", "now",
     r"landmark designation|\blandmark\b(?=[^.]{0,80}\b(?:designat|article 10|planning code)\b)",
     "Buildings the city decided to keep."),

    # ── money and property ──────────────────────────────────────────────────
    ("Buildings the city rents", "now",
     r"lease of real property|real property lease|authorizing (?:a |the )?(?:new )?lease of",
     "Space the city leases from private owners, with the rent on the record."),
    ("Land bought and sold", "old",
     r"acquisition of real property|purchase of real property|sell at public auction|\beminent domain\b|convey to the city",
     "Land changing hands with the city on one side of it."),
    ("Housing bonds", "now",
     r"multifamily housing revenue|\baffordable housing\b|housing revenue (?:bond|note)",
     "How affordable housing is paid for, in the years since the 1980s."),
    ("Shelters and homelessness", "now",
     r"\bhomeless\b|supportive housing|\bshelter\b(?=[^.]{0,60}\b(?:bed|homeless|temporary)\b)",
     "Shelters and supportive housing — and where the city put them."),
    ("Hotels and rooming houses", "old",
     r"rooming house|lodging house|residential hotel|single room occupancy|\bSRO\b|\bhotel\b",
     "Hotels and rooming houses, concentrated in a handful of neighbourhoods."),
    ("PG&E and the utilities", "old",
     r"pacific gas and electric|\bPG ?& ?E\b|spring valley water|public utilities commission|\bgas company\b",
     "The gas, electric and water companies, and the city's dealings with them."),

    # ── argument ────────────────────────────────────────────────────────────
    ("Permission to open something", "now",
     r"\bconditional use\b",
     "A shop, a clinic, a wrecking yard, a dispensary: uses that needed asking for."),
    ("The rules for this street changed", "now",
     r"\brezon(?:e|ing)\b|reclassification of property|amending the zoning map|\buse district\b|special use district|height and bulk",
     "Rezonings, height limits, and rules written for one block."),
    # NOT "When neighbours objected". The pattern cannot see WHO objected, and
    # measured on the tokens it actually matches — protest 553, hearing of
    # appeal 491, disapproving decision 380, objecting to the decision 182,
    # objecting to the determination 83, variance 35 — most of it is the
    # Board's own hearing machinery, and a large share is an APPLICANT
    # appealing a refusal, which is the opposite of a neighbour objecting.
    # `variance` is an application for an exception and is not an objection at
    # all; it is 2% of matches and left in because these records are almost
    # always the appeal against the variance decision, but the title must not
    # depend on that.
    ("Protests and appeals", "old",
     r"\bprotest\b|hearing of appeal|\bremonstrance\b|objecting to the (?:determination|decision)|\bvariance\b|disapproving decision",
     "A protest recorded at a hearing, or an appeal against a decision — "
     "brought by neighbours and by applicants alike."),
    ("Environmental review", "now",
     r"environmental quality act|\bCEQA\b|negative declaration|environmental review|environmental impact report|\bEIR\b|categorically exempt",
     "Nothing before the 1970s, then permanent: the review law arriving and staying."),
    # NOT "New buildings", which is what this was called and is not what it
    # finds. Every match is a final map, a subdivision or a condominium
    # project: land or a building being divided into separately owned pieces.
    # Most of them are conversions of buildings that were already standing.
    ("Land and buildings split up", "now",
     r"\bfinal map\b|\bsubdivision\b|\bcondominium project\b",
     "A lot split in two, or a building divided into flats that sell separately."),
    ("Sidewalk permits", "now",
     r"\bencroachment\b|occupy a portion of (?:the )?sidewalk|\bparklet\b|shared space",
     "Steps, planters, ramps and parklets standing on public sidewalk."),
    ("Liquor licences", "now",
     r"\bliquor licen[cs]e|on-sale|off-sale|\bsaloon\b|alcoholic beverage",
     "Bars, shops and restaurants — the licence following the address as it changes hands."),
]

# ── how big a thread has to be ──────────────────────────────────────────────
# MEASURED against the map: 5,404 blocks. A filter that lights 30 of them reads
# as broken rather than as rare, so a thread carries the map only above
# MAP_BLOCKS. Everything above PAGE_RECORDS still gets a page and a chip — the
# small ones (libraries, cemeteries, street name changes) are some of the best
# reading in the corpus and the point is not to hide them, it is not to promise
# a map filter they cannot fill.
MAP_BLOCKS = 150
PAGE_RECORDS = 25

DEC = [1900 + 10 * i for i in range(13)]


def slug(label: str) -> str:
    s = unicodedata.normalize("NFKD", label).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s


def load_hoodmap() -> dict[str, int]:
    """block id → the map's own neighbourhood index, read from the map's file."""
    ids = json.load(open(IDS))
    names = ids.get("hoodNames") or []
    # `blocks-id.json` publishes the id order and the name table; the per-block
    # hood byte lives in the binary blocks chunk, so when it is not readable
    # here the hood columns are simply absent rather than guessed.
    return {}, names


def _subjects():
    """The same list, with the bit each subject occupies in the shipped mask.

    THE PATTERNS ARE NO LONGER RUN OVER THE SHARDS HERE. Every row now carries
    `sm`, a bitmask over exactly this list, computed in `build_index.py`
    against the RECORD instead of the printed line. Re-matching the line would
    reproduce the old, smaller answer beside the new one and the two would
    disagree in public — the line reaches 35% of records, the record 51%.
    """
    import importlib.util
    p = os.path.join(ROOT, "pipeline/scripts/us_sf_city/blocks/themes.py")
    spec = importlib.util.spec_from_file_location("_th", p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m, m.load_subjects()


def main() -> int:
    show_samples = "--samples" in sys.argv
    TH, SUBJECTS = _subjects()
    bit_of = {s["label"]: s["bit"] for s in SUBJECTS}
    missing = [lbl for lbl, _e, _p, _n in THREADS if lbl not in bit_of]
    if missing:
        sys.exit(f"REFUSED: {len(missing)} thread(s) have no bit: {missing[:3]}. "
                 f"themes.load_subjects() and THREADS have diverged, and every "
                 f"mask already published is positional.")
    compiled = [(lbl, era, re.compile(pat, re.I), note)
                for lbl, era, pat, note in THREADS]

    seen: set[tuple[str, str]] = set()
    agg = {lbl: {"n": 0, "blocks": set(), "dec": collections.Counter(),
                 "y0": 9999, "y1": 0, "ex": []}
           for lbl, _, _, _ in THREADS}
    total = 0
    tagged: set[tuple[str, str]] = set()

    shards = sorted(glob.glob(os.path.join(BLOCKS, "block-*.json")))
    if not shards:
        print(f"no shards under {BLOCKS}", file=sys.stderr)
        return 1

    for fn in shards:
        for bid, rec in json.load(open(fn)).items():
            if not isinstance(rec, dict):
                continue
            for r in rec.get("d", []):
                if not isinstance(r, dict):
                    continue
                t = (r.get("t") or "").strip()
                if not t:
                    continue
                # A record placed at a corner is stored on EVERY block that
                # corner touches, so counting rows would inflate every thread
                # several-fold. The identity is the page plus the line.
                key = (r.get("u") or "", t[:120])
                first = key not in seen
                seen.add(key)
                if first:
                    total += 1
                sm = r.get("sm") or 0
                for lbl, _era, rx, _note in compiled:
                    if not (sm >> bit_of[lbl] & 1):
                        continue
                    a = agg[lbl]
                    a["blocks"].add(bid)          # every block it touches
                    if first:
                        tagged.add(key)
                        a["n"] += 1
                        a["dec"][(r["y"] // 10) * 10] += 1
                        a["y0"] = min(a["y0"], r["y"])
                        a["y1"] = max(a["y1"], r["y"])
                        if len(a["ex"]) < 40 and 60 < len(t) < 260:
                            a["ex"].append({"y": r["y"], "t": t,
                                            "u": r.get("u"), "b": bid})

    out = []
    for lbl, era, rx, note in compiled:
        _rx = rx.pattern
        a = agg[lbl]
        if a["n"] < PAGE_RECORDS:
            print(f"  dropped (only {a['n']} records): {lbl}")
            continue
        # spread the examples across the decades rather than taking the first
        # forty, which would all come from whichever shard sorted first
        by_dec: dict[int, list] = collections.defaultdict(list)
        for e in a["ex"]:
            by_dec[(e["y"] // 10) * 10].append(e)
        ex = []
        for d in sorted(by_dec):
            ex.extend(by_dec[d][:2])
        out.append({
            "s": slug(lbl),
            "l": lbl,
            # WHICH BIT OF `sm` THIS IS. The browser reads the mask on the row
            # instead of running `p` against the line, which is the whole of
            # the 35% -> 51% move: the mask was computed against the record.
            "bit": bit_of[lbl],
            # THE PATTERN SHIPS. The browser holds the records of whatever the
            # reader is looking at — a street, a building, a neighbourhood —
            # and can only say "this thread is here, N times" if it can run the
            # same match the build ran. Python and JavaScript agree on all of
            # these: word boundaries, character classes and negative lookahead.
            "p": _rx,
            "era": era,
            "note": note,
            "n": a["n"],
            "y0": a["y0"],
            "y1": a["y1"],
            "dec": [[d, a["dec"].get(d, 0)] for d in DEC],
            "b": sorted(a["blocks"]),
            "map": len(a["blocks"]) >= MAP_BLOCKS,
            "ex": ex[:14],
        })

    out.sort(key=lambda x: -len(x["b"]))
    payload = {
        "generated_by": "pipeline/scripts/us_sf_city/build_threads.py",
        # THE BROWSER MUST NOT RUN `p` WHILE THIS IS TRUE. Every shard row
        # carries `sm`; matching the printed line again would silently answer
        # the smaller question — 35% of records instead of 51%.
        "tagged_in_pipeline": True,
        "tagged_against": "the item's own source text, not the published line",
        "n_records": total,
        "n_tagged": len(tagged),
        "n_threads": len(out),
        "map_blocks_min": MAP_BLOCKS,
        "page_records_min": PAGE_RECORDS,
        "THREADS_ARE_PATTERNS_NOT_A_CLASSIFIER":
            "Each thread is a regular expression over the line the volume "
            "printed. A record may belong to several threads, which is correct. "
            "Nothing here is generated and no record is summarised.",
        "COVERAGE_IS_PARTIAL":
            f"{len(tagged):,} of {total:,} records ({len(tagged)*100//total}%) "
            "land in a thread. The rest are warrants, assessments, "
            "confirmations and payment schedules. A thread is never a view of "
            "the whole record and the panel may not imply that it is.",
        "threads": out,
    }
    with open(OUT, "w") as f:
        json.dump(payload, f, separators=(",", ":"))

    kb = os.path.getsize(OUT) / 1024
    print(f"\n{total:,} distinct records · {len(tagged):,} tagged "
          f"({len(tagged)*100/total:.0f}%) · {len(out)} threads · {kb:.0f} KB")
    print(f"\n{'recs':>5} {'blocks':>6} {'span':>11}  map  thread")
    for th in out:
        print(f"{th['n']:5d} {len(th['b']):6d} {th['y0']:>4}–{th['y1']:<5} "
              f"{'yes' if th['map'] else ' - ':>4}  {th['l']}")

    if show_samples:
        for th in out:
            print(f"\n{'='*74}\n{th['l']} — {th['n']} records, {len(th['b'])} blocks")
            print(f"  {th['note']}")
            for e in th["ex"][:5]:
                print(f"  {e['y']}  {e['t'][:150]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
