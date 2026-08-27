"""Does every sentence we wrote still stand on a record that says so?

A written paragraph is the one thing on these pages the city did not write, so
it carries a list of the records each clause stands on. That list is only worth
something if it is checked: a quote that was tidied up, a page reference that
does not exist, a year that drifted — each of them turns the audit trail into
decoration.

This checks all three, mechanically, against the published shards:

  · the page (`u`) exists in the corpus
  · the year matches the record on that page
  · the quoted text is the record's OWN text, not a cleaned-up version of it

The third is the one that catches me. Writing these I quietly repaired the
scanner's mistakes — `Baumcmn` back to `Baumann`, `Cruthorizing` to
`Authorizing` — which reads better and is exactly the thing an audit trail may
not do. The record's text is the evidence; if it is unreadable, that is a fact
about the record and the paragraph should lean on a different one.

Run:
    python3 pipeline/scripts/us_sf_city/check_hood_summaries.py
Exit code 1 if anything fails, so it can gate a build.
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BLOCKS = os.path.join(ROOT, "website/public/data/us/sf/city/blocks")
SEED = os.path.join(ROOT, "pipeline/seeds/countries/us/sf_hood_summaries.json")

# our own truncation marker, and whitespace, are not differences
TRIM = re.compile(r"[…]+\s*$")


def norm(s: str) -> str:
    return " ".join(TRIM.sub("", s).split()).strip(" .,;:")


def main() -> int:
    seed = json.load(open(SEED))
    wanted: dict[str, list] = {}
    for hid, h in seed.get("hoods", {}).items():
        for s in h.get("sources", []):
            wanted.setdefault(s["u"], []).append((hid, h["name"], s))

    found: dict[str, list] = {u: [] for u in wanted}
    for fn in sorted(glob.glob(os.path.join(BLOCKS, "block-*.json"))):
        for _bid, rec in json.load(open(fn)).items():
            if not isinstance(rec, dict):
                continue
            for r in rec.get("d", []):
                if isinstance(r, dict) and r.get("u") in found:
                    found[r["u"]].append(r)

    bad = 0
    checked = 0
    for u, entries in wanted.items():
        rows = found.get(u, [])
        for hid, name, s in entries:
            checked += 1
            if not rows:
                print(f"  MISSING PAGE  [{name}] {u}\n      for: {s['for']}")
                bad += 1
                continue
            q = norm(s["t"])
            hit = next((r for r in rows if norm(r.get("t", "")).startswith(q[:60])), None)
            if hit is None:
                near = min(rows, key=lambda r: abs(r.get("y", 0) - s["y"]))
                print(f"  QUOTE NOT ON PAGE  [{name}] {u}")
                print(f"      for:   {s['for']}")
                print(f"      wrote: {q[:110]}")
                print(f"      page:  {norm(near.get('t',''))[:110]}")
                bad += 1
                continue
            if hit.get("y") != s["y"]:
                print(f"  WRONG YEAR  [{name}] {u}: wrote {s['y']}, record says {hit['y']}")
                print(f"      for: {s['for']}")
                bad += 1

    print(f"\n{checked} sourced clauses checked across "
          f"{len(seed.get('hoods', {}))} paragraphs · {bad} problem(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
