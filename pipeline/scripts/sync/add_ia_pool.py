#!/usr/bin/env python3
"""Add one Internet Archive collection to existing entity caches, additively.

sync_ia_sf.py rebuilds an entity's `items` list from scratch on every run, which
is correct for discovery but destructive here: the caches now carry the OCR
passages that fetch_ia_ocr.py spent an hour downloading, and a re-sync would
drop them. This script queries a single collection and MERGES its hits into the
existing caches, leaving every field of every already-known item untouched.

New items arrive without `ocr_excerpts`, so the ordinary
`fetch_ia_ocr.py --kind places` run picks them up and grounds only the new ones.

Usage:
    python pipeline/scripts/sync/add_ia_pool.py \
        --collection sanfranciscoredevelopmentagencyrecords --pool sfra --kind places
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from sync_ia_sf import SLEEP, clean_snippet, fts, parse_year

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "pipeline" / "cache" / "ia_sf"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--collection", required=True)
    ap.add_argument("--pool", required=True)
    ap.add_argument("--kind", default="places", choices=["places", "departments", "payees"])
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    files = sorted((CACHE / args.kind).glob("*.json"))
    total_new = 0
    for path in files:
        d = json.loads(path.read_text())
        known = {it["identifier"] for it in d.get("items") or []}
        found: dict[str, dict] = {}
        for alias in d.get("aliases") or []:
            resp = fts(alias, args.collection)
            hits = ((resp.get("response") or {}).get("body") or {}).get("hits") or {}
            for h in hits.get("hits") or []:
                f = h.get("fields") or {}
                ident = f.get("identifier")
                if not ident or ident in known:
                    continue
                title = f.get("title") or ident
                creator = f.get("creator")
                if isinstance(creator, list):
                    creator = creator[0] if creator else None
                snip = clean_snippet(h.get("highlight"))
                prev = found.get(ident)
                if prev and len(prev.get("snippet") or "") >= len(snip):
                    continue
                found[ident] = {
                    "identifier": ident,
                    "title": title,
                    "creator": creator,
                    "year": parse_year(title, ident, f.get("year")),
                    "pool": args.pool,
                    "collection": (f.get("collection") or [args.collection])[0],
                    "matched_alias": alias,
                    "snippet": snip,
                    "url": f"https://archive.org/details/{ident}",
                }
            time.sleep(SLEEP)
        if not found:
            continue
        total_new += len(found)
        print(f"  {path.stem:34} +{len(found)}", flush=True)
        if not args.dry_run:
            d["items"] = (d.get("items") or []) + list(found.values())
            d.setdefault("totals", {})[args.pool] = len(found)
            path.write_text(json.dumps(d, indent=1, ensure_ascii=False))

    verb = "would add" if args.dry_run else "added"
    print(f"\n{verb} {total_new} items from {args.collection} across {len(files)} {args.kind}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
