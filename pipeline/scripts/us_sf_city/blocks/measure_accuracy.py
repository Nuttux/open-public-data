"""How often does "a decision happened HERE" land on the right block?

The index infers position from the words of the record. The record itself
occasionally prints the answer — "Assessor's Block 2622" — and where it does, the
inferred join can be run again as if it had not, and scored. That is the only
ground truth available, and it is genuine: nothing in the addr / segment / corner
join reads the stated block.

    python3 blocks/measure_accuracy.py   ->  blocks/out/accuracy.json  (~4 min)

The first pass runs the SAME locate() the shipped index was built with, and the
tier counts it returns are asserted equal to the ones in the shipped
block-index.json. If that assertion fails the measurement is stale and it refuses
to write, so the figure the page prints can never describe a different index from
the one it is printing beside.
"""
import collections, json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_index as BI

import sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Code in the repo, data under CITY_DATA. See _paths.py.
from _paths import OUT  # noqa: F401
HERE = os.path.dirname(os.path.abspath(__file__))

# One block face. San Francisco's median block is about 110 m on its long side, so
# a placement one block off is roughly this far out and no further.
FACE_M = 120.0
NEAR_M = 250.0
FAR_M = 600.0


def main():
    idx = BI.street_index()
    blocks = json.load(open(os.path.join(BI.GEO, "blocks.json")))
    idx = BI.geometry_guard(idx, blocks)
    idx = {k: v for k, v in idx.items() if v}
    bmeta = {b["b"]: b for b in blocks}
    bpos = {b["b"]: (b["cx"], b["cy"]) for b in blocks}
    order = {b["b"]: i for i, b in enumerate(blocks)}
    items, _npre, _nnew = BI.load_items()

    TN = {4: "stated", 3: "addr", 2: "segment", 1: "corner", 0: "street"}

    # ---- pass 1: exactly what shipped -----------------------------------
    placed, _unpl, tier_n = BI.locate(items, idx, bmeta, bpos, order, use_stated=True)
    shipped = json.load(open(os.path.join(OUT, "block-index.json")))["meta"]["precision_counts"]
    got = {TN[k]: v for k, v in tier_n.items()}
    if got != shipped:
        sys.exit(f"STALE: locate() no longer reproduces the shipped index.\n"
                 f"  shipped {shipped}\n  now     {got}\n"
                 f"Rebuild out/ before measuring it.")
    print("pass 1 reproduces the shipped index exactly:", got, flush=True)

    # the stated blocks, per item — the answer key
    truth = {}
    for did, r in enumerate(items):
        sb = BI.stated_blocks(r["t"], bmeta)
        if sb and len(sb) <= 4:
            truth[did] = sb

    # ---- pass 2: the same join, blind to the stated block ---------------
    blind, _u2, _t2 = BI.locate(items, idx, bmeta, bpos, order, use_stated=False)
    print("pass 2 (stated-blind) placed", len(blind), "items", flush=True)

    by_tier = collections.defaultdict(lambda: collections.Counter())
    tot = collections.Counter()
    dists = []
    for did, tier, hits, _f in blind:
        if did not in truth or tier < 1:
            continue                      # block precision only; street tier is §2's other section
        want = set(truth[did])
        exact = bool(want & set(hits))
        # distance from the nearest inferred block to the nearest stated one
        d = min((math.dist(bpos[h], bpos[w]) for h in hits if h in bpos
                 for w in want if w in bpos), default=float("inf"))
        for bucket, ok in (("exact", exact), ("face", exact or d <= FACE_M),
                           ("near", exact or d <= NEAR_M), ("far", not exact and d > FAR_M)):
            if ok:
                by_tier[TN[tier]][bucket] += 1
                tot[bucket] += 1
        by_tier[TN[tier]]["n"] += 1
        tot["n"] += 1
        if d < float("inf"):
            dists.append(d)

    n = tot["n"]
    if n < 50:
        sys.exit(f"only {n} ground-truth placements — too few to publish a rate")
    acc = {
        "n": n,
        "exact": round(100.0 * tot["exact"] / n, 1),
        "within_one_block_face": round(100.0 * tot["face"] / n, 1),
        "within_250m": round(100.0 * tot["near"] / n, 1),
        "over_600m": round(100.0 * tot["far"] / n, 1),
        "face_m": FACE_M, "near_m": NEAR_M, "far_m": FAR_M,
        "by_tier": {k: {"n": v["n"], "exact": round(100.0 * v["exact"] / v["n"], 1),
                        "within_one_block_face": round(100.0 * v["face"] / v["n"], 1)}
                    for k, v in sorted(by_tier.items()) if v["n"]},
        "street_tier_note": (
            "Street-tier decisions name a street and nothing else, so they are not "
            "scored here at all: they are not a claim about a block."),
        "method": ("Every decision whose text prints its own assessor block, joined "
                   "again with that sentence hidden from the join, and scored against "
                   "what the record said. Nothing in the address, segment or corner "
                   "join reads the stated block."),
        "generated_by": "blocks/measure_accuracy.py",
    }
    p = os.path.join(OUT, "accuracy.json")
    json.dump(acc, open(p, "w"), indent=1)
    print(json.dumps(acc, indent=1))
    print("wrote", p)


if __name__ == "__main__":
    main()
