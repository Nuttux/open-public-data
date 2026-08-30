#!/usr/bin/env python3
"""Read a slice of the unclassified tail, or write labels back against one.

    tail_batch.py --start 1 --n 800          > /tmp/u1.txt
    tail_batch.py --apply /tmp/u1labels.txt

READING prints one line per unit: `{rank}|{count}|{year}|{heading}|{example}`.
The count is how many records the label will cover — 1 for a unit that is a
single record. Truncation is deliberate: the operative clause of a Board record
is its first few dozen words ("Ordinance accepting the roadway of X for
maintenance"), and that is what the label turns on.

WRITING takes a ranges-and-codes file — `12 ACC`, `40-57 V`, one per line —
expands the codes against /tmp/codes.txt and the taxonomy, and appends

  a form unit    -> form_labels_c.tsv   keyed by the form string
  a record unit  -> record_labels.tsv   keyed by the record id
  the code SPLIT -> split.txt           the form is too generic to read as one
                                        thing; from the next make_tail.py run
                                        its records are read individually

Keys are strings, never ranks, so the files keep working after the tail shrinks
and the ranking moves.
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
UNITS = os.path.join(SCRATCH, "units.jsonl")
FORM_OUT = os.path.join(SCRATCH, "form_labels_c.tsv")
REC_OUT = os.path.join(SCRATCH, "record_labels.tsv")
SPLIT_OUT = os.path.join(SCRATCH, "split.txt")


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
    ap.add_argument("--n", type=int, default=800)
    ap.add_argument("--width", type=int, default=92)
    ap.add_argument("--apply")
    ap.add_argument("--codes", default="/tmp/codes.txt")
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
            head = " ".join(d["h"].split())[:30]
            bits = [str(rank), str(d["n"]), str(d["y"] or "")]
            if head:
                bits.append(head)
            bits.append(" ".join(d["ex"].split())[: args.width])
            print("|".join(bits))
        return

    codes = load_codes(args.codes)
    check_codes(codes)

    seen_form = existing_keys(FORM_OUT)
    seen_rec = existing_keys(REC_OUT)
    split = {l.rstrip("\n") for l in open(SPLIT_OUT, encoding="utf-8")} \
        if os.path.exists(SPLIT_OUT) else set()

    form_rows: list[str] = []
    rec_rows: list[str] = []
    new_split: list[str] = []
    covered: set[int] = set()
    records = 0

    for raw in open(args.apply, encoding="utf-8"):
        raw = raw.strip()
        if not raw or raw.startswith("#"):
            continue
        span, _, code = raw.partition(" ")
        code = code.strip()
        if code != "SPLIT" and code not in codes:
            sys.exit(f"unknown code {code!r} on line {raw!r}")
        lo, hi = parse_span(span)
        for rank in range(lo, hi + 1):
            if rank in covered:
                sys.exit(f"rank {rank} labelled twice")
            covered.add(rank)
            d = units.get(rank)
            if d is None:
                sys.exit(f"rank {rank} not in {UNITS}")
            if code == "SPLIT":
                if d["kind"] != "form":
                    sys.exit(f"rank {rank} is a single record — SPLIT is meaningless")
                if d["key"] not in split:
                    split.add(d["key"])
                    new_split.append(d["key"])
                continue
            if d["kind"] == "form":
                if d["key"] in seen_form:
                    continue
                seen_form.add(d["key"])
                form_rows.append("\t".join((d["key"],) + codes[code]))
            else:
                if d["key"] in seen_rec:
                    continue
                seen_rec.add(d["key"])
                rec_rows.append("\t".join((d["key"],) + codes[code]))
            records += d["n"]

    for path, rows in ((FORM_OUT, form_rows), (REC_OUT, rec_rows)):
        if rows:
            with open(path, "a", encoding="utf-8") as fh:
                for row in rows:
                    fh.write(row + "\n")
    if new_split:
        with open(SPLIT_OUT, "a", encoding="utf-8") as fh:
            for k in new_split:
                fh.write(k + "\n")

    print(f"{len(covered)} units | {len(form_rows)} forms + {len(rec_rows)} records "
          f"labelled, covering {records:,} records | {len(new_split)} split")


if __name__ == "__main__":
    main()
