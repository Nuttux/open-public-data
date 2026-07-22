#!/usr/bin/env python3
"""Enrich the Internet Archive SF caches with real OCR passages.

Stage between sync_ia_sf.py (discovery: which items match, + a 280-char FTS
highlight) and link_sf_places.py (linkage). Discovery told us *that* a document
mentions a place; this step downloads the document's full OCR text
(`<id>_djvu.txt`, the free derivative IA generates for every scanned item) and
extracts the passages around the place's aliases — so the fiche and its summary
can be grounded in what the document actually SAYS, not in a match-fragment.

For each entity cache (pipeline/cache/ia_sf/<kind>/<slug>.json) it walks the
top-K items, downloads the OCR (capped read), finds every alias occurrence with
a separator-flexible match ("Coit Tower" also hits "Coit-Tower", "Coit\\nTower"),
merges overlapping windows, and writes back per item:

  ocr_status   : "ok" | "no_alias_hit" | "empty" | "missing"
  ocr_chars    : length of the OCR text pulled (pre-truncation note if capped)
  ocr_excerpts : list of cleaned passages around the aliases (grounding text)

Resumable and polite: items that already carry ocr_excerpts are skipped unless
--force; a SLEEP gap sits between downloads. Nothing here is depended on at
runtime — it only enriches the on-disk cache that link_sf_places.py reads.

Usage:
    python pipeline/scripts/sync/fetch_ia_ocr.py --only coit-tower
    python pipeline/scripts/sync/fetch_ia_ocr.py --kind places
    python pipeline/scripts/sync/fetch_ia_ocr.py --kind places --force
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "pipeline" / "cache" / "ia_sf"

UA = {"User-Agent": "sf-open-data/0.1 (civic research; contact via qipu.org)"}
DL = "https://archive.org/download/{id}/{id}_djvu.txt"

TOP_K = 10          # candidate docs per entity worth the OCR pull (curate keeps ~6+shelf)
MAX_BYTES = 5_000_000   # cap the OCR read — a few scanned books' worth is plenty
HALF_WINDOW = 350       # chars of context each side of an alias hit
MAX_WINDOWS = 6         # merged passages kept per document
MAX_EXCERPT_CHARS = 2800  # total grounding text kept per document
SLEEP = 1.2             # polite gap between OCR downloads


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def norm_ws(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()


def alias_pattern(aliases: list[str]) -> re.Pattern | None:
    """One case-insensitive regex matching any alias, tolerant of the separator
    OCR inserts between tokens (space, hyphen, newline): 'Coit Tower' -> the
    words joined by [\\W_]+, so 'Coit-Tower' and 'Coit\\nTower' both hit."""
    parts = []
    for a in aliases:
        toks = [re.escape(t) for t in a.split() if t]
        if not toks:
            continue
        parts.append(r"[\W_]+".join(toks))
    if not parts:
        return None
    return re.compile("(?:" + "|".join(parts) + ")", re.I)


def extract_excerpts(text: str, pat: re.Pattern) -> list[str]:
    """Windows around every alias hit, merged where they overlap, cleaned and
    capped. Empty list means the aliases never appear in the OCR (the FTS index
    matched on a variant the plain-text derivative doesn't carry)."""
    spans: list[tuple[int, int]] = []
    for m in pat.finditer(text):
        spans.append((max(0, m.start() - HALF_WINDOW), min(len(text), m.end() + HALF_WINDOW)))
    if not spans:
        return []
    spans.sort()
    merged: list[list[int]] = [list(spans[0])]
    for s, e in spans[1:]:
        if s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])

    out: list[str] = []
    total = 0
    for s, e in merged:
        if len(out) >= MAX_WINDOWS or total >= MAX_EXCERPT_CHARS:
            break
        frag = norm_ws(text[s:e])
        if len(frag) < 40:
            continue
        frag = frag[: MAX_EXCERPT_CHARS - total]
        out.append(frag)
        total += len(frag)
    return out


def fetch_ocr(identifier: str) -> tuple[str | None, bool]:
    """Return (text, truncated). text is None when the derivative is missing."""
    url = DL.format(id=identifier)
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read(MAX_BYTES + 1)
    except urllib.error.HTTPError as e:  # noqa: PERF203
        if e.code == 404:
            return None, False
        print(f"    HTTP {e.code} for {identifier}", file=sys.stderr)
        return None, False
    except Exception as e:  # noqa: BLE001
        print(f"    err {identifier}: {e}", file=sys.stderr)
        return None, False
    truncated = len(raw) > MAX_BYTES
    return raw[:MAX_BYTES].decode("utf-8", "replace"), truncated


def enrich_entity(path: Path, force: bool) -> tuple[int, int]:
    d = json.loads(path.read_text())
    pat = alias_pattern(d.get("aliases") or [])
    if pat is None:
        return 0, 0
    fetched = grounded = 0
    for it in (d.get("items") or [])[:TOP_K]:
        if it.get("ocr_excerpts") is not None and not force:
            if it.get("ocr_status") == "ok":
                grounded += 1
            continue
        text, truncated = fetch_ocr(it["identifier"])
        time.sleep(SLEEP)
        if text is None:
            it["ocr_status"] = "missing"
            it["ocr_chars"] = 0
            it["ocr_excerpts"] = []
            continue
        fetched += 1
        it["ocr_chars"] = len(text) + (1 if truncated else 0)  # +1 marks a capped read
        if not text.strip():
            it["ocr_status"] = "empty"
            it["ocr_excerpts"] = []
            continue
        excerpts = extract_excerpts(text, pat)
        it["ocr_excerpts"] = excerpts
        it["ocr_status"] = "ok" if excerpts else "no_alias_hit"
        if excerpts:
            grounded += 1
    d["ocr_enriched_at"] = now_iso()
    path.write_text(json.dumps(d, indent=1, ensure_ascii=False))
    return fetched, grounded


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=["places", "departments", "payees"], default="places")
    ap.add_argument("--only", help="single slug")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--workers", type=int, default=1,
                    help="parallel entities (each still spaces its own downloads by SLEEP)")
    args = ap.parse_args()

    kind_dir = CACHE / args.kind
    files = sorted(kind_dir.glob("*.json"))
    if args.only:
        files = [f for f in files if f.stem == args.only]
    if not files:
        print(f"No caches under {kind_dir} matching {args.only or '*'}")
        return 1

    tot_f = tot_g = 0
    if args.workers > 1:
        from concurrent.futures import ThreadPoolExecutor, as_completed
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            futs = {ex.submit(enrich_entity, f, args.force): f for f in files}
            for fut in as_completed(futs):
                f = futs[fut]
                fetched, grounded = fut.result()
                tot_f += fetched
                tot_g += grounded
                print(f"  {f.stem:36} fetched={fetched:2} grounded={grounded:2}", flush=True)
    else:
        for f in files:
            fetched, grounded = enrich_entity(f, args.force)
            tot_f += fetched
            tot_g += grounded
            print(f"  {f.stem:36} fetched={fetched:2} grounded={grounded:2}", flush=True)
    print(f"\nDone. {tot_f} OCR files pulled, {tot_g} items grounded across {len(files)} entities.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
