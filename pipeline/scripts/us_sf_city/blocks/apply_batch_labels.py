#!/usr/bin/env python3
"""Turn a hand-labelled batch into rows of record_labels.tsv.

I read the tail in batches: `make_batch.py` writes N records as
`{i}|{year}|{heading}|{text}` lines, I read them and write back a ranges file
of `{i}` or `{start}-{end}` followed by a short code. This expands the codes
against a code table (`CODE=record_type|topic|subtopic|action`) and appends
`{v}|{n}\t{record_type}\t{topic}\t{subtopic}\t{action}` to record_labels.tsv.

The point of the codes is only to keep the write-out small; every code is
expanded here against the taxonomy and validated before anything lands.

    apply_batch_labels.py --tail tail.jsonl --labels /tmp/t2labels.txt \
        --codes /tmp/codes.txt
"""
from __future__ import annotations

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
TAXONOMY = os.path.join(ROOT, "pipeline", "seeds", "sf_bos_taxonomy.json")
SCRATCH = os.path.join(ROOT, "scratchpad", "sf-classify")


def load_codes(path: str) -> dict[str, tuple[str, str, str, str]]:
    codes: dict[str, tuple[str, str, str, str]] = {}
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or "=" not in line:
            continue
        name, rest = line.split("=", 1)
        parts = rest.split("|")
        if len(parts) != 4:
            sys.exit(f"code {name}: expected 4 fields, got {len(parts)}")
        codes[name.strip()] = tuple(p.strip() for p in parts)  # type: ignore[assignment]
    return codes


def check_codes(codes: dict[str, tuple[str, str, str, str]]) -> None:
    tax = json.load(open(TAXONOMY, encoding="utf-8"))
    types = {r["slug"] for r in tax["record_types"]}
    actions = {a["slug"] for a in tax["actions"]}
    pairs = {
        (t["slug"], s["slug"]) for t in tax["topics"] for s in t["subtopics"]
    }
    bad = []
    for name, (rt, topic, sub, act) in codes.items():
        if rt not in types:
            bad.append(f"{name}: record_type {rt!r} not in taxonomy")
        if act and act not in actions:
            bad.append(f"{name}: action {act!r} not in taxonomy")
        if topic or sub:
            if (topic, sub) not in pairs:
                bad.append(f"{name}: {topic}/{sub} not a taxonomy pair")
    if bad:
        sys.exit("\n".join(bad))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tail", default=os.path.join(SCRATCH, "tail.jsonl"))
    ap.add_argument("--labels", required=True)
    ap.add_argument("--codes", default="/tmp/codes.txt")
    ap.add_argument("--out", default=os.path.join(SCRATCH, "record_labels.tsv"))
    args = ap.parse_args()

    codes = load_codes(args.codes)
    check_codes(codes)

    by_i: dict[int, str] = {}
    for line in open(args.tail, encoding="utf-8"):
        r = json.loads(line)
        by_i[r["i"]] = r["id"]

    # what is already labelled, so a re-run is idempotent and a batch that
    # overlaps an earlier one does not double-write
    seen: set[str] = set()
    if os.path.exists(args.out):
        for line in open(args.out, encoding="utf-8"):
            if line.strip():
                seen.add(line.split("\t", 1)[0])

    rows: list[str] = []
    covered: set[int] = set()
    for raw in open(args.labels, encoding="utf-8"):
        raw = raw.strip()
        if not raw or raw.startswith("#"):
            continue
        span, _, code = raw.partition(" ")
        code = code.strip()
        if code not in codes:
            sys.exit(f"unknown code {code!r} on line {raw!r}")
        if "-" in span:
            a, b = span.split("-", 1)
            lo, hi = int(a), int(b)
        else:
            lo = hi = int(span)
        for i in range(lo, hi + 1):
            if i in covered:
                sys.exit(f"index {i} labelled twice")
            covered.add(i)
            rid = by_i.get(i)
            if rid is None:
                sys.exit(f"index {i} not in {args.tail}")
            if rid in seen:
                continue
            seen.add(rid)
            rows.append("\t".join((rid,) + codes[code]))

    with open(args.out, "a", encoding="utf-8") as fh:
        for row in rows:
            fh.write(row + "\n")

    print(f"{len(covered)} indices labelled, {len(rows)} new rows -> {args.out}")


if __name__ == "__main__":
    main()
