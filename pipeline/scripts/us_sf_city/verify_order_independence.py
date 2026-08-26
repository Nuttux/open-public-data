"""Prove THIS city's block index does not depend on the order of its input.

The mechanism — shuffle, build, hash, compare — is `citymap/orderindep.py` and
knows no city. What is here is the one thing that is San Francisco's: **how this
city's builder is invoked.** It is a subprocess, its corpus and its output
directory are passed through three environment variables, and it is run from its
own directory because it resolves siblings relative to itself.

That is the whole of the fork, and it is eleven lines. A second city's index is a
different eleven lines in its own directory; nothing registers with anything.

WHY THE TEST EXISTS. The near-duplicate pass used to walk a block's rows in rank
order and compare each against a sliding window of what it had already kept, so
WHICH member of a near-identical set survived depended on what arrived first.
That is why merging new volumes moved pre-1999 decisions that had nothing to do
with the new data. The pass is a clustering with a content-elected representative
now, which SHOULD make the output a function of the corpus alone — and "should"
is not a test.

    python3 verify_order_independence.py            two shuffles
    python3 verify_order_independence.py --seeds 1 2 3
    python3 verify_order_independence.py --items <jsonl>

`--items` tests a corpus that is not the canonical one — the merged
archive+sfbos corpus, for instance — WITHOUT touching it. Neither
`blocks/cache/items.jsonl` nor `blocks/out/` is written at any point.
"""
from __future__ import annotations

import argparse
import os
import pathlib
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from citymap import orderindep  # noqa: E402

REPO = pathlib.Path(__file__).resolve().parents[3]
# The BUILDER is in the repo; its DATA tree is not. ADR-0012 §4.7 / blocks/_paths.py.
BLK = REPO / "pipeline" / "scripts" / "us_sf_city" / "blocks"
BLKDATA = pathlib.Path(os.environ.get("CITY_DATA")
                       or (REPO / "scratchpad" / "sf-city-anim")) / "blocks"
ITEMS = BLKDATA / "cache" / "items.jsonl"

# Written by the build as provenance rather than as published content: counters,
# not what a reader sees. They legitimately differ between runs.
NOT_PUBLISHED = ("unplaced.json", "shards.json")


def build(items: pathlib.Path, out_dir: pathlib.Path) -> None:
    """San Francisco's block index, invoked. The only city-shaped thing here."""
    env = dict(os.environ,
               BLOCKS_ITEMS=str(items), BLOCKS_OUT=str(out_dir),
               BLOCKS_JOINED=str(out_dir.parent / f"joined.{out_dir.name}.json"))
    r = subprocess.run([sys.executable, "build_index.py"], cwd=str(BLK),
                       capture_output=True, text=True, env=env)
    if r.returncode != 0:
        print(r.stdout[-3000:])
        print(r.stderr[-3000:])
        sys.exit("build_index.py failed")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seeds", type=int, nargs="+", default=[101, 202])
    ap.add_argument("--items", default=str(ITEMS),
                    help="corpus to test (default: blocks/cache/items.jsonl). "
                         "It is READ ONLY — the shuffle goes to a temp file.")
    a = ap.parse_args()

    ok = orderindep.verify(build, pathlib.Path(a.items), a.seeds,
                           skip=NOT_PUBLISHED)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
