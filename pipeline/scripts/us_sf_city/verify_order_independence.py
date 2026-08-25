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

It shuffles `blocks/cache/items.jsonl`, runs `blocks/build_index.py`, hashes
every file under `blocks/out/`, and restores the original corpus and outputs
afterwards whatever happens.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import random
import shutil
import subprocess
import sys
import tempfile

REPO = pathlib.Path(__file__).resolve().parents[3]
BLK = REPO / "scratchpad" / "sf-city-anim" / "blocks"
ITEMS = BLK / "cache" / "items.jsonl"
OUT = BLK / "out"


def digest() -> dict[str, str]:
    out = {}
    for p in sorted(OUT.rglob("*.json")):
        # provenance files carry counters, not published content
        if p.name in ("unplaced.json", "shards.json"):
            continue
        out[str(p.relative_to(OUT))] = hashlib.sha256(p.read_bytes()).hexdigest()
    return out


def build() -> None:
    r = subprocess.run([sys.executable, "build_index.py"], cwd=str(BLK),
                       capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout[-3000:])
        print(r.stderr[-3000:])
        sys.exit("build_index.py failed")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seeds", type=int, nargs="+", default=[101, 202])
    a = ap.parse_args()

    tmp = pathlib.Path(tempfile.mkdtemp(prefix="orderindep-"))
    shutil.copy2(ITEMS, tmp / "items.orig.jsonl")
    if OUT.exists():
        shutil.copytree(OUT, tmp / "out.orig")
    print(f"  corpus and outputs saved to {tmp}")

    rows = open(ITEMS).read().splitlines()
    print(f"  {len(rows):,} rows")
    digests = []
    try:
        for s in a.seeds:
            rnd = random.Random(s)
            shuffled = rows[:]
            rnd.shuffle(shuffled)
            ITEMS.write_text("\n".join(shuffled) + "\n")
            print(f"  seed {s}: input shuffled, building…", flush=True)
            build()
            d = digest()
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
        shutil.copy2(tmp / "items.orig.jsonl", ITEMS)
        if (tmp / "out.orig").exists():
            shutil.rmtree(OUT, ignore_errors=True)
            shutil.copytree(tmp / "out.orig", OUT)
        print(f"  corpus and outputs restored from {tmp}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
