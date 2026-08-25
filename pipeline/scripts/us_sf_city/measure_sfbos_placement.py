"""How much of the sfbos.org half actually lands on a block, measured with the
SAME placement code the published index uses — build_index.locate() — so the two
eras are counted at one set of gates and the comparison is not an artefact of
two different measurements.

Read-only. Writes nothing, publishes nothing.
"""
import collections
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BLK = os.path.join(REPO, "scratchpad", "sf-city-anim", "blocks")
SFBOS = os.path.join(HERE, "cache_sfbos", "items.jsonl")

sys.path.insert(0, BLK)
_s = importlib.util.spec_from_file_location("bi", os.path.join(BLK, "build_index.py"))
bi = importlib.util.module_from_spec(_s)
_s.loader.exec_module(bi)

TN = {4: "stated", 3: "addr", 2: "segment", 1: "corner", 0: "street"}


def rows(path, only=None):
    out = []
    for r in map(json.loads, open(path)):
        if only and not only(r):
            continue
        if bi.LR(r):
            out.append(r)
    return out


def report(name, items, idx, bmeta, bpos, order):
    placed, unplaced, tier_n = bi.locate(items, idx, bmeta, bpos, order)
    tot = sum(tier_n.values())
    blockprec = sum(tier_n[k] for k in (1, 2, 3, 4))
    addr_or_better = tier_n[3] + tier_n[4]
    blocks = collections.Counter()
    for did, tier, hits, focus in placed:
        if tier >= 1:
            for bn in hits:
                blocks[bn] += 1
    print(f"\n=== {name} ===")
    print(f"  items with a resolvable street : {len(items):,}")
    print(f"  placed at any tier             : {tot:,} ({100*tot/max(1,len(items)):.1f}%)")
    print(f"  at BLOCK precision (tier>=1)   : {blockprec:,} "
          f"({100*blockprec/max(1,len(items)):.1f}% of items, "
          f"{100*blockprec/max(1,tot):.1f}% of placed)")
    print(f"  ADDRESS-or-better (tier>=3)    : {addr_or_better:,} "
          f"({100*addr_or_better/max(1,blockprec):.1f}% of block-precision rows)")
    print("  tiers:", {TN[k]: v for k, v in sorted(tier_n.items(), reverse=True)})
    print(f"  distinct blocks touched        : {len(blocks):,}")
    print("  unplaced:", dict(unplaced), f"total {sum(unplaced.values()):,}")
    return placed, tier_n, blocks


def main():
    idx = bi.street_index()
    blocks = json.load(open(os.path.join(bi.GEO, "blocks.json")))
    idx = bi.geometry_guard(idx, blocks)
    idx = {k: v for k, v in idx.items() if v}
    bmeta = {b["b"]: b for b in blocks}
    bpos = {b["b"]: (b["cx"], b["cy"]) for b in blocks}
    order = {b["b"]: i for i, b in enumerate(blocks)}
    print(f"{len(idx):,} streets, {len(blocks):,} blocks")

    sf = rows(SFBOS)
    _, _, sfblocks = report("sfbos.org PDFs 2016-07 -> 2026-04", sf,
                            idx, bmeta, bpos, order)

    ar_items, _, _ = bi.load_items()
    _, _, arblocks = report("archive.org scans (merged corpus, pre-2016-07)",
                            ar_items, idx, bmeta, bpos, order)

    both = set(sfblocks) & set(arblocks)
    print(f"\nblocks in BOTH corpora            : {len(both):,}")
    print(f"blocks ONLY in the sfbos half     : {len(set(sfblocks) - set(arblocks)):,}")

    by_year = collections.Counter()
    for r in sf:
        by_year[r["y"]] += 1
    print("\nsfbos rows by year:", dict(sorted(by_year.items())))


if __name__ == "__main__":
    main()
