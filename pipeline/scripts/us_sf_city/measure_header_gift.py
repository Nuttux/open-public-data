"""THE HEADER'S WORDS, AND THE ITEM THEY BELONG TO — counted at the same gates.

§23 trimmed the next file's header off the item above it, which was right: those
words were never that item's. It left them attributed to nobody. They are the
TITLE of the item BELOW — "161338 [Final Map 8380 - 178-188 Albion Street]"
printed by the Clerk directly above the Motion it introduces — and this measures
what happens when they are given to it.

    python3 measure_header_gift.py --ladder <baseline>   A -> B -> C, one change
                                                        at a time
    python3 measure_header_gift.py --items  <baseline>   per ITEM, through
                                                        build_index.locate()
    python3 measure_header_gift.py --clash               where the header's street
                                                        and the item's own are not
                                                        the same

Both run the placement the published index runs, over the Board's corpus alone,
so the two eras are not mixed into one number.
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
# The BUILDER is in the repo; its DATA tree is not. ADR-0012 §4.7 / blocks/_paths.py.
BLK = REPO / "pipeline" / "scripts" / "us_sf_city" / "blocks"
NOW = HERE / "cache_sfbos" / "items.jsonl"
GEOB = REPO / "scratchpad" / "sf-city-anim" / "geo" / "cache" / "blocks.json"


def _bi():
    import importlib.util
    sys.path.insert(0, str(BLK))
    sp = importlib.util.spec_from_file_location("bi", str(BLK / "build_index.py"))
    m = importlib.util.module_from_spec(sp)
    sys.modules["bi"] = m
    sp.loader.exec_module(m)
    return m


def _world(bi):
    idx = bi.street_index()
    blocks = json.load(open(GEOB))
    idx = bi.geometry_guard(idx, blocks)
    idx = {k: v for k, v in idx.items() if v}
    return (idx, {b["b"]: b for b in blocks},
            {b["b"]: (b["cx"], b["cy"]) for b in blocks},
            {b["b"]: i for i, b in enumerate(blocks)})


def place(bi, world, path):
    idx, bmeta, bpos, order = world
    bi.ITEMS = path
    out, _npre, _nnew = bi.load_items()
    placed, unplaced, tier_n = bi.locate(out, idx, bmeta, bpos, order)
    per = {}
    for did, tier, hits, _f in placed:
        per[(out[did]["v"], out[did]["i"])] = (tier, frozenset(hits))
    return out, per, unplaced, tier_n


def do_ladder(base: str) -> None:
    """THE TWO CHANGES, ONE AT A TIME, over the Board's corpus.

    A  the published placement: the corpus as it stands, the Clerk's stated-block
       wording NOT read
    B  A, plus the Clerk's stated-block wording read           (change 1)
    C  B, plus the header given to the item below it          (change 2)

    One variable per step, so neither number can borrow the other's credit.
    """
    bi = _bi()
    world = _world(bi)
    idx, bmeta, bpos, order = world
    TN = {4: "stated", 3: "addr", 2: "segment", 1: "corner", 0: "street"}
    wide_on = bi.stated_blocks

    def run(path, wide):
        # build_index.load_items() ITSELF. Whether the header is given is decided
        # by the CORPUS — the published stream carries no `hp` — so there is no
        # flag here to disagree with the build.
        bi.stated_blocks = (wide_on if wide else
                            (lambda t, bm, wide=False: wide_on(t, bm, False)))
        bi.ITEMS = path
        out, _p, _n = bi.load_items()
        placed, unpl, tier_n = bi.locate(out, idx, bmeta, bpos, order)
        per = {(out[d]["v"], out[d]["i"]): (t, frozenset(h)) for d, t, h, _f in placed}
        bi.stated_blocks = wide_on
        return out, per, tier_n

    steps = [("A  published", base, False),
             ("B  + the Clerk's stated block", base, True),
             ("C  + the header, given to the item below", str(NOW), True)]
    prev = None
    for label, path, wide in steps:
        rows, per, tier_n = run(path, wide)
        bp = {k: v for k, v in per.items() if v[0] >= 1}
        print(f"\n  {label}")
        print(f"      corpus {len(rows):,} rows   "
              f"tiers {{{', '.join(f'{TN[k]}: {v:,}' for k, v in sorted(tier_n.items(), reverse=True))}}}")
        print(f"      block-precision placements  {len(bp):,}")
        if prev is not None:
            same = sum(1 for k in prev if k in bp and prev[k][1] == bp[k][1])
            moved = sum(1 for k in prev if k in bp and prev[k][1] != bp[k][1])
            lost = sum(1 for k in prev if k not in bp)
            new = sum(1 for k in bp if k not in prev)
            print(f"      vs the step above: unchanged {same:,} · changes block "
                  f"{moved:,} · loses placement {lost:,} · new {new:,}")
        prev = bp


def do_items(base: str) -> None:
    bi = _bi()
    world = _world(bi)
    TN = {4: "stated", 3: "addr", 2: "segment", 1: "corner", 0: "street"}
    oi, O, ou, ot = place(bi, world, base)
    ni, N, nu, nt = place(bi, world, str(NOW))
    print(f"\n  baseline corpus {len(oi):,} rows   ->  current {len(ni):,} rows")
    print(f"  tiers before {{{', '.join(f'{TN[k]}: {v:,}' for k, v in sorted(ot.items(), reverse=True))}}}")
    print(f"  tiers after  {{{', '.join(f'{TN[k]}: {v:,}' for k, v in sorted(nt.items(), reverse=True))}}}")
    Ob = {k: v for k, v in O.items() if v[0] >= 1}
    Nb = {k: v for k, v in N.items() if v[0] >= 1}
    same = sum(1 for k in Ob if k in Nb and Ob[k][1] == Nb[k][1])
    moved = sum(1 for k in Ob if k in Nb and Ob[k][1] != Nb[k][1])
    lost = sum(1 for k in Ob if k not in Nb)
    new = [k for k in Nb if k not in Ob]
    print(f"\n  BLOCK-PRECISION PLACEMENTS (tier >= 1)   {len(Ob):,}  ->  {len(Nb):,}")
    print(f"    unchanged block set   {same:>7,}")
    print(f"    CHANGES block         {moved:>7,}")
    print(f"    LOSES placement       {lost:>7,}")
    print(f"    NEW placement         {len(new):>7,}")
    kind = dict(collections.Counter({(r["v"], r["i"]): r["k"] for r in ni}[k] for k in new))
    print(f"      by kind {kind}")
    hp = sum(1 for r in ni if (r["v"], r["i"]) in set(new) and r.get("hp"))
    print(f"      carrying a header preface {hp:,} of {len(new):,}")
    print(f"\n  unplaced reasons  before {dict(ou)}")
    print(f"                    after  {dict(nu)}")


def do_clash(k: int) -> None:
    """The header names one street, the item's own body names another."""
    bi = _bi()
    idx, bmeta, bpos, order = _world(bi)
    gaz = bi.gz.build()
    keys = list(gaz)
    rows = [json.loads(l) for l in open(NOW)]
    n_hdr = sum(1 for r in rows if r.get("hp"))
    n_both = n_agree = n_clash = 0
    clashes = []
    for r in rows:
        hp = r.get("hp") or ""
        if not hp or not r["r"]:
            continue
        pl = bi.preface_locs(hp, gaz, keys)
        if not pl:
            continue
        n_both += 1
        hs = {(m["s"], m.get("a") or "") for m in pl}
        bs = {(m["s"], m.get("a") or "") for m in r["r"]}
        if hs & bs:
            n_agree += 1
        else:
            n_clash += 1
            clashes.append((r, sorted(hs), sorted(bs)))
    print(f"\n  rows carrying a header preface                {n_hdr:,}")
    print(f"  ...where BOTH the header and the body resolve  {n_both:,}")
    print(f"     they name the same street+number            {n_agree:,}  "
          f"({100.0*n_agree/max(1,n_both):.1f}%)")
    print(f"     they do NOT overlap                         {n_clash:,}  "
          f"({100.0*n_clash/max(1,n_both):.1f}%)")
    # what the union does to the placement, block by block
    both_blocks = same_b = extra_b = 0
    diff_rows = []
    for r, hs, bs in clashes:
        hb = set()
        for m in bi.preface_locs(r.get("hp") or "", gaz, keys):
            m["K"] = bi.KEY(m, idx)
            if bi.good_number(m.get("a"), r.get("hp") or ""):
                hb |= {bn for bn, (lo, hi) in idx.get(m["K"], {}).items()
                       if lo and lo <= int(m["a"]) <= hi}
        bb = set()
        for m in r["r"]:
            m["K"] = bi.KEY(m, idx)
            if bi.good_number(m.get("a"), r["t"]):
                bb |= {bn for bn, (lo, hi) in idx.get(m["K"], {}).items()
                       if lo and lo <= int(m["a"]) <= hi}
        if hb and bb:
            both_blocks += 1
            if hb & bb:
                same_b += 1
            else:
                extra_b += 1
                diff_rows.append((r, sorted(hb), sorted(bb)))
    print(f"\n  of the non-overlapping ones, both sides reach a BLOCK  {both_blocks:,}")
    print(f"     and it is the same block anyway                     {same_b:,}")
    print(f"     and they are different blocks                       {extra_b:,}")
    print(f"\n  every row where the header and the body reach DIFFERENT blocks:")
    for r, hb, bb in diff_rows:
        stem = r["v"].split(":", 1)[1]
        print(f"\n    header -> {hb}   body -> {bb}")
        print(f"      https://sfbos.org/sites/default/files/{stem}_minutes.pdf#page={r['page']}")
        print(f"      HEADER  {r['hp'][:140]}")
        print(f"      ITEM    {re.sub(r'[ ]+', ' ', r['t'])[:200]}")
    print(f"\n  {min(k, len(clashes))} read by hand:")
    for r, hs, bs in clashes[:k]:
        stem = r["v"].split(":", 1)[1]
        print(f"\n  header: {hs}\n  body  : {bs}")
        print(f"      https://sfbos.org/sites/default/files/{stem}_minutes.pdf#page={r['page']}")
        print(f"      HEADER  {r['hp'][:150]}")
        print(f"      ITEM    {re.sub(r'[ ]+', ' ', r['t'])[:220]}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--items", metavar="BASELINE_ITEMS")
    ap.add_argument("--clash", action="store_true")
    ap.add_argument("--ladder", metavar="BASELINE_ITEMS",
                    help="A -> B -> C, one change at a time")
    ap.add_argument("-k", type=int, default=10)
    a = ap.parse_args()
    if a.ladder:
        do_ladder(a.ladder)
    if a.items:
        do_items(a.items)
    if a.clash:
        do_clash(a.k)
    if not (a.items or a.clash or a.ladder):
        ap.error("one of --ladder BASELINE / --items BASELINE / --clash")


if __name__ == "__main__":
    main()
