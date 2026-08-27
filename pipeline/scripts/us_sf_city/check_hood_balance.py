"""Does the paragraph reflect the record, or the story I expected to find?

Daniel:
  > "arent you focusing like just on segregation when probably the story is
  >  much larger? … i want to make sure that for each neighborhood you dont
  >  latch onto one stereotypical thing and then make it a unilateral story"

A written paragraph picks a few records out of hundreds. Picking is the job —
a paragraph that reflected the record proportionally would be about street
paving everywhere, because street paving is what the Board mostly did. The
danger is the other one: arriving at a neighbourhood already knowing its
story, finding the records that fit it, and calling that a reading.

That is checkable. This prints, per neighbourhood:

  · what the record is ACTUALLY about, by subject share
  · which subjects the paragraph's own sources touch
  · **what the paragraph never mentions that the record is full of**
  · how much of the span was read line by line rather than sampled

It cannot say a paragraph is wrong. It can say "you wrote about schools and
laundries, and a fifth of this neighbourhood's record is housing you never
looked at" — which is the question worth being asked before publishing.

Run:
    python3 pipeline/scripts/us_sf_city/check_hood_balance.py [hood name]
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
SEED = os.path.join(ROOT, "pipeline/seeds/countries/us/sf_hood_summaries.json")

sys.path.insert(0, HERE)
from _chunk import field_array, read_chunk  # noqa: E402
from build_threads import THREADS  # noqa: E402

COMPILED = [(lbl, re.compile(pat, re.I)) for lbl, _era, pat, _note in THREADS]

# THE THRESHOLD WAS AN ABSOLUTE SHARE AND IT WAS WRONG. At 6% it reported
# "nothing missing" for Chinatown while the neighbourhood's LARGEST subject —
# streets closed for a day, 4.6% — was absent from the paragraph, because a
# varied neighbourhood spreads thin and nothing reaches 6%. The question is not
# "is this subject big in absolute terms" but "is it big HERE and did the
# paragraph walk past it", so the check is now on rank.
TOP_N = 5


def main() -> int:
    argv = [a for a in sys.argv[1:] if a != "--profile"]
    profile = "--profile" in sys.argv
    want = argv[0] if argv else None
    header, payload = read_chunk(open(os.path.join(CITY, "base/blocks.qc"), "rb").read())
    hood = field_array(header, payload, "hood")
    ids = json.load(open(os.path.join(CITY, "base/blocks-id.json")))
    names = ids["hoodNames"]
    block_hood = {ids["id"][i]: int(hood[i]) for i in range(len(ids["id"]))}
    seed = json.load(open(SEED)).get("hoods", {})

    seen: set[tuple[str, str]] = set()
    subj: dict[int, collections.Counter] = collections.defaultdict(collections.Counter)
    total: collections.Counter = collections.Counter()
    # what each SOURCED record is about, so the paragraph can be scored the
    # same way the neighbourhood is
    src_subj: dict[str, set] = collections.defaultdict(set)
    wanted_u = {s["u"] for h in seed.values() for s in h.get("sources", [])}

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
                key = (r.get("u") or "", t[:120])
                if key in seen:
                    continue
                seen.add(key)
                total[h] += 1
                for lbl, rx in COMPILED:
                    if rx.search(t):
                        subj[h][lbl] += 1
                        if r.get("u") in wanted_u:
                            src_subj[r["u"]].add(lbl)

    # --profile also prints neighbourhoods with no paragraph yet, which is the
    # reading you want BEFORE writing one rather than after.
    report = dict(seed)
    if profile:
        for i, name in enumerate(names):
            if want and want.lower() not in name.lower():
                continue
            report.setdefault(str(i), {})

    for hid, h in sorted(report.items(), key=lambda kv: int(kv[0])):
        i = int(hid)
        name = names[i]
        if want and want.lower() not in name.lower():
            continue
        n = total[i] or 1
        covered: set[str] = set()
        for s in h.get("sources", []):
            covered |= src_subj.get(s["u"], set())

        print("=" * 74)
        print(f"{name} — {total[i]:,} records")
        read = h.get("read", {})
        print(f"  read line by line: {read.get('full','?')} · "
              f"sampled: {read.get('sampled','?')} "
              f"({read.get('records_read','?')} of {read.get('records_total','?')})")
        print(f"\n  {'share':>6}  {'in para':>7}  subject")
        missed = []
        for rank, (lbl, c) in enumerate(subj[i].most_common(14)):
            share = c / n
            mark = "  yes  " if lbl in covered else "   —   "
            star = "*" if rank < TOP_N else " "
            print(f" {star}{share*100:5.1f}%  {mark}  {lbl}  ({c})")
            if rank < TOP_N and lbl not in covered:
                missed.append((rank + 1, share, lbl, c))
        # and what the paragraph leans on that is barely here at all
        thin = []
        for lbl in covered:
            c = subj[i].get(lbl, 0)
            if c and c / n < 0.02:
                thin.append((c / n, lbl, c))
        if missed:
            print(f"\n  IN THIS NEIGHBOURHOOD'S TOP {TOP_N} AND NOT IN THE PARAGRAPH:")
            for rank, share, lbl, c in missed:
                print(f"    #{rank}  {share*100:5.1f}%  {lbl}  ({c} records)")
        if thin:
            print("\n  THE PARAGRAPH LEANS ON SUBJECTS THAT ARE THIN HERE:")
            for share, lbl, c in sorted(thin):
                print(f"    {share*100:5.1f}%  {lbl}  ({c} records) "
                      f"\u2014 is it earning its space?")
        if not missed and not thin:
            print("\n  the paragraph covers this neighbourhood's biggest subjects")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
