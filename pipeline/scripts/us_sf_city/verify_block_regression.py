"""Prove a new ingest did not move a single decision from before the era cut.

The comparison — read two published builds, split each unit's rows on a year,
compare only the older half element for element — is `citymap/blocklayer.py` and
knows no city. What is here is San Francisco's: **the cut year, and where it
comes from.**

    CUT = 1999

is not a round number and not a default. It is where this record series changes
form: the Board's bound *Journal of Proceedings* runs 1906–1999 and the Clerk's
born-digital minutes begin afterwards. Everything before it was built, ranked and
published from one corpus; everything after arrived later. `citymap` has no
default for it on purpose, because an era boundary is a fact about one series and
a shared default would be this number quietly inherited by the next city.

WHY A DIFF OF THE WHOLE FILE IS NOT THE TEST. The files MUST change — that is the
point of the ingest. What must not change is the pre-cut SUBSET.

THE MECHANISM IT IS ACTUALLY HUNTING. `build_index.py` drops near-duplicate
readings inside a block. A modern decision that outranks a 1912 one can enter
that comparison first and suppress the 1912 row that used to be kept. Nothing
about that is visible in a row count; it is one sentence quietly leaving a block
it used to be on.

    python3 verify_block_regression.py --baseline <dir> --current <dir>

Both directories are `blocks/out/`. Exit code is non-zero if anything moved.
"""
from __future__ import annotations

import argparse
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from citymap.blocklayer import compare_before, load_blocks  # noqa: E402

# The Journal of Proceedings ends and the Clerk's own PDFs begin. See the module
# docstring — this belongs to this record series and travels nowhere.
CUT = 1999


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--baseline", required=True)
    ap.add_argument("--current", required=True)
    ap.add_argument("--cut", type=int, default=CUT)
    ap.add_argument("--out", help="write every moved pre-CUT decision to this TSV")
    a = ap.parse_args()
    cut = a.cut

    bp = load_blocks(pathlib.Path(a.baseline))
    cp = load_blocks(pathlib.Path(a.current))
    print(f"  baseline  {len(bp):,} blocks with rows, "
          f"{sum(len(v) for v in bp.values()):,} decisions")
    print(f"  current   {len(cp):,} blocks with rows, "
          f"{sum(len(v) for v in cp.values()):,} decisions")

    lost_blocks = sorted(set(bp) - set(cp))
    gained_blocks = sorted(set(cp) - set(bp))
    print(f"  blocks that lost their entry entirely: {len(lost_blocks)}")
    print(f"  blocks that gained an entry:           {len(gained_blocks)}")

    changed, n_old_base, n_old_cur = compare_before(bp, cp, cut)
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
