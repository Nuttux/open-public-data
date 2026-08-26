"""Prove the block index does not depend on the order of its input.

The near-duplicate pass used to walk a block's rows in rank order and compare
each against a sliding window of what it had already kept, so WHICH member of a
near-identical set survived depended on what arrived first. That is why merging
new volumes moved pre-1999 decisions that had nothing to do with the new data.

The pass is now a clustering with a content-elected representative, which should
make the output a function of the corpus alone. "Should" is not a test, so this
is the test: **shuffle the input and build twice; every published byte must
match.**

It is a test that can fail. Run it against the pre-redesign build_index.py and it
does — that is the point.

    python3 verify_order_independence.py            two shuffles
    python3 verify_order_independence.py --seeds 1 2 3

It shuffles a corpus, runs `blocks/build_index.py` on it, and hashes every file
it writes.

    python3 verify_order_independence.py --items <jsonl>

`--items` tests a corpus that is not the canonical one — the merged
archive+sfbos corpus, for instance — WITHOUT touching it. The shuffle is written
to a temporary file and the build is pointed at it through `BLOCKS_ITEMS` /
`BLOCKS_OUT`, so neither `blocks/cache/items.jsonl` nor `blocks/out/` is
modified at any point. With no `--items` the default corpus is tested the same
way, which is why the old in-place shuffle-and-restore is gone: a `finally` that
restores 155 MB is a worse guarantee than never writing to it.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import json
import pathlib
import random
import shutil
import subprocess
import sys
import tempfile

REPO = pathlib.Path(__file__).resolve().parents[3]
# The BUILDER is in the repo; its DATA tree is not. ADR-0012 §4.7 / blocks/_paths.py.
BLK = REPO / "pipeline" / "scripts" / "us_sf_city" / "blocks"
BLKDATA = pathlib.Path(os.environ.get("CITY_DATA")
                       or (REPO / "scratchpad" / "sf-city-anim")) / "blocks"
ITEMS = BLKDATA / "cache" / "items.jsonl"
OUT = BLKDATA / "out"


def digest(out_dir: pathlib.Path) -> dict[str, str]:
    out = {}
    for p in sorted(out_dir.rglob("*.json")):
        # provenance files carry counters, not published content
        if p.name in ("unplaced.json", "shards.json"):
            continue
        out[str(p.relative_to(out_dir))] = hashlib.sha256(p.read_bytes()).hexdigest()
    return out


def build(items: pathlib.Path, out_dir: pathlib.Path, joined: pathlib.Path) -> None:
    env = dict(os.environ,
               BLOCKS_ITEMS=str(items), BLOCKS_OUT=str(out_dir),
               BLOCKS_JOINED=str(joined))
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

    src = pathlib.Path(a.items)
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="orderindep-"))
    print(f"  corpus {src}")
    print(f"  scratch {tmp}   (canonical cache/ and out/ are never written)")

    rows = src.read_text().splitlines()
    print(f"  {len(rows):,} rows")
    digests = []
    try:
        for s in a.seeds:
            rnd = random.Random(s)
            shuffled = rows[:]
            rnd.shuffle(shuffled)
            items = tmp / f"items.{s}.jsonl"
            out_dir = tmp / f"out.{s}"
            out_dir.mkdir(exist_ok=True)
            items.write_text("\n".join(shuffled) + "\n")
            print(f"  seed {s}: input shuffled, building…", flush=True)
            build(items, out_dir, tmp / f"joined.{s}.json")
            d = digest(out_dir)
            digests.append((s, d))
            print(f"    {len(d)} published files hashed")

        base_s, base = digests[0]
        ok = True
        for s, d in digests[1:]:
            if set(d) != set(base):
                ok = False
                print(f"  FAIL seed {s}: file SET differs "
                      f"({sorted(set(d) ^ set(base))[:5]})")
                continue
            diff = [k for k in base if base[k] != d[k]]
            if diff:
                ok = False
                print(f"  FAIL seed {s}: {len(diff)} of {len(base)} files differ")
                for k in diff[:10]:
                    print(f"      {k}")
            else:
                print(f"  seed {s} == seed {base_s}: all {len(base)} files identical")
        print("\n  PASS — the index is a function of the corpus, not of its order."
              if ok else "\n  FAIL — the index still depends on input order.")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
