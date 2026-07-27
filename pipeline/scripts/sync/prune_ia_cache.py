#!/usr/bin/env python3
"""Drop items from collections that are not admissible evidence about SF.

The IA caches accumulated whatever the full-text endpoint returned, including
fisheries journals, meteorology yearbooks and other counties' budgets that
matched a civic alias by coincidence. ia_collections.py records which
collections are admissible and why; this applies that judgement to the cache on
disk so the denied items stop costing OCR fetches, stop being re-evaluated at
linkage, and stop sitting in the repo looking like evidence.

Reversible: the discovery step (sync_ia_sf.py --force) can always re-fetch, and
the registry keeps the reason each collection was denied.

Usage:
    python pipeline/scripts/sync/prune_ia_cache.py --dry-run
    python pipeline/scripts/sync/prune_ia_cache.py
"""

from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path

from ia_collections import DENIED, tier

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "pipeline" / "cache" / "ia_sf"
KINDS = ("places", "departments", "payees")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    dropped = collections.Counter()
    kept_total = touched = 0
    for kind in KINDS:
        for path in sorted((CACHE / kind).glob("*.json")):
            d = json.loads(path.read_text())
            items = d.get("items") or []
            keep = [it for it in items if tier(it.get("collection")) != "DENIED"]
            if len(keep) == len(items):
                kept_total += len(keep)
                continue
            for it in items:
                if tier(it.get("collection")) == "DENIED":
                    dropped[it.get("collection")] += 1
            kept_total += len(keep)
            touched += 1
            if not args.dry_run:
                d["items"] = keep
                d["pruned_at"] = __import__("datetime").datetime.now(
                    __import__("datetime").timezone.utc).isoformat()
                path.write_text(json.dumps(d, indent=1, ensure_ascii=False))

    verb = "would drop" if args.dry_run else "dropped"
    print(f"{verb} {sum(dropped.values())} items across {touched} entity caches; "
          f"{kept_total} kept.")
    for c, n in dropped.most_common():
        print(f"  {n:4}  {c}  — {DENIED.get(c, 'not in registry (unreviewed)')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
