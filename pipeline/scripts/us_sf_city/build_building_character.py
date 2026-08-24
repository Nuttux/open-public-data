"""Per-building CHARACTER from the assessor's own building class -> char/char-data.js.

WHY THIS FILE EXISTS
--------------------
Every one of the 166,166 drawn buildings currently gets its look from four
published columns, and the tables that read them live in
`website/src/components/us/city/palette.ts`:

    UMAT_WALL[use][yearBand*3 + storeyBand]      105 cells for the whole city
    UMAT_ROOF[use][heightBand*2 + era]            56 cells

`use` there is `wv5m-vpq2.use_definition` collapsed to SEVEN classes by
`bldg/build_bldg.py`. Seven classes is why a Victorian on Alamo Square and a
warehouse in the Dogpatch differ only in outline, height and which of sixteen
flat colours the table picked.

The SAME ROLL ROW, on the SAME join key, already publishes a much finer
column that this project has never fetched: `property_class_code`, 145 defined
values, and the definitions are themselves published as a DataSF reference
dataset (`pa56-ek2h`, "Reference: Assessor-Recorder Property Class Codes").
That column is the only source examined (see pipeline/docs/sf_building_
character.md for the audit and the numbers) that names, per parcel, that a
building HAS A SHOP ON THE GROUND FLOOR, that it is a CHURCH, a THEATRE, a
WAREHOUSE, a GAS STATION, a HOTEL. Those are silhouettes, not colours.

WHAT THIS SCRIPT DOES AND DOES NOT CLAIM
----------------------------------------
MEASURED   `property_class_code` on the 2025 secured roll, joined footprint ->
           parcel by `bldg/pnjoin.resolve_pn` — the same key `build_bldg.py`
           uses, not a lookalike.
DECLARED   the map from the 145 published class codes to ELEVEN archetypes
           below. That map is an EDITORIAL GROUPING of published values, in
           the same way `USE_MAP` in build_bldg.py is, and it is written out
           whole so it can be read and argued with. Every code's target is
           justified by that code's OWN published `class_definition`.
NOT CLAIMED  a style, a period, a material, or an ornament. This file says
           "the assessor calls this parcel a Flat & Store"; it does not say
           the storefront is Italianate, and the renderer must not either.
HONEST FALLBACK  a footprint whose parcel carries no class code, or carries a
           class that is not a building at all (a vacant lot, an under-water
           lot, a TDR parcel), gets archetype 0 `unknown` and a flag byte
           saying WHY. Archetype 0 must render exactly as the city renders
           today. Nothing is guessed and nothing is randomised.

INDEX ALIGNMENT — THE THING THAT COULD SILENTLY GO WRONG
--------------------------------------------------------
`gen/bldg-data.js` carries no parcel key: `build_bldg.py` drops `pn` before it
emits. So a per-building attribute can only be attached BY INDEX, and the index
is a Hilbert sort over a filtered set. `form/reindex.py` (Block C) already
reproduces that order and carries the identity columns, and it PROVES the
reproduction rather than assuming it: it re-derives the quantised height byte
for every record and asserts it equals the shipped `BLDG.h` stream element for
element. This script reuses `reindex.build()` and re-runs that same assertion
before it writes anything. If alignment ever breaks, this file raises and
writes nothing — it does not emit a misaligned array.

The `gid` field the encoder already publishes per building
(`encode_city_chunks.py`, `kinds.bldg.fields`) is exactly this index, so the
renderer can look a building's archetype up with one array read.

RUN
    python3 pipeline/scripts/us_sf_city/build_building_character.py           # fetch if needed, build, report
    python3 pipeline/scripts/us_sf_city/build_building_character.py --report  # report only, write nothing

OUT `scratchpad/sf-city-anim/char/char-data.js`, one `window.CHAR = {...}`
    assignment in the same shape as every other mock payload, so
    `pipeline/scripts/us_sf_city/_srcload.load("char/char-data.js", "CHAR")`
    reads it with no new machinery.
"""
from __future__ import annotations

import argparse
import base64
import collections
import json
import os
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
MOCK = os.path.join(ROOT, "scratchpad", "sf-city-anim")
OUTDIR = os.path.join(MOCK, "char")
CACHE = os.path.join(OUTDIR, "cache")

# reindex.py reproduces bldg/build_bldg.py's record order and proves it.
sys.path.insert(0, os.path.join(MOCK, "form"))
sys.path.insert(0, os.path.join(MOCK, "bldg"))

ROLL_DS = "wv5m-vpq2"   # Assessor Historical Secured Property Tax Rolls (PDDL 1.0)
REF_DS = "pa56-ek2h"    # Reference: Assessor-Recorder Property Class Codes
ROLL_YEAR = 2025
PAGE = 25000

# ── THE ARCHETYPES ────────────────────────────────────────────────────────
# Eleven, plus the honest unknown. The test each one had to pass is "does this
# resolve to a silhouette a viewer can tell apart at block zoom" — not "is it a
# different word". `docs/sf_building_character.md` §8 states what each is
# expected to look like; this file only assigns them.
ARCH = [
    "unknown",           # 0  no published class, or a class that is not a building
    "house",             # 1  one dwelling on the parcel
    "flats",             # 2  flats / duplex, no shop
    "flat_over_store",   # 3  dwelling(s) over a ground-floor shop
    "apartment",         # 4  purpose-built apartment block
    "condo",             # 5  condominium / live-work, unit-titled
    "storefront",        # 6  commercial store, bank, department store, centre
    "office",            # 7  office building
    "industrial",        # 8  industry, warehouse, garage, gas station
    "hotel",             # 9  hotel, motel, residential hotel / SRO
    "institution",       # 10 church, school, hospital, library, civic, theatre
]
A_UNKNOWN, A_HOUSE, A_FLATS, A_FLATSTORE, A_APT, A_CONDO = 0, 1, 2, 3, 4, 5
A_STORE, A_OFFICE, A_IND, A_HOTEL, A_INST = 6, 7, 8, 9, 10

# ── class code -> archetype ───────────────────────────────────────────────
# Keys are the published `class_code` values of pa56-ek2h. The comment on each
# line is that code's OWN published `class_definition`, verbatim, so the
# grouping can be checked against the source without leaving this file.
CLASS_ARCH: dict[str, int] = {
    # one dwelling
    "D": A_HOUSE,       # Dwelling
    "DBM": A_HOUSE,     # Dwelling BMR
    "TH": A_HOUSE,      # Town House
    "THBM": A_HOUSE,    # Town House BMR
    "PD": A_HOUSE,      # PUD (Planned Unit Development)
    "XV": A_HOUSE,      # Single Struct on Multi Lot (D & F's only)
    # flats and duplexes — the SF two- and three-flat, no shop
    "F": A_FLATS,       # Flats & Duplex
    "F5": A_FLATS,      # Flats 5 to 14 units
    "F15": A_FLATS,     # Flats 15 units +
    "DD": A_FLATS,      # 2 Dwellings on 1 Parcel 4 units or less
    "DD5": A_FLATS,     # 2 Dwellings on 1 Parcel 5 to 14 units
    "DD15": A_FLATS,    # 2 Dwellings on 1 Parcel 15 units +
    "DF": A_FLATS,      # 1 Flat & Dwelling - 1 Parcel
    "DA": A_FLATS,      # Dwellings - Apt 4 units or less
    "DA5": A_FLATS,     # Dwellings - Apt 5 to 14 units
    "DA15": A_FLATS,    # Dwellings - Apt 15 units or more
    "DCON": A_FLATS,    # Legal Multi-Family Con to SFR
    "FA": A_FLATS,      # 1 Flat & 1 Apt Bldg - 1 Parcel
    "FA5": A_FLATS,     # 1 Flat & 1 Apt - 1 Parcel 5 to 14 units
    "FA15": A_FLATS,    # 1 Flat & 1 Apt - 1 Parcel 15 units +
    "TIC": A_FLATS,     # TIC Bldg 4 units or less
    "TIC5": A_FLATS,    # TIC Bldg 5 to 14 units
    "TI15": A_FLATS,    # TIC Bldg 15 units +
    "TIF": A_FLATS,     # TI Flats & Duplex
    # SHOP AT GRADE — the whole reason this column is worth fetching
    "FS": A_FLATSTORE,   # Flat & Store 4 units or less
    "FS5": A_FLATSTORE,  # Flat & Store 5 to 14 units
    "FS15": A_FLATSTORE, # Flat & Store 15 units +
    "F2": A_FLATSTORE,   # Flat & Store
    "AC": A_FLATSTORE,   # Apartment & Commercial Store
    "ACG": A_FLATSTORE,  # Apartment Gov Comm Store
    "CM": A_FLATSTORE,   # Commercial/Mixed use
    "MIX": A_FLATSTORE,  # Mixed use
    "RH1": A_FLATSTORE,  # Retail & Hotel
    "HC": A_FLATSTORE,   # Hotel Commercial (H2 w/Com)
    "OA": A_FLATSTORE,   # Office and Apartments 4 units or less
    "OA5": A_FLATSTORE,  # Office and Apartments 5 to 14 units
    "OA15": A_FLATSTORE, # Office and Apartments 15 units +
    # purpose-built apartment
    "A": A_APT,         # Apartment 4 units or less
    "A5": A_APT,        # Apartment 5 to 14 Units
    "A15": A_APT,       # Apartment 15 Units or more
    "AG": A_APT,        # Apartment Gov 4 units or less
    "A5G": A_APT,       # Apartment Gov 5 to 14 units
    "A15G": A_APT,      # Apartment Gov 15 units or more
    "TIA": A_APT,       # TI Apartment
    "CO": A_APT,        # Coop Units Unsegregated
    "COS": A_APT,       # Coop Units Segregated
    # unit-titled — overwhelmingly post-1960 construction
    "Z": A_CONDO,       # Condominium
    "ZBM": A_CONDO,     # Condominium BMR
    "ZEU": A_CONDO,     # Condominium Economic Unit
    "LZ": A_CONDO,      # Live/Work Condominium
    "LZBM": A_CONDO,    # Live/Work Condominium BMR
    # shops
    "C": A_STORE,       # Commercial Stores
    "CG": A_STORE,      # Commercial Stores Gov
    "CZ": A_STORE,      # Commercial Store Condo
    "CZEU": A_STORE,    # Commercial Store Condo Economic Unit
    "CD": A_STORE,      # Commercial Department Stores
    "C1": A_STORE,      # Shopping Center
    "C1G": A_STORE,     # Shopping Center Gov
    "B": A_STORE,       # Bank
    "BZ": A_STORE,      # Bank Condominium
    "TS": A_STORE,      # Timeshare
    "TSF": A_STORE,     # Time Share Fractional
    "TSU": A_STORE,     # Time Share Unsegregated
    # offices
    "O": A_OFFICE,      # Office
    "O35": A_OFFICE,    # Office Portion Leased of 35 or More
    "LE35": A_OFFICE,   # Lease over 35 years
    "OG": A_OFFICE,     # Office Gov
    "OZ": A_OFFICE,     # Office - Condominium
    "OZEU": A_OFFICE,   # Office Condo Economic Unit
    "OMD": A_OFFICE,    # Medical-dental Office Building
    "OMDG": A_OFFICE,   # Medical-dental Office Building Gov
    "OC": A_OFFICE,     # Office with Major Retail Units
    "OAT": A_OFFICE, "OAH": A_OFFICE, "OAM": A_OFFICE, "OAL": A_OFFICE,
    "OBH": A_OFFICE, "OBM": A_OFFICE, "OBL": A_OFFICE,
    "OCH": A_OFFICE, "OCM": A_OFFICE, "OCL": A_OFFICE,   # Office - class A/B/C tiers
    # sheds, works and vehicles
    "I": A_IND,         # Industrial
    "IW": A_IND,        # Industrial Warehouse
    "IX": A_IND,        # Industrial Mixed/Other Use
    "IXG": A_IND,       # Industrial Gov Mixed/Other Use
    "IG": A_IND,        # Industrial Gov
    "IZ": A_IND,        # Industrial Condominium
    "IDC": A_IND,       # Industrial Data Center
    "G": A_IND,         # Garages (Commercial)
    "GG": A_IND,        # Garages (Commercial)
    "GZ": A_IND,        # Garage Condominium
    "GZEU": A_IND,      # Garages Condo Economic Unit
    "PLG": A_IND,       # GARAGE
    "PZ": A_IND,        # Parking Stall Condominium
    "PL": A_IND,        # Parking Lot
    "S": A_IND,         # Gas Station
    # beds for hire
    "H": A_HOTEL,       # Hotel
    "H1": A_HOTEL,      # Hotel
    "H2": A_HOTEL,      # Hotels - Other
    "HG": A_HOTEL,      # Hotel Gov
    "M": A_HOTEL,       # Motels
    "MG": A_HOTEL,      # Motels Gov
    "RH": A_HOTEL,      # Residential Hotel & SRO
    "RHG": A_HOTEL,     # Residential Hotel & SRO Gov
    # gable, tower, portico
    "W": A_INST,        # Churches, Convents, Rectories
    "WG": A_INST,       # Churches, Convents, Rectories Gov
    "E": A_INST,        # Schools
    "EG": A_INST,       # Schools
    "N1": A_INST,       # Hospitals
    "N1G": A_INST,      # Hospitals Gov
    "N2": A_INST,       # Convalescent/Nursing Homes
    "N2G": A_INST,      # Convalescent/Nursing Homes Gov
    "T": A_INST,        # Theatres
    "EC": A_INST,       # Entertainment Complex
    "ECG": A_INST,      # Entertainment Complex Gov
    "U": A_INST,        # Clubs, Lodges, Fraternal Organizations
    "UG": A_INST,       # Clubs, Lodges, Fraternal Organizations Gov
    "LIBG": A_INST,     # LIBRARY
    "FIRG": A_INST,     # FIRE STATION
    "POLG": A_INST,     # POLICE STATION
    "CONG": A_INST,     # Consulate
    "GC": A_INST,       # Golf Course
    "GCU": A_INST,      # Golf Course
    "P": A_INST,        # Public Buildings (Govt)
    "CP": A_INST,       # City Property
    "SP": A_INST,       # State of California Property
    "USP": A_INST,      # U.S. Government Property
    "UCP": A_INST,      # University of California Property
    "RDAP": A_INST,     # Redevelopment Agency Property
    "Y": A_INST,        # Port Commission Property
    "PI": A_INST,       # Possessory Interest
    "MB": A_INST,       # Mission Bay
}

# Classes that are NOT a building. A footprint standing on one of these parcels
# is a conflict between two published files, not knowledge about the building,
# so it takes the honest unknown and a flag that says which conflict it is.
NON_BUILDING = {
    "V", "VR", "VRX", "VA15", "VCI", "VCIX", "VG", "VPUB", "VSP",  # vacant lots
    "UWL",   # Under Water Lot
    "TDR",   # Vacant TDR Parcel
    "X",     # Misc
}

# flag bits — WHY a building has archetype 0, so the page can count them
FLAG_OK = 0
FLAG_NOROLL = 1      # the footprint joins no 2025 roll row at all
FLAG_NOCLASS = 2     # it joins a row whose property_class_code is blank
FLAG_NONBUILDING = 4 # the class is a vacant / under-water / TDR parcel
FLAG_UNMAPPED = 8    # a class code this file has never seen (see the report)


# ── the roll, cached ──────────────────────────────────────────────────────
def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "qipu-pipeline/1.0"})
    return urllib.request.urlopen(req, timeout=180).read()


def fetch_roll() -> None:
    """`property_class_code` for the 2025 secured roll, paged, into char/cache."""
    os.makedirs(CACHE, exist_ok=True)
    sel = "parcel_number,property_class_code"
    for i in range(0, 20):
        path = os.path.join(CACHE, "cls-%02d.json" % i)
        if os.path.exists(path) and os.path.getsize(path) > 2:
            if json.load(open(path)) == []:
                break
            continue
        q = urllib.parse.urlencode({
            "$select": sel,
            "$where": "closed_roll_year=%d" % ROLL_YEAR,
            "$limit": PAGE, "$offset": i * PAGE, "$order": "row_id",
        })
        body = _get("https://data.sfgov.org/resource/%s.json?%s" % (ROLL_DS, q))
        open(path, "wb").write(body)
        rows = json.loads(body)
        print("  cls-%02d %6d rows" % (i, len(rows)))
        if not rows:
            break


def fetch_ref() -> None:
    """pa56-ek2h — the published definition of every class code."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, "classref.json")
    if os.path.exists(path) and os.path.getsize(path) > 2:
        return
    q = urllib.parse.urlencode({"$limit": 1000, "$order": "class_code"})
    open(path, "wb").write(_get("https://data.sfgov.org/resource/%s.json?%s" % (REF_DS, q)))


def load_class_by_parcel() -> dict[str, str]:
    out: dict[str, str] = {}
    for name in sorted(os.listdir(CACHE)):
        if not name.startswith("cls-"):
            continue
        for r in json.load(open(os.path.join(CACHE, name))):
            pn = r.get("parcel_number")
            if pn:
                out[pn] = (r.get("property_class_code") or "").strip().upper()
    return out


def load_ref() -> dict[str, str]:
    path = os.path.join(CACHE, "classref.json")
    if not os.path.exists(path):
        return {}
    return {(r.get("class_code") or "").strip().upper(): r.get("class_definition") or ""
            for r in json.load(open(path))}


# ── build ─────────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--report", action="store_true",
                    help="measure and print, write no file")
    args = ap.parse_args()

    fetch_ref()
    fetch_roll()
    CLS = load_class_by_parcel()
    REF = load_ref()
    print("roll rows with a parcel key: %d   published class codes: %d"
          % (len(CLS), len(REF)))

    import reindex  # scratchpad/sf-city-anim/form/reindex.py — Block C

    rec = reindex.build()
    payload, H = reindex.shipped_h()
    n = len(rec)
    # THE ALIGNMENT PROOF LIVES IN ONE PLACE NOW. This file used to carry its
    # own copy — `max(1, min(255, ...)) != H[i]` — and when 153 buildings began
    # shipping a published height instead of the LiDAR median, that copy
    # refused to run: "134 height-byte mismatches, refusing to write a
    # misaligned array". It was right to refuse and wrong about why. Three
    # files had three copies of this test; reindex.prove_alignment is the one,
    # it reads the height cap off the shipped meta rather than hardcoding 255,
    # and it asserts set inclusion against FLAG_PUBHEIGHT so an unexplained
    # byte still stops the write.
    reindex.prove_alignment(rec, payload, H, label="char")

    arch = bytearray(n)
    flag = bytearray(n)
    seen: collections.Counter[str] = collections.Counter()
    unmapped: collections.Counter[str] = collections.Counter()
    for i, r in enumerate(rec):
        code = CLS.get(r["pn"])
        if code is None:
            flag[i] = FLAG_NOROLL
            continue
        if not code:
            flag[i] = FLAG_NOCLASS
            continue
        seen[code] += 1
        if code in NON_BUILDING:
            flag[i] = FLAG_NONBUILDING
            continue
        a = CLASS_ARCH.get(code)
        if a is None:
            flag[i] = FLAG_UNMAPPED
            unmapped[code] += 1
            continue
        arch[i] = a

    # ── the report ────────────────────────────────────────────────────────
    counts = collections.Counter(arch)
    print("\n-- archetype over the %d drawn buildings --" % n)
    for a, name in enumerate(ARCH):
        c = counts.get(a, 0)
        print("  %2d %-16s %7d  %6.2f%%" % (a, name, c, 100.0 * c / n))
    named = n - counts.get(A_UNKNOWN, 0)
    print("  %-19s %7d  %6.2f%%  <- carry a published archetype"
          % ("NAMED", named, 100.0 * named / n))
    fc = collections.Counter(flag)
    print("\n-- why a building is `unknown` --")
    for bit, why in ((FLAG_NOROLL, "no 2025 roll row for the parcel"),
                     (FLAG_NOCLASS, "roll row, blank property_class_code"),
                     (FLAG_NONBUILDING, "class is a vacant / under-water / TDR parcel"),
                     (FLAG_UNMAPPED, "class code not in CLASS_ARCH")):
        print("  %-46s %6d" % (why, fc.get(bit, 0)))
    if unmapped:
        print("\n!! class codes with no archetype — add them or leave them honest:")
        for code, c in unmapped.most_common():
            print("     %-6s %6d  %s" % (code, c, REF.get(code, "(not in pa56-ek2h)")))
    print("\n-- the ten commonest class codes actually seen --")
    for code, c in seen.most_common(10):
        print("  %-6s %7d  %-6s %s" % (code, c, ARCH[CLASS_ARCH.get(code, 0)],
                                       REF.get(code, "")))

    if args.report:
        print("\n--report: nothing written")
        return 0

    os.makedirs(OUTDIR, exist_ok=True)
    out = {
        "n": n,
        "archNames": ARCH,
        "arch": base64.b64encode(bytes(arch)).decode(),
        "flag": base64.b64encode(bytes(flag)).decode(),
        "flagBits": {"ok": FLAG_OK, "noRoll": FLAG_NOROLL, "noClass": FLAG_NOCLASS,
                     "nonBuilding": FLAG_NONBUILDING, "unmapped": FLAG_UNMAPPED},
        "counts": {ARCH[a]: int(counts.get(a, 0)) for a in range(len(ARCH))},
        "meta": {
            "MEASURED": {
                "class": ("DataSF %s Assessor Historical Secured Property Tax Rolls, "
                          "closed_roll_year=%d, column `property_class_code`. Joined "
                          "footprint -> parcel by bldg/pnjoin.resolve_pn, the same key "
                          "bldg/build_bldg.py uses." % (ROLL_DS, ROLL_YEAR)),
                "definitions": ("DataSF %s Reference: Assessor-Recorder Property Class "
                                "Codes — the published definition of each code."
                                % REF_DS),
            },
            "LICENCE": "Open Data Commons PDDL 1.0 (public domain), both datasets.",
            "DECLARED": ("The map from 145 published class codes to 11 archetypes is an "
                         "editorial grouping, written out in full in "
                         "pipeline/scripts/us_sf_city/build_building_character.py. Each "
                         "code's target is justified by that code's own published "
                         "class_definition, quoted beside it."),
            "NOT_MEASURED": ("Style, period, material, ornament. The roll says a parcel is "
                             "a Flat & Store; it does not say the storefront is Italianate. "
                             "Nothing here licenses drawing one."),
            "FALLBACK": ("archetype 0 `unknown` is the honest bucket and must render exactly "
                         "as the city renders today. The flag byte says why: 1 no roll row, "
                         "2 blank class, 4 the class is not a building, 8 an unmapped code."),
            "INDEX": ("arch[i] and flag[i] are indexed by the building's position in "
                      "gen/bldg-data.js — the same index the encoder publishes as "
                      "kinds.bldg.fields `gid`. Alignment is proved, not assumed: this "
                      "script re-derives every quantised height byte through "
                      "form/reindex.py and refuses to write on a single mismatch."),
            "counts": {"drawn": n, "named": named,
                       "namedPct": round(100.0 * named / n, 2)},
        },
    }
    path = os.path.join(OUTDIR, "char-data.js")
    with open(path, "w") as f:
        f.write("window.CHAR=" + json.dumps(out, separators=(",", ":")) + ";\n")
    print("\nwrote %s  (%d bytes)" % (path, os.path.getsize(path)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
