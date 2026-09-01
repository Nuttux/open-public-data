# -*- coding: utf-8 -*-
"""HAND RECORDS OUT TO WRITERS, WITHOUT HANDING THE SAME ONE OUT TWICE.

    python3 pipeline/scripts/us_sf_city/plain/prep.py --slices 20 --n 300

Writes `slice-NNN.jsonl` into the work directory and records every id it
hands out in `inflight.txt`.

── WHY IN-FLIGHT IS TRACKED AND NOT INFERRED ───────────────────────────────
The first run handed 450 records to two writers each, because the prep
treated the SLICE NUMBER as identity: slice 12 was assumed to hold the same
records on Tuesday as on Monday, so a re-prep after a worker died reissued
work already in progress under a different number. Slice numbers are labels;
the ids are the identity.

So a record is skipped when it is EITHER already in the store OR already
handed out and not yet returned. `--release` puts a slice's ids back when a
worker dies, and returning lines through `harness.save` clears them.

── AND THE SLICES ARE DRAWN FROM ONE DECADE AT A TIME ──────────────────────
An earlier prep drew each slice at random from the whole corpus, which gave
every writer a slice spanning 1906 to 2026. The Board's language changes
completely across that span — the 1920s Journal is passive and the modern
Clerk's file is a bracketed title — so a writer re-learned the register on
every record. Slices are drawn from a single decade, and the decade with the
most work outstanding goes first, so the queue drains evenly.
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
# ── ORDER MATTERS: THERE IS A STALE COPY OF THE HARNESS IN /tmp ────────────
# These scripts started life in the scratch directory and `/tmp/harness.py`
# is still there, holding the FIRST run's selection. With /tmp ahead of the
# repo on the path this file imported it and reported "queued 0 of 90,443" —
# the second pass looked complete before it had begun. The repo comes first;
# /tmp is on the path only for `pred`/`render2`, which have no repo copy yet.
sys.path.insert(0, "/tmp")
sys.path.insert(0, str(HERE))

import harness as H  # noqa: E402

assert pathlib.Path(H.__file__).parent == HERE, (
    f"imported the wrong harness: {H.__file__}")

WORK = pathlib.Path("/Users/daniel/code/open-public-data/pipeline/data/sf_bos/work")
INFLIGHT = WORK / "inflight.txt"


def inflight_ids() -> set[str]:
    if not INFLIGHT.exists():
        return set()
    return {l.strip() for l in INFLIGHT.read_text().splitlines() if l.strip()}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slices", type=int, default=20)
    ap.add_argument("--n", type=int, default=300, help="records per slice")
    ap.add_argument("--release", type=str, default=None,
                    help="a slice file whose ids go back in the queue")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--decades", type=str, default=None,
                    help="comma-separated decade starts, e.g. 2010,2020 — hand "
                         "out only these. Without it every decade is drawn "
                         "from, busiest first.")
    args = ap.parse_args()

    WORK.mkdir(parents=True, exist_ok=True)
    done = H.done_ids()
    flying = inflight_ids()

    if args.release:
        ids = {json.loads(l)["id"] for l in open(args.release)}
        INFLIGHT.write_text("\n".join(sorted(flying - ids)) + "\n")
        print(f"released {len(ids & flying):,} ids from {args.release}")
        return

    recs = H.load_records()
    todo = [r for r in recs if r["id"] not in done and r["id"] not in flying]
    want = ({int(d) for d in args.decades.split(",")} if args.decades else None)
    by_dec = collections.defaultdict(list)
    for r in todo:
        d = r["y"] // 10 * 10
        if want is not None and d not in want:
            continue
        by_dec[d].append(r)

    if args.status:
        print(f"written {len(done):,} · in flight {len(flying):,} · "
              f"queued {len(todo):,} of {len(recs):,}")
        for d in sorted(by_dec):
            print(f"  {d}s  {len(by_dec[d]):6,}")
        return

    # the decade with the most outstanding goes first, so no decade is left
    # as a long tail of single slices at the end of the run
    order = sorted(by_dec, key=lambda d: -len(by_dec[d]))
    handed: list[str] = []
    made = 0
    existing = sorted(WORK.glob("slice-*.jsonl"))
    start = 1 + max((int(p.stem.split("-")[1]) for p in existing), default=0)

    di = 0
    while made < args.slices and any(by_dec[d] for d in order):
        dec = order[di % len(order)]
        di += 1
        pool = by_dec[dec]
        if not pool:
            continue
        take, by_dec[dec] = pool[:args.n], pool[args.n:]
        p = WORK / f"slice-{start + made:03d}.jsonl"
        with p.open("w") as fh:
            for r in take:
                fh.write(json.dumps(r, ensure_ascii=False) + "\n")
        handed += [r["id"] for r in take]
        print(f"  {p.name}  {len(take):4,} records  {dec}s")
        made += 1

    with INFLIGHT.open("a") as fh:
        for i in handed:
            fh.write(i + "\n")
    print(f"\n{made} slices, {len(handed):,} records handed out; "
          f"{len(todo)-len(handed):,} still queued")


if __name__ == "__main__":
    main()
