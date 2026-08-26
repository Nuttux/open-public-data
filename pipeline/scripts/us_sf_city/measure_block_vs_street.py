"""What belongs on a block, and what belongs in the street layer? Measured.

The block layer holds 97,399 rows. A survey using a hand-rolled street regex and
each block's PUBLISHED `s` list suggested 18.2% of them name no street that
fronts the block they sit on. This re-derives that with the parser the placement
code actually uses and with the UNCAPPED fronting-street set, and then tests one
hypothesis: that a decision naming more than N distinct streets is a street-layer
record and does not belong in any single block's list.

TWO THINGS THE FIRST SURVEY COULD NOT SEE
  1. `b_streets[bn]` — the `s` array published in each shard — is CAPPED AT SIX
     (`build_index.py`: `sorted(...)[:6]`). `BSTREETS`, the set the placement
     code itself tests against, is uncapped. A block fronting nine streets
     publishes six, so a decision naming the seventh reads as "does not front"
     when the index knows perfectly well that it does.
  2. The streets of a decision are already resolved and stored: `joined.json`
     carries `r`, the gazetteer-resolved mentions the placement used, including
     the preface. No regex is needed and none is used here.

N IS FOUND, NOT PICKED. The curve is printed for every candidate and the
decision is left to whoever reads it.

    python3 measure_block_vs_street.py --survey
    python3 measure_block_vs_street.py --curve
"""
from __future__ import annotations

import argparse
import collections
import importlib.util
import json
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parents[3]
ANIM = REPO / "scratchpad" / "sf-city-anim"
# The BUILDER is in the repo; its DATA tree is not. ADR-0012 §4.7 / blocks/_paths.py.
BLK = REPO / "pipeline" / "scripts" / "us_sf_city" / "blocks"
BLKDATA = ANIM / "blocks"
JOINED = BLKDATA / "cache" / "joined.json"


def _load(p, n):
    s = importlib.util.spec_from_file_location(n, p)
    m = importlib.util.module_from_spec(s)
    sys.modules[n] = m
    s.loader.exec_module(m)
    return m


def fronting() -> dict[str, set[str]]:
    """The UNCAPPED per-block fronting-street names — what BSTREETS is."""
    sys.path.insert(0, str(BLK))
    BI = _load(BLK / "build_index.py", "bi_meas")
    idx = BI.street_index()
    blocks = json.load(open(ANIM / "geo" / "cache" / "blocks.json"))
    idx = BI.geometry_guard(idx, blocks)
    idx = {k: v for k, v in idx.items() if v}
    out: dict[str, set[str]] = collections.defaultdict(set)
    for skey, d in idx.items():
        name = skey.split("|")[0]
        for bn in d:
            out[bn].add(name)
    return out


def load_joined():
    d = json.load(open(JOINED))
    return d["dec"], d["own"], d["b_streets"]


def streets_of(rec) -> set[str]:
    """The decision's own resolved street names — the placement's own parser."""
    return {m["s"] for m in rec["r"] if m.get("s")}


def survey() -> None:
    front = fronting()
    dec, own, published = load_joined()
    n_front = sorted(len(v) for v in front.values())
    print(f"  fronting streets per block (uncapped): median "
          f"{n_front[len(n_front) // 2]}, max {max(n_front)}")
    over = sum(1 for v in front.values() if len(v) > 6)
    print(f"  blocks fronting MORE than the six the shard publishes: {over:,} "
          f"of {len(front):,}")

    cats = collections.Counter()
    cats_pub = collections.Counter()
    per_tier = collections.defaultdict(collections.Counter)
    for bn, dids in own.items():
        f = front.get(bn, set())
        p = {s.split("|")[0] for s in published.get(bn, [])}
        for did in dids:
            r = dec[str(did)]
            ss = streets_of(r)
            tier = int(r["p"])
            if not ss:
                k = "names no street at all"
            elif ss & f:
                k = "names a street that FRONTS this block"
            else:
                k = "names streets, NONE of which front this block"
            cats[k] += 1
            per_tier[tier][k] += 1
            if not ss:
                cats_pub["names no street at all"] += 1
            elif ss & p:
                cats_pub["names a street that FRONTS this block"] += 1
            else:
                cats_pub["names streets, NONE of which front this block"] += 1
    tot = sum(cats.values())
    print(f"\n  block rows: {tot:,}")
    print(f"  {'':52s} {'UNCAPPED':>12} {'as published':>14}")
    for k in ("names a street that FRONTS this block",
              "names streets, NONE of which front this block",
              "names no street at all"):
        print(f"    {k:50s} {cats[k]:>7,} {100 * cats[k] / tot:>4.1f}% "
              f"{cats_pub[k]:>7,} {100 * cats_pub[k] / tot:>4.1f}%")

    TN = {4: "stated", 3: "addr", 2: "segment", 1: "corner", 0: "street"}
    print(f"\n  by precision tier (uncapped):")
    print(f"    {'tier':9s} {'rows':>8} {'fronts':>8} {'no front':>9} {'no street':>10}")
    for t in sorted(per_tier, reverse=True):
        c = per_tier[t]
        n = sum(c.values())
        print(f"    {TN.get(t, t):9s} {n:>8,} "
              f"{100 * c['names a street that FRONTS this block'] / n:>7.1f}% "
              f"{100 * c['names streets, NONE of which front this block'] / n:>8.1f}% "
              f"{100 * c['names no street at all'] / n:>9.1f}%")


def curve() -> None:
    front = fronting()
    dec, own, _pub = load_joined()

    nst = {k: len(streets_of(v)) for k, v in dec.items()}
    hits = collections.Counter()          # did -> how many blocks it sits on
    for bn, dids in own.items():
        for did in dids:
            hits[str(did)] += 1

    print(f"  distinct streets named per block-layer decision:")
    dist = collections.Counter(nst[d] for d in hits)
    run = 0
    tot_d = sum(dist.values())
    for k in sorted(dist):
        run += dist[k]
        if k <= 12 or k % 5 == 0:
            print(f"    {k:>3} streets: {dist[k]:>6,} decisions  "
                  f"(cumulative {100 * run / tot_d:>5.1f}%)")

    base_rows = sum(len(v) for v in own.values())
    blocks_with = {bn for bn, v in own.items() if v}
    # baseline match rate
    def match_rate(drop_over: int | None):
        ok = tot = 0
        lost_blocks = 0
        rows_left = 0
        for bn, dids in own.items():
            f = front.get(bn, set())
            kept = 0
            for did in dids:
                if drop_over is not None and nst[str(did)] > drop_over:
                    continue
                kept += 1
                ss = streets_of(dec[str(did)])
                tot += 1
                if ss & f:
                    ok += 1
            rows_left += kept
            if dids and kept == 0:
                lost_blocks += 1
        return rows_left, lost_blocks, (100 * ok / tot if tot else 0)

    r0, _l0, m0 = match_rate(None)
    print(f"\n  baseline: {r0:,} block rows, match rate {m0:.1f}%, "
          f"{len(blocks_with):,} blocks hold a record")
    print(f"\n  {'N':>4} {'rows leave':>12} {'% of layer':>11} "
          f"{'blocks losing last':>19} {'match rate':>11}")
    for N in (2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 30):
        rows_left, lost, m = match_rate(N)
        left = base_rows - rows_left
        print(f"  {N:>4} {left:>12,} {100 * left / base_rows:>10.1f}% "
              f"{lost:>19,} {m:>10.1f}%")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--survey", action="store_true")
    ap.add_argument("--curve", action="store_true")
    a = ap.parse_args()
    if a.survey:
        survey()
    if a.curve:
        curve()
    if not (a.survey or a.curve):
        ap.error("--survey or --curve")


if __name__ == "__main__":
    main()
