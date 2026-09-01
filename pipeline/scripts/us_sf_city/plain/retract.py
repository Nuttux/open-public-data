# -*- coding: utf-8 -*-
"""TAKE LINES BACK OUT OF THE STORE SO THEY CAN BE WRITTEN AGAIN.

    python3 pipeline/scripts/us_sf_city/plain/retract.py ids.json --why "..."

── WHY THIS EXISTS ─────────────────────────────────────────────────────────
The store is append-only and that is right for a writing run: a line goes in
once, checked, and nothing rewrites it behind your back. But a line can be
wrong for a reason that is not the writer's — a rule given to the writers was
itself wrong — and then the correct move is to take those lines out and write
them again, not to patch them in place.

The first case was the square brackets. Workers were told "the bracketed
phrase IS the subject". For a bracket at the START of a chunk that is true.
For a bracket at the END, after a DIFFERENT file number, it is the next item's
heading, and 614 lines were written about the wrong act of the Board — each
one fluent, each word of it real, and attached to the record above the one it
describes. The gate cannot see that: every word in the line IS in the record.

Retracted rows are written to `retracted.jsonl` with the reason and the date,
so the corpus keeps its own history rather than quietly losing 614 lines.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
DATA = pathlib.Path("/Users/daniel/code/open-public-data/pipeline/data/sf_bos")
STORE = DATA / "plain_lines.jsonl"
LOG = DATA / "retracted.jsonl"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", help="a JSON list of ids, or a .jsonl with an 'id' field")
    ap.add_argument("--why", required=True, help="recorded on every retracted row")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    p = pathlib.Path(args.ids)
    raw = p.read_text()
    if p.suffix == ".jsonl":
        ids = {json.loads(l)["id"] for l in raw.splitlines() if l.strip()}
    else:
        ids = set(json.loads(raw))

    rows = [json.loads(l) for l in STORE.open()]
    keep = [r for r in rows if r["id"] not in ids]
    gone = [r for r in rows if r["id"] in ids]

    print(f"store {len(rows):,} rows")
    print(f"  retracting {len(gone):,}  (of {len(ids):,} ids given)")
    print(f"  remaining  {len(keep):,}")
    if args.dry_run:
        for g in gone[:5]:
            print(f"    - {g['id']}  {g['line']}")
        return

    with LOG.open("a") as fh:
        for g in gone:
            fh.write(json.dumps({**g, "retracted_because": args.why},
                                ensure_ascii=False) + "\n")
    tmp = STORE.with_suffix(".jsonl.tmp")
    with tmp.open("w") as fh:
        for r in keep:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
    tmp.replace(STORE)
    print(f"\nlogged to {LOG.name}; they are queued for writing again")


if __name__ == "__main__":
    main()
