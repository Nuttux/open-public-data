"""The records a neighbourhood holds, so a neighbourhood can be a page.

A reader thinks in three things: their neighbourhood, their street, their
building. The street and the building already have their records — the street
has its own file, and a building's records are a subset of the ground it
stands on. The neighbourhood had counts and nothing to read, so it could not
be opened the way the other two can.

    website/public/data/us/sf/city/blocks/hood/<index>.json

WHY THIS IS A SELECTION AND NOT EVERYTHING. The Mission holds 2,277 readable
records. Shipping them all is 340 KB for one neighbourhood and 1.5 MB for the
city, for a page nobody reads top to bottom. So each decade ships its most
recent PER_DECADE records together with the TRUE count of what the decade
holds, and the page says "12 of 459" rather than implying it has them all.
The full record stays reachable street by street, where it already is.

WHAT IS THROWN AWAY FIRST. Scanning damage, roll-call lists, index rows,
payment schedules and the boilerplate the clerk repeated hundreds of times.
Measured over the whole city: 41,489 distinct records, and about a third of
them are one of those. What is left is what a person could actually read.

Run:
    python3 pipeline/scripts/us_sf_city/build_hood_records.py
"""
from __future__ import annotations

import collections
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CITY = os.path.join(ROOT, "website/public/data/us/sf/city")
BLOCKS = os.path.join(CITY, "blocks")
OUT_DIR = os.path.join(BLOCKS, "hood")
# The written paragraphs. They live in a versioned seed and are re-attached on
# every build, so a rebuild can never quietly drop them and an editor changes
# one file rather than 41 outputs.
SEED = os.path.join(ROOT, "pipeline/seeds/countries/us/sf_hood_summaries.json")

sys.path.insert(0, HERE)
from _chunk import field_array, read_chunk  # noqa: E402

# how many records a decade ships. Twelve fills a screen and leaves the true
# count visible beside it.
PER_DECADE = 12

# ── lines nobody could read ─────────────────────────────────────────────────
ROLL = re.compile(r"\b(ayes?|noes?|absent|excused)\s*[—\-:]|\bsupervisors?\s+\w+,\s+\w+,\s+\w+", re.I)
PROCEDURAL = re.compile(
    r"^\s*(referred to|read and ordered|ordered filed|laid over|passed for second"
    r"|finally passed|action deferred|adopted by the following|on recommendation of"
    r"|the following (resolution|ordinance) was|was introduced by|the clerk presented"
    r"|recommended by|whereas)\b", re.I)
PAYSCHED = re.compile(
    r"the following (amounts?|expenditures?|claims?|sums?) (be and the same|are hereby)"
    r"|hereinafter mentioned accounts|claim dated", re.I)
INDEXROW = re.compile(r"\(\s*[RO]\.?\s*\d{3,}\s*\)")
NUMSOUP = re.compile(r"(\b[\d,]{3,}\.\d\d\b.*){2,}")
ENUM_OPEN = re.compile(r"^\s*\d{1,2}\s*[).]\s")
HAS_LETTER = re.compile(r"[A-Za-z]")
VOWEL = re.compile(r"[aeiouyAEIOUY]")
BROKEN = re.compile(r"[A-Za-z][0-9]|[0-9][A-Za-z]|[^\sA-Za-z0-9'\-/&.,;:()$%\"]")
EDGE = re.compile(r"^[.,;:()\[\]\"']+|[.,;:()\[\]\"']+$")


def unreadable(t: str) -> str | None:
    s = t.strip()
    if len(s) < 45:
        return "too short"
    if ENUM_OPEN.search(s):
        return "list fragment"
    if INDEXROW.search(s):
        return "index row"
    if ROLL.search(s):
        return "roll call"
    if PROCEDURAL.search(s):
        return "procedural"
    if PAYSCHED.search(s):
        return "payment schedule"
    if NUMSOUP.search(s):
        return "figure register"
    words = [w for w in s.split() if HAS_LETTER.search(w)]
    if not words:
        return "no words"
    bad = 0
    for w in words:
        c = EDGE.sub("", w)
        if BROKEN.search(c) or (len(c) >= 4 and not VOWEL.search(c)):
            bad += 1
    if bad / len(words) > 0.08:
        return "scan damage"
    if any(BROKEN.search(EDGE.sub("", w)) for w in words[:5]):
        return "damaged opening"
    return None


# the clerk's own formula, repeated with different streets. Folding these is
# for READING only — the true decade counts below are taken before the fold.
STRIP = re.compile(
    r"\d+|\b(street|st|avenue|ave|boulevard|blvd|road|way|drive|dr|place|court"
    r"|terrace|alley|lane)s?\b", re.I)


def formula(t: str) -> str:
    s = STRIP.sub(" ", t.lower())
    return " ".join(re.sub(r"[^a-z ]", " ", s).split())[:110]


def main() -> int:
    header, payload = read_chunk(open(os.path.join(CITY, "base/blocks.qc"), "rb").read())
    hood = field_array(header, payload, "hood")
    ids = json.load(open(os.path.join(CITY, "base/blocks-id.json")))
    names = ids["hoodNames"]
    block_hood = {ids["id"][i]: int(hood[i]) for i in range(len(ids["id"]))}

    written_summaries = {}
    if os.path.exists(SEED):
        written_summaries = json.load(open(SEED)).get("hoods", {})

    seen: set[tuple[str, str]] = set()
    # per hood, per decade: the true count, and the rows worth reading
    true_count: dict[int, collections.Counter] = collections.defaultdict(collections.Counter)
    keep: dict[int, dict[int, list]] = collections.defaultdict(lambda: collections.defaultdict(list))
    formulas: dict[int, set] = collections.defaultdict(set)
    dropped = collections.Counter()
    total = 0

    for fn in sorted(glob.glob(os.path.join(BLOCKS, "block-*.json"))):
        for bid, rec in json.load(open(fn)).items():
            if not isinstance(rec, dict):
                continue
            h = block_hood.get(bid)
            if h is None:
                continue
            for r in rec.get("d", []):
                if not isinstance(r, dict):
                    continue
                t = (r.get("t") or "").strip()
                if not t:
                    continue
                # a record on a corner is stored on every block that corner
                # touches, so the identity is the page plus the line
                key = (r.get("u") or "", t[:120])
                if key in seen:
                    continue
                seen.add(key)
                total += 1
                dec = (r["y"] // 10) * 10
                true_count[h][dec] += 1
                why = unreadable(t)
                if why:
                    dropped[why] += 1
                    continue
                f = formula(t)
                if f in formulas[h]:
                    dropped["the clerk's formula again"] += 1
                    continue
                formulas[h].add(f)
                keep[h][dec].append({
                    "y": r["y"], "d": r.get("d", ""), "k": r.get("k"),
                    "p": r.get("p"), "u": r.get("u"), "t": t, "b": bid,
                    **({"c": r["c"]} if r.get("c") else {}),
                })

    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"{total:,} distinct records\n")
    print(f"{'kept':>6} {'of':>7}  neighbourhood")
    written = 0
    for h, name in enumerate(names):
        decs = sorted(set(true_count[h]) | set(keep[h]))
        rows = []
        for dec in decs:
            group = sorted(keep[h].get(dec, []), key=lambda r: (-r["y"], r["d"]))
            rows.append({
                "decade": dec,
                "n": true_count[h].get(dec, 0),      # what the decade really holds
                "rows": group[:PER_DECADE],          # what this file ships
            })
        kept = sum(len(d["rows"]) for d in rows)
        alln = sum(d["n"] for d in rows)
        # the written paragraph, if one has been written for this neighbourhood
        wr = written_summaries.get(str(h))
        if wr and wr.get("name") and wr["name"] != name:
            print(f"  ! seed names hood {h} '{wr['name']}', the map says '{name}'"
                  " — summary NOT attached")
            wr = None

        payload_out = {
            "i": h,
            "name": name,
            "n": alln,
            "n_shipped": kept,
            "per_decade": PER_DECADE,
            "THIS_IS_A_SELECTION":
                "Each decade ships its most recent readable records and states "
                "what the decade really holds. Unreadable scans, roll calls, "
                "index rows, payment schedules and repeats of the clerk's own "
                "formula are removed. The whole record is reachable street by "
                "street.",
            "decades": rows,
            **({"summary": wr["summary"],
                "summary_sources": wr.get("sources", []),
                "summary_read": wr.get("read", {}),
                "SUMMARY_IS_OURS":
                    "This paragraph is written by us from the records below. "
                    "Every clause names the record it stands on in "
                    "summary_sources. The records themselves are the city's."}
               if wr else {}),
        }
        with open(os.path.join(OUT_DIR, f"{h}.json"), "w") as f:
            json.dump(payload_out, f, separators=(",", ":"))
        written += 1
        print(f"{kept:6d} {alln:7d}  {name}")

    kb = sum(os.path.getsize(os.path.join(OUT_DIR, f"{i}.json"))
             for i in range(written)) / 1024
    print(f"\n{written} files, {kb:.0f} KB total")
    n_sum = sum(1 for k in written_summaries if k.isdigit() and int(k) < len(names))
    print(f"written paragraphs attached: {n_sum} of {len(names)} neighbourhoods")
    print("removed:", dict(dropped.most_common()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
