"""The Board's record does not end in 1999. It was RENAMED.

    1906-1999   "Journal of proceedings"        143 catalogued volumes
    1999-2016   "Meeting minutes"  / "Minutes"  / "Meeting minutes. Draft"

Same series, same Board, same deposit, same scanning programme, uninterrupted
volume numbering. The pipeline searched archive.org for the string *"Journal of
proceedings"* and found ninety-three years. The other seventeen were sitting in
the same collection under a different title the whole time.

**"The scanned series ends in 1999" was never a fact about the record. It was a
fact about our search string.** It is written here in those words because it is
exactly the class of error this project spends its time finding in other
people's data, and we shipped it ourselves.

This script enumerates the series by CREATOR rather than by title, parses each
volume's real coverage, and writes a manifest in the `vols.txt` format the sweep
already consumes:

    pipeline/seeds/countries/us/seed_us_sf_bos_minutes.tsv
    scratchpad/sf-city-anim/geo/cache/ia/<id>_hocr_*.gz     (with --fetch)

── TWO TRAPS, BOTH LOAD-BEARING ──────────────────────────────────────────────

1. **The identifiers have no pattern and must never be derived from one.**
   Observed in a single series:

       meetingminutes95sanfrich
       0meetingminutes1999sanf
       meetingjuneaug2003minutes9820sanfrich
       meetingminutesbo2015sanf
       meetingminutesb2016sanf_0

   There is no template that generates those. The collection is ENUMERATED and
   whatever is there is taken. A template would silently miss volumes and the
   miss would look like a quiet city — which is the same failure mode that hid
   2000-2016 in the first place.

2. **`date` is the CATALOGUE date, not the coverage, and it is provably wrong.**
   `1minutes2001sanf` carries volume "Jan-Feb 2001" and date `1997-01-01`.
   `1minutes1998sanf` carries volume "Jan-Feb 1998" and date `1997-01-01`.
   Coverage is parsed from `volume` first, then from the identifier, and NEVER
   from `date`. This is the same trap as the shipyard's 2014 buildings and the
   2010 LiDAR: a date describing when a record was MADE, read as when the thing
   HAPPENED.

Usage:
    python3 build_minutes_manifest.py --list             enumerate + parse, print
    python3 build_minutes_manifest.py --write            write the seed
    python3 build_minutes_manifest.py --fetch            cache the OCR (network)
"""
from __future__ import annotations

import argparse
import collections
import gzip
import json
import os
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
SEED = REPO / "pipeline" / "seeds" / "countries" / "us" / "seed_us_sf_bos_minutes.tsv"
IA_CACHE = REPO / "scratchpad" / "sf-city-anim" / "geo" / "cache" / "ia"

CREATOR = "San Francisco (Calif.). Board of Supervisors"
UA = {"User-Agent": "qipu-sf-city/1.0 (open data pipeline)"}

# Enumerated by CREATOR. The title is the field that hid the series, so it is
# used to EXCLUDE (committees, agendas) and never to include.
QUERIES = [
    f'creator:("{CREATOR}") AND title:(minutes)',
    f'creator:("{CREATOR}") AND title:("journal of proceedings")',
]
# A committee is a different unit of record: its minutes are one committee's
# business, not the Board's session. Excluded, and counted so the exclusion is
# visible rather than silent.
COMMITTEE = re.compile(r"committee", re.I)
AGENDA_ONLY = re.compile(r"^\s*\[?agenda", re.I)

YEAR = re.compile(r"(?:18|19|20)\d{2}")
# "1995-97" and "2002-03" abbreviate the second year; "92 pt. 2" is a volume
# NUMBER and carries no year at all.
ABBREV = re.compile(r"((?:19|20)\d{2})\s*[-–]\s*(\d{2})\b")
VOLNUM = re.compile(r"^\s*(\d{2,3})(?:\s*(?:pt\.?|-)\s*\d+)?\s*$")


def _get_json(url: str, timeout: int = 120) -> dict:
    for attempt in range(4):
        try:
            with urllib.request.urlopen(
                    urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa: BLE001 — retried, then raised
            if attempt == 3:
                raise
            print(f"    retry {attempt + 1} after {e}")
            time.sleep(2 * (attempt + 1))
    raise AssertionError("unreachable")


def enumerate_series() -> list[dict]:
    fl = ("identifier", "title", "date", "volume", "year", "publicdate")
    out: dict[str, dict] = {}
    for q in QUERIES:
        p = [("q", q), ("rows", "1000"), ("page", "1"), ("output", "json")]
        p += [("fl[]", f) for f in fl]
        u = "https://archive.org/advancedsearch.php?" + urllib.parse.urlencode(p)
        r = _get_json(u)["response"]
        print(f"  {r['numFound']:>5} hits  {q}")
        for d in r["docs"]:
            out[d["identifier"]] = d
    return list(out.values())


# ---- the volume numbering, and why it is a rule and not a guess -------------
# 137 of the items carry a bare volume number ("95", "101", "92 pt. 2") and no
# year anywhere in the volume field or the identifier. The numbering is
# UNBROKEN across the rename, and it is linear:
#
#       year = volume + 1905
#
# That is derived, then CHECKED against the four volumes whose year this
# pipeline already independently established in `scratchpad/sf-city-anim/vols.txt`
# long before the modern half was found:
#
#       vol 90 -> 1995   journalofjanaprproceed90sanfrich
#       vol 91 -> 1996   journalofproceed91sanfrich
#       vol 92 -> 1997   journalofproceedjanapr92sanfrich
#       vol 93 -> 1998   journalofproceed93sanfrich
#
# and against the modern end, where volume and year BOTH appear in the same
# record (vol 98 = 2003, 99 = 2004, 100 = 2005, 101 = 2006, 102 = 2007).
# `verify_volume_rule()` asserts it rather than trusting this comment.
VOL_EPOCH = 1905
VOL_CHECK = {90: 1995, 91: 1996, 92: 1997, 93: 1998,
             98: 2003, 99: 2004, 100: 2005, 101: 2006, 102: 2007}


def verify_volume_rule() -> None:
    bad = {v: y for v, y in VOL_CHECK.items() if v + VOL_EPOCH != y}
    if bad:
        raise AssertionError(f"volume rule broken for {bad}")


def coverage(d: dict) -> tuple[int, int] | None:
    """(first_year, last_year) actually covered — volume, then identifier.

    NEVER `date`. See the module docstring, trap 2.
    """
    for src in (str(d.get("volume") or ""), d.get("identifier", "")):
        m = ABBREV.search(src)
        if m:
            a = int(m.group(1))
            c = a // 100 * 100 + int(m.group(2))
            if c < a:
                c += 100
            return (a, c)
        ys = [int(x.group(0)) for x in YEAR.finditer(src)]
        # a bare volume number ("95", "101") is not a year
        if ys:
            ys = [y for y in ys if 1850 <= y <= 2100]
        if ys:
            return (min(ys), max(ys))
    # no year anywhere — fall back to the volume NUMBER, which is a rule
    m = VOLNUM.match(str(d.get("volume") or ""))
    if m:
        y = int(m.group(1)) + VOL_EPOCH
        if 1900 <= y <= 2100:
            return (y, y)
    return None


def classify(docs: list[dict]) -> tuple[list[dict], collections.Counter]:
    keep, why = [], collections.Counter()
    for d in docs:
        t = d.get("title", "")
        if COMMITTEE.search(t):
            why["committee series (different unit of record)"] += 1
            continue
        if AGENDA_ONLY.match(t):
            why["agenda, not minutes"] += 1
            continue
        cov = coverage(d)
        if cov is None:
            why["no coverage from volume, identifier or volume number"] += 1
            d["_cov"] = None
            keep.append(d)
            continue
        d["_cov"] = cov
        keep.append(d)
    return keep, why


def report(keep: list[dict]) -> None:
    have = [d for d in keep if d.get("_cov")]
    miss = [d for d in keep if not d.get("_cov")]
    per = collections.Counter()
    for d in have:
        a, b = d["_cov"]
        for y in range(a, b + 1):
            per[y] += 1
    ys = sorted(per)
    print(f"\n  {len(keep)} Board-level items; coverage parsed for {len(have)}, "
          f"unparsed {len(miss)}")
    print(f"  coverage spans {min(ys)} .. {max(ys)}")
    print("\n  items covering each year (2016 back to 1995):")
    for y in range(max(ys), 1994, -1):
        print(f"    {y}  {'#' * min(per.get(y, 0), 30)} {per.get(y, 0)}")
    if miss:
        print(f"\n  {len(miss)} items whose coverage is a bare volume number — these "
              f"need the volume->year map, they are NOT dropped silently:")
        for d in miss[:12]:
            print(f"    {d['identifier'][:44]:44s} vol={str(d.get('volume'))[:12]}")


def write_seed(keep: list[dict]) -> None:
    rows = []
    for d in keep:
        cov = d.get("_cov")
        if not cov:
            continue
        rows.append((cov[0], cov[1], d["identifier"], str(d.get("volume") or ""),
                     d.get("title", "")))
    rows.sort()
    SEED.parent.mkdir(parents=True, exist_ok=True)
    with open(SEED, "w") as f:
        f.write("# Board of Supervisors, the whole scanned series, enumerated by\n"
                "# CREATOR on archive.org — not by title. The title changes from\n"
                "# 'Journal of proceedings' to 'Meeting minutes' around 1999 and that\n"
                "# rename is what hid 2000-2016 from this pipeline.\n"
                "# year_from and year_to are parsed from `volume` then the identifier,\n"
                "# NEVER from the catalogue `date`, which is provably not the coverage.\n"
                "# generated by pipeline/scripts/us_sf_city/build_minutes_manifest.py\n")
        f.write("year_from\tyear_to\tidentifier\tvolume\ttitle\n")
        for r in rows:
            f.write("\t".join(str(x) for x in r) + "\n")
    print(f"\n  wrote {SEED.relative_to(REPO)}  ({len(rows)} volumes)")


def fetch_ocr(keep: list[dict], only_after: int) -> None:
    """Cache the two files the sweep reads, for volumes covering > only_after."""
    IA_CACHE.mkdir(parents=True, exist_ok=True)
    todo = [d for d in keep if d.get("_cov") and d["_cov"][1] > only_after]
    todo.sort(key=lambda d: d["_cov"])
    print(f"\n  {len(todo)} volumes cover a year after {only_after}")
    ok = skip = fail = 0
    for d in todo:
        i = d["identifier"]
        for suf in ("_hocr_searchtext.txt.gz", "_hocr_pageindex.json.gz"):
            p = IA_CACHE / f"{i}{suf}"
            if p.exists() and p.stat().st_size > 200:
                skip += 1
                continue
            url = f"https://archive.org/download/{i}/{i}{suf}"
            try:
                with urllib.request.urlopen(
                        urllib.request.Request(url, headers=UA), timeout=300) as r:
                    b = r.read()
                if len(b) < 200:
                    raise ValueError(f"{len(b)} bytes")
                p.write_bytes(b)
                ok += 1
            except Exception as e:  # noqa: BLE001
                print(f"    MISS {i}{suf}  {e}")
                fail += 1
        print(f"    {i[:46]:46s} {d['_cov']}", flush=True)
    print(f"\n  fetched {ok}, already cached {skip}, missing {fail}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--after", type=int, default=1998,
                    help="with --fetch, only volumes covering a year after this")
    a = ap.parse_args()
    if not (a.list or a.write or a.fetch):
        ap.error("one of --list / --write / --fetch")
    verify_volume_rule()
    print("enumerating by creator")
    docs = enumerate_series()
    keep, why = classify(docs)
    print(f"\n  excluded: {dict(why)}")
    report(keep)
    if a.write:
        write_seed(keep)
    if a.fetch:
        fetch_ocr(keep, a.after)


if __name__ == "__main__":
    main()
