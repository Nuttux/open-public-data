"""Prove the modern ingest did not move a single pre-1999 decision.

The map has 1906-1999 working: 4,679 blocks with records, decade rails, leads,
page citations. Seventeen new years are being merged into the SAME index, and
the index re-ranks, re-deduplicates and re-shards everything each time it runs.
So "the old data is still there" is not something to assume. It is something to
assert, block by block and decision by decision.

WHY A DIFF OF THE WHOLE FILE IS NOT THE TEST. The files MUST change — that is
the point of the ingest. What must not change is the pre-1999 SUBSET. So this
splits every block's decision list on the year and compares only the old half,
element for element, in order.

THE MECHANISM IT IS ACTUALLY HUNTING. build_index.py drops near-duplicate
readings inside a block, comparing each candidate against the rows already kept,
IN RANK ORDER. A modern decision that outranks a 1912 one now enters that
comparison first, and can suppress the 1912 row that used to be kept. Nothing
about that is visible in a row count; it is one sentence quietly leaving a block
it used to be on. That is what this looks for.

    python3 verify_block_regression.py --baseline <dir> --current <dir>

Both directories are `blocks/out/`. Exit code is non-zero if anything moved.
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import sys

CUT = 1999          # a decision from before this year must be untouched


def load(dirp: pathlib.Path) -> tuple[dict, dict]:
    idx = json.loads((dirp / "block-index.json").read_text())
    per: dict[str, list] = {}
    for p in sorted(dirp.glob("block-*.json")):
        if p.name == "block-index.json":
            continue
        for b, v in json.loads(p.read_text()).items():
            rows = v["d"] if isinstance(v, dict) else v
            per[b] = rows
    return idx, per


def key(r: dict) -> tuple:
    """Everything a reader can see about one decision."""
    return (r.get("y"), r.get("d"), r.get("k"), r.get("p"), r.get("f"),
            r.get("a"), r.get("u"), r.get("t"), r.get("g"))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--current", required=True)
    ap.add_argument("--cut", type=int, default=CUT)
    ap.add_argument("--out", help="write every moved pre-CUT decision to this TSV")
    a = ap.parse_args()
    cut = a.cut

    bi, bp = load(pathlib.Path(a.baseline))
    ci, cp = load(pathlib.Path(a.current))
    print(f"  baseline  {len(bp):,} blocks with rows, "
          f"{sum(len(v) for v in bp.values()):,} decisions")
    print(f"  current   {len(cp):,} blocks with rows, "
          f"{sum(len(v) for v in cp.values()):,} decisions")

    lost_blocks = sorted(set(bp) - set(cp))
    gained_blocks = sorted(set(cp) - set(bp))
    print(f"  blocks that lost their entry entirely: {len(lost_blocks)}")
    print(f"  blocks that gained an entry:           {len(gained_blocks)}")

    changed: list[tuple] = []
    n_old_base = n_old_cur = 0
    for b, rows in bp.items():
        old = [key(r) for r in rows if (r.get("y") or 0) < cut]
        n_old_base += len(old)
        now = [key(r) for r in cp.get(b, []) if (r.get("y") or 0) < cut]
        n_old_cur += len(now)
        if old != now:
            so, sn = set(old), set(now)
            changed.append((b, len(old), len(now), sorted(so - sn), sorted(sn - so)))
    print(f"\n  pre-{cut} decisions, baseline {n_old_base:,} / current {n_old_cur:,}")

    if not changed:
        print(f"\n  PASS — every pre-{cut} decision on every block is unchanged, "
              f"element for element and in the same order.")
        return

    dropped = sum(len(c[3]) for c in changed)
    added = sum(len(c[4]) for c in changed)
    if a.out:
        # THE WHOLE MOVE, so a human can read it before anything publishes.
        # A deliberate one-time move is fine; an uncounted one is how this
        # situation arose in the first place.
        with open(a.out, "w") as f:
            f.write("direction\tblock\tyear\tdate\tpage\ttext\n")
            for b, _no, _nn, gone, new in changed:
                for g in gone:
                    f.write(f"LOST\t{b}\t{g[0]}\t{g[1]}\t{g[6]}\t"
                            f"{(g[7] or '')[:300]}\n")
                for g in new:
                    f.write(f"NEW\t{b}\t{g[0]}\t{g[1]}\t{g[6]}\t"
                            f"{(g[7] or '')[:300]}\n")
        print(f"  full move list written to {a.out} "
              f"({dropped + added} rows across {len(changed)} blocks)")
    print(f"\n  FAIL — {len(changed)} blocks changed before {cut}: "
          f"{dropped} decisions dropped, {added} appeared, "
          f"and order changes besides.")
    for b, no, nn, gone, new in changed[:25]:
        print(f"    block {b}: {no} -> {nn}")
        for g in gone[:3]:
            print(f"       LOST  {g[0]} {str(g[6])[:40]}  {str(g[7])[:70]}")
        for g in new[:3]:
            print(f"       NEW   {g[0]} {str(g[6])[:40]}  {str(g[7])[:70]}")
    sys.exit(1)


if __name__ == "__main__":
    main()
