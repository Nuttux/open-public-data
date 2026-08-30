#!/usr/bin/env python3
"""What is still unclassified, grouped into the units that get read.

    make_tail.py

Reads the corpus and the frozen seed and writes:

  scratchpad/sf-classify/tail.jsonl    every record with no label yet, sorted
                                       so near-identical ones sit adjacent
  scratchpad/sf-classify/units.jsonl   those records grouped into READING
                                       UNITS, commonest first

A UNIT is normally one FORM — `form_b`, the record with its preamble, numbers,
money and street names removed, cut to nine words. Records sharing a form are
the same sentence with a different address in it, so one reading covers all of
them. Reading unit by unit instead of record by record is what makes the tail
finishable: 55,697 records collapse to about 37,000 units.

SOME FORMS ARE BOILERPLATE AND MUST NOT BE READ AS ONE THING. "…as follows:
Resolved, That the following" is 221 records that have nothing in common past
those words. When a unit reads like that it gets the code `SPLIT`, its form is
written to split.txt, and from the next run every record under it is its own
unit and gets read on its own. That is the whole guard: the coarse pass is only
allowed where a person looked at the form and said it determines the answer.
"""
from __future__ import annotations

import argparse
import collections
import csv
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from _paths import CACHE, REPO  # noqa: E402
from freeze_classification import form_b  # noqa: E402

SCRATCH = os.path.join(REPO, "scratchpad", "sf-classify")
SEED = os.path.join(REPO, "pipeline", "seeds", "sf_bos_classification.csv")
SPLIT = os.path.join(SCRATCH, "split.txt")
HISTORIC = os.path.join(CACHE, "items.jsonl")
MODERN = os.path.join(REPO, "pipeline/scripts/us_sf_city/cache_sfbos/items.jsonl")


def load_rows() -> list[dict]:
    rows = []
    for path in (HISTORIC, MODERN):
        for line in open(path, encoding="utf-8"):
            r = json.loads(line)
            t = " ".join((r.get("t") or "").split())
            if len(t) <= 25:
                continue
            rows.append({
                "id": f'{r.get("v")}|{r.get("i")}',
                "y": r.get("y"),
                "h": r.get("h") or "",
                "t": t,
            })
    return rows


def load_split() -> set[str]:
    if not os.path.exists(SPLIT):
        return set()
    return {l.rstrip("\n") for l in open(SPLIT, encoding="utf-8") if l.strip()}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", default=SEED)
    args = ap.parse_args()

    rows = load_rows()
    done = set()
    if os.path.exists(args.seed):
        with open(args.seed, encoding="utf-8") as fh:
            for d in csv.DictReader(fh):
                done.add(d["id"])
    tail = [r for r in rows if r["id"] not in done]
    print(f"corpus {len(rows):,} | classified {len(done):,} | tail {len(tail):,}")

    for r in tail:
        r["f"] = form_b(r["t"])
    tail.sort(key=lambda r: (r["f"], r["id"]))
    path = os.path.join(SCRATCH, "tail.jsonl")
    with open(path, "w", encoding="utf-8") as fh:
        for i, r in enumerate(tail, 1):
            fh.write(json.dumps({**r, "i": i}, ensure_ascii=False) + "\n")
    print(f"-> {path}")

    split = load_split()
    groups: dict[tuple[str, str], list[dict]] = collections.defaultdict(list)
    for r in tail:
        if r["f"] in split:
            groups[("record", r["id"])].append(r)
        else:
            groups[("form", r["f"])].append(r)
    ranked = sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0][1]))

    path = os.path.join(SCRATCH, "units.jsonl")
    with open(path, "w", encoding="utf-8") as fh:
        for rank, ((kind, key), members) in enumerate(ranked, 1):
            m = members[0]
            fh.write(json.dumps({
                "rank": rank, "kind": kind, "key": key, "n": len(members),
                "y": m["y"], "h": m["h"][:60], "ex": m["t"][:220],
            }, ensure_ascii=False) + "\n")
    n_form = sum(1 for (k, _), _ in ranked if k == "form")
    print(f"{len(ranked):,} units ({n_form:,} forms, "
          f"{len(ranked)-n_form:,} single records), "
          f"{len(split):,} forms already split")
    print(f"-> {path}")


if __name__ == "__main__":
    main()
