#!/usr/bin/env python3
"""Read a slice of the subject pass, or write labels back against one.

    subject_batch.py --start 1 --n 350 --width 230   > /tmp/s1.txt
    subject_batch.py --apply /tmp/s1labels.txt

Same shape as `tail_batch.py`, three deliberate differences:

  1. IT WRITES TOPIC AND SUBTOPIC ONLY. Every record here already carries a
     `record_type` and an `action` that were read in the main pass and are
     right. A code like `SW` means `decision|the-street|street-works|ordered`;
     this pass takes `the-street|street-works` from it and DISCARDS the rest.
     Nothing here can change what the Board did, only what it was about.

  2. ITS KEYS ARE PURPOSE CLAUSES, NEVER `form_b`. See make_subjects.py — these
     records share their opening formula with rows that are already correctly
     topiced, so a label keyed on that form would reach back and overwrite them.

  3. THERE IS NO `SPLIT`. A purpose-clause form is by construction the part of
     the line that carries the subject; if it is too generic to answer, the
     honest label is `NONE`, which records that a person read it and the line
     does not say. That is a result, not a deferral, and it is kept so the
     "no subject" count stays auditable rather than becoming a silent blank.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from _paths import REPO  # noqa: E402
from apply_batch_labels import check_codes, load_codes  # noqa: E402

SCRATCH = os.path.join(REPO, "scratchpad", "sf-classify")
UNITS = os.path.join(SCRATCH, "subject_units.jsonl")
OUT = os.path.join(SCRATCH, "subject_labels.tsv")


def existing_keys(path: str) -> set[str]:
    if not os.path.exists(path):
        return set()
    return {l.split("\t", 1)[0] for l in open(path, encoding="utf-8") if l.strip()}


def parse_span(span: str) -> tuple[int, int]:
    if "-" in span:
        a, b = span.split("-", 1)
        return int(a), int(b)
    return int(span), int(span)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=int, default=1)
    ap.add_argument("--n", type=int, default=350)
    ap.add_argument("--width", type=int, default=230)
    ap.add_argument("--apply")
    ap.add_argument("--codes", default=os.path.join(SCRATCH, "codes.txt"))
    args = ap.parse_args()

    units = {}
    for line in open(UNITS, encoding="utf-8"):
        d = json.loads(line)
        units[d["rank"]] = d

    if not args.apply:
        for rank in range(args.start, args.start + args.n):
            d = units.get(rank)
            if not d:
                break
            print("|".join([str(rank), str(d["n"]), str(d["y"] or ""),
                            d["action"][:4],
                            " ".join(d["ex"].split())[: args.width]]))
        return

    codes = load_codes(args.codes)
    check_codes(codes)

    seen = existing_keys(OUT)
    rows: list[str] = []
    covered: set[int] = set()
    records = 0
    n_none = 0

    for raw in open(args.apply, encoding="utf-8"):
        raw = raw.strip()
        if not raw or raw.startswith("#"):
            continue
        span, _, code = raw.partition(" ")
        code = code.strip()
        if code != "NONE" and code not in codes:
            sys.exit(f"unknown code {code!r} on line {raw!r}")
        lo, hi = parse_span(span)
        for rank in range(lo, hi + 1):
            if rank in covered:
                sys.exit(f"rank {rank} labelled twice")
            covered.add(rank)
            d = units.get(rank)
            if d is None:
                sys.exit(f"rank {rank} not in {UNITS}")
            if d["key"] in seen:
                continue
            seen.add(d["key"])
            if code == "NONE":
                # READ, AND THE LINE DOES NOT SAY. Written down rather than
                # skipped, so that "no subject" is a measured answer.
                rows.append("\t".join((d["kind"], d["key"], "", "")))
                n_none += 1
            else:
                _rt, top, sub, _act = codes[code]
                if not top:
                    sys.exit(f"code {code!r} carries no topic — useless here")
                rows.append("\t".join((d["kind"], d["key"], top, sub)))
            records += d["n"]

    if rows:
        with open(OUT, "a", encoding="utf-8") as fh:
            for row in rows:
                fh.write(row + "\n")

    print(f"{len(covered)} units | {len(rows)} written, covering {records:,} "
          f"records | {n_none} read as having no subject")


if __name__ == "__main__":
    main()
