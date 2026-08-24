"""D1 diagnostic — where does a drawn building's YEAR actually come from?

Replays exactly the year rule in scratchpad/sf-city-anim/bldg/build_bldg.py
(the script that writes gen/bldg-data.js, the payload the renderer draws), and
attributes every footprint to an analysis neighbourhood so the rule can be
audited per neighbourhood instead of city-wide.

    year source, in build_bldg.py's own order:
      1. wv5m-vpq2 secured roll 2025, `year_property_built` for THIS parcel
         (0 and exactly 1900 are already nulled by bldg/ingest.py)
      2. else the 25th-percentile year of the other parcels on the same
         PUBLISHED assessor block — acdm-wktn's own `block_num`, resolved by
         bldg/pnjoin.py `resolve_block`, NOT `pn[:4]`   FLAG_BLOCKYEAR
      3. else the literal constant 1906                   FLAG_NOYEAR
      4. and then, on made-land blocks, raised to the END of the fill bucket

Nothing is fetched and nothing is invented: this reads the caches the mock
already built and prints counts.
"""
from __future__ import annotations

import collections
import json
import os
import pickle
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
MOCK = os.path.normpath(os.path.join(ROOT, "scratchpad", "sf-city-anim"))
HOOD_TARGET = "Bayview Hunters Point"


def load():
    sys.path.insert(0, os.path.join(MOCK, "bldg"))
    d = pickle.load(open(os.path.join(MOCK, "bldg", "cache", "parsed.pkl"), "rb"))
    RAW, ROLL = d["b"], d["roll"]
    hood = {}
    for r in json.load(open(os.path.join(MOCK, "geo", "cache", "parcels.json"))):
        hood[(r.get("block_num") or "") + (r.get("lot_num") or "")] = \
            r.get("analysis_neighborhood") or "(null)"
    ml = json.load(open(os.path.join(MOCK, "geo", "cache", "made_land.json")))
    made_of = {}
    for bk in ml["buckets"]:
        for bn in bk["blocks"]:
            made_of[bn] = max(made_of.get(bn, 0), bk["built"][1])
    from pnjoin import block_index
    BLK = block_index(json.load(open(
        os.path.join(MOCK, "geo", "cache", "parcels.json"))))
    return RAW, ROLL, hood, made_of, BLK


def block_p25(ROLL, blockf):
    per = collections.defaultdict(list)
    for pn, v in ROLL.items():
        if v[0]:
            b = blockf(pn)
            if b:
                per[b].append(v[0])
    out = {}
    for b, ys in per.items():
        ys.sort()
        out[b] = ys[min(len(ys) - 1, int(0.25 * len(ys)))]
    return out


MIN_AREA, MIN_H = 20.0, 2.0


def main():
    RAW, ROLL, hood, made_of, BLK = load()
    from pnjoin import resolve_block
    cache = {}

    def blockf(pn):
        b = cache.get(pn)
        if b is None:
            b = cache[pn] = resolve_block(pn, BLK)
        return b

    blk = block_p25(ROLL, blockf)
    rows = []
    for r in RAW:
        h = r["hmed"]
        if h is None:
            h = r["hmean"]
        if h is None:
            h = r["hmax"]
        h = (h or 0) / 100.0
        if h < MIN_H or r["a"] < MIN_AREA:
            continue
        pn = r["pn"]
        v = ROLL.get(pn)
        if v and v[0]:
            yr, src = v[0], "parcel"
        else:
            yr = blk.get(blockf(pn), 0)
            if yr:
                src = "blockp25"
            else:
                yr, src = 1906, "none->1906"
        m = made_of.get(blockf(pn), 0)
        if m and yr < m:
            yr, src = m, src + "+fill"
        rows.append((hood.get(pn, "(unjoined)"), yr, src, pn, blockf(pn)))

    print(f"footprints kept {len(rows):,}")
    print("\n=== year source, city-wide ===")
    for s, n in collections.Counter(r[2] for r in rows).most_common():
        print(f"  {s:16s} {n:>7,}  {n/len(rows):6.2%}")

    for scope in (HOOD_TARGET, None):
        sel = [r for r in rows if (scope is None or r[0] == scope)]
        name = scope or "ALL OTHER" 
        if scope is None:
            sel = [r for r in rows if r[0] != HOOD_TARGET]
        print(f"\n=== {name}: {len(sel):,} footprints ===")
        for s, n in collections.Counter(r[2] for r in sel).most_common():
            print(f"  src {s:16s} {n:>7,}  {n/len(sel):6.2%}")
        c = collections.Counter(r[1] for r in sel)
        print("  top 15 years:")
        for y, n in c.most_common(15):
            print(f"    {y}  {n:>6,}  {n/len(sel):6.2%}")

    print("\n=== who carries year 2014, city-wide ===")
    y14 = [r for r in rows if r[1] == 2014]
    print(f"  total {len(y14):,}")
    for hn, n in collections.Counter(r[0] for r in y14).most_common(12):
        print(f"    {hn:32s} {n:>6,}")
    for s, n in collections.Counter(r[2] for r in y14).most_common():
        print(f"    src {s:16s} {n:>6,}")

    print("\n=== Bayview: blocks contributing most to 2014 ===")
    bv14 = [r for r in y14 if r[0] == HOOD_TARGET]
    for b, n in collections.Counter(r[4] for r in bv14).most_common(15):
        print(f"    block {b or '(no published block)'}  {n:>5,}  p25={blk.get(b)}")

    fallback(RAW, ROLL, blk, blockf)


def fallback(RAW, ROLL, blk, blockf):
    """The two defects underneath every fallback year. See DATA-TRUTH.md §1.4-1.6.

    (a) ORPHANS — a footprint whose parcel is in neither the secured roll nor
        the active parcel fabric. No published file says anything about when it
        was built, and the pipeline hands it a year anyway.
    (b) THE POOLED BLOCK KEY — `build_bldg.py` keys the block fallback on
        `pn[:4]`, which cannot separate 4591A from 4591C. `acdm-wktn` publishes
        `block_num` and `lot_num` as separate columns, so the true block is
        knowable and the two answers can be compared.
    """
    blk_of = {}
    for r in json.load(open(os.path.join(MOCK, "geo", "cache", "parcels.json"))):
        b, l = r.get("block_num") or "", r.get("lot_num") or ""
        if b and l:
            blk_of[b + l] = b

    def p25(ys):
        ys = sorted(ys)
        return ys[min(len(ys) - 1, int(0.25 * len(ys)))] if ys else 0

    perB = collections.defaultdict(list)
    for pn, v in ROLL.items():
        if v[0] and blk_of.get(pn):
            perB[blk_of[pn]].append(v[0])
    bB = {k: p25(v) for k, v in perB.items()}

    # the p25 map the OLD pooled key produced, rebuilt here so the before/after
    # is arithmetic and not a memory of a previous run
    old_per = collections.defaultdict(list)
    for pn, v in ROLL.items():
        if v[0]:
            old_per[pn[:4]].append(v[0])
    old4 = {k: p25(v) for k, v in old_per.items()}

    kept = [r for r in RAW
            if (r["hmed"] or r["hmean"] or r["hmax"] or 0) / 100.0 >= MIN_H
            and r["a"] >= MIN_AREA]

    no_row = no_year = 0
    use = collections.Counter()
    orphan_handed = collections.Counter()
    orphan_1906 = 0
    shift = collections.Counter()
    for r in kept:
        pn = r["pn"] or ""
        v = ROLL.get(pn)
        if v and v[0]:
            continue
        if v is None:
            no_row += 1
        else:
            no_year += 1
            use[v[2] or "(blank)"] += 1
        if pn not in blk_of and pn not in ROLL:          # orphan
            y = blk.get(blockf(pn), 0)
            if y:
                orphan_handed[y] += 1
            else:
                orphan_1906 += 1
        y4 = old4.get(pn[:4], 0)                         # the key that WAS shipped
        yB = blk.get(blockf(pn), 0)                      # the key shipped now
        if y4 != yB:
            shift[y4 - yB] += 1

    print("\n=== why a footprint has no year of its own ===")
    print(f"  roll row exists but carries no year_property_built: {no_year:,}")
    for k, n in use.most_common(8):
        print(f"      {k:32s} {n:>6,}")
    print(f"  no roll row for the parcel at all                 : {no_row:,}")

    print("\n=== ORPHANS: no roll row AND no active parcel ===")
    tot = sum(orphan_handed.values()) + orphan_1906
    print(f"  {tot:,} of {len(kept):,} footprints ({tot/len(kept):.1%})")
    print(f"    handed their published block's p25: {sum(orphan_handed.values()):,}")
    for y, n in orphan_handed.most_common(12):
        print(f"      {y}  {n:>5,}")
    print(f"    falling to the 1906 constant    : {orphan_1906:,}")

    print("\n=== BEFORE/AFTER: the pooled key pn[:4] vs the published block_num ===")
    print(f"  footprints whose fallback year MOVED: {sum(shift.values()):,}")
    print(f"    by 20 years or more: {sum(v for k, v in shift.items() if abs(k) >= 20):,}")
    print(f"    by 50 years or more: {sum(v for k, v in shift.items() if abs(k) >= 50):,}")
    print(f"    earlier: {sum(v for k, v in shift.items() if k > 0):,}   "
          f"later: {sum(v for k, v in shift.items() if k < 0):,}")


if __name__ == "__main__":
    main()
