#!/usr/bin/env python3
"""Print the next slice of the unlabelled tail for reading.

One line per record: `{i}|{year}|{heading}|{text}`. The heading is only there
for the 2016+ Clerk records, which carry one; the archive.org years have none,
so the line is `{i}|{year}|{text}` for those. Truncation is deliberate — the
first ~90 characters of a Board record is the operative clause ("Ordinance
accepting the roadway of X for maintenance"), which is what the label turns on.

    make_batch.py --start 501 --n 500 > /tmp/t3.txt
"""
from __future__ import annotations

import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
SCRATCH = os.path.join(ROOT, "scratchpad", "sf-classify")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tail", default=os.path.join(SCRATCH, "tail.jsonl"))
    ap.add_argument("--start", type=int, default=1)
    ap.add_argument("--n", type=int, default=500)
    ap.add_argument("--width", type=int, default=88)
    args = ap.parse_args()

    lo, hi = args.start, args.start + args.n - 1
    for line in open(args.tail, encoding="utf-8"):
        r = json.loads(line)
        i = r["i"]
        if i < lo:
            continue
        if i > hi:
            break
        head = " ".join((r.get("h") or "").split())[:33]
        text = " ".join((r.get("t") or "").split())[: args.width]
        parts = [str(i), str(r.get("y") or "")]
        if head:
            parts.append(head)
        parts.append(text)
        print("|".join(parts))


if __name__ == "__main__":
    main()
