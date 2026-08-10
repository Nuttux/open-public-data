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

  ocr_status   : "ok" | "no_alias_hit" | "empty" | "missing" | "fetch_error"
  ocr_chars    : length of the OCR text pulled (pre-truncation note if capped)
  ocr_excerpts : list of cleaned passages around the aliases (grounding text)

Resumable and polite: items that already carry ocr_excerpts are skipped unless
--force; a SLEEP gap sits between downloads. The skip is keyed on ocr_excerpts
being set, so the two empty outcomes are stored differently on purpose —
"missing" (404, no derivative exists) sets it to [] and sticks, while
"fetch_error" (5xx/timeout) leaves it unset and is retried by the next run.
--retry-failed reopens the sticky ones too. Nothing here is depended on at
runtime — it only enriches the on-disk cache that link_sf_places.py reads.

Usage:
    python pipeline/scripts/sync/fetch_ia_ocr.py --only coit-tower
    python pipeline/scripts/sync/fetch_ia_ocr.py --kind places --dry-run
    python pipeline/scripts/sync/fetch_ia_ocr.py --kind places
    python pipeline/scripts/sync/fetch_ia_ocr.py --kind places --retry-failed
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
# TOP_K is applied PER POOL, not over the flat list. sync_ia_sf.py appends pools in
# order (sfpl, then dl), so a flat head-slice gave the whole budget to SFPL and left
# the Democracy's Library items ungrounded — which then dropped them at linkage, so
# nothing from that collection ever reached a fiche. Pools get their own budget.
POOLS_ORDER = ("sfpl", "dl")
MAX_BYTES = 5_000_000   # cap the OCR read — a few scanned books' worth is plenty
HALF_WINDOW = 350       # chars of context each side of an alias hit
MAX_WINDOWS = 6         # merged passages kept per document
MAX_EXCERPT_CHARS = 2800  # total grounding text kept per document
SLEEP = 1.2             # polite gap between OCR downloads
RETRIES = 3             # attempts per item before calling a fetch transiently failed
BACKOFF = 2.0           # seconds, doubled each retry (2s, 4s)
TRANSIENT_HTTP = {408, 429, 500, 502, 503, 504}
# Statuses that mean "we never got the text" and are worth another try later.
# "no_alias_hit"/"ok" are determinate results about text we did read — only
# --force refetches those.
RETRYABLE_STATUS = {"missing", "empty", "fetch_error"}


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


def fetch_ocr(identifier: str) -> tuple[str | None, bool, str | None]:
    """Return (text, truncated, failure).

    failure distinguishes the two ways a fetch comes back empty, because they
    must be remembered differently:
      "absent"    — 404: this item has no _djvu.txt derivative. A fact about the
                    item, stable across reruns, so it is safe to make sticky.
      "transient" — 5xx / 429 / timeout / reset: a fact about the *network*, not
                    the item. Recording it as an absence would turn one bad
                    minute into permanent data loss (a real HTTP 500 on
                    C101733446 did exactly that), so these stay retryable.
    Retries in-run with backoff first; only a persistently failing fetch surfaces.
    """
    url = DL.format(id=identifier)
    last = ""
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read(MAX_BYTES + 1)
            truncated = len(raw) > MAX_BYTES
            return raw[:MAX_BYTES].decode("utf-8", "replace"), truncated, None
        except urllib.error.HTTPError as e:  # noqa: PERF203
            if e.code == 404:
                return None, False, "absent"
            if e.code not in TRANSIENT_HTTP:
                # 4xx that isn't 404 (403 restricted, 451 …): a stable property
                # of the item, not worth re-hammering on every run.
                print(f"    HTTP {e.code} for {identifier} (permanent)", file=sys.stderr)
                return None, False, "absent"
            last = f"HTTP {e.code}"
        except Exception as e:  # noqa: BLE001
            last = f"{type(e).__name__}: {e}"
        if attempt < RETRIES - 1:
            time.sleep(BACKOFF * (2 ** attempt))
    print(f"    transient fail {identifier}: {last}", file=sys.stderr)
    return None, False, "transient"


def head_per_pool(items: list[dict]) -> list[dict]:
    """First TOP_K items of each pool, in the original ranking order."""
    budget: dict[str, int] = {}
    out = []
    for it in items:
        pool = it.get("pool") or "?"
        if budget.get(pool, 0) >= TOP_K:
            continue
        budget[pool] = budget.get(pool, 0) + 1
        out.append(it)
    return out


def needs_fetch(it: dict, force: bool, retry_failed: bool) -> bool:
    """Whether this item still owes us a download.

    Never-attempted items carry no ocr_excerpts. A transient failure also leaves
    ocr_excerpts unset, so it comes back for a retry on the next plain run —
    that is the whole point of the split. --retry-failed additionally reopens
    the sticky non-results (404 absences, empty derivatives)."""
    if force:
        return True
    if it.get("ocr_excerpts") is None:
        return True
    return retry_failed and it.get("ocr_status") in RETRYABLE_STATUS


def enrich_entity(path: Path, force: bool, retry_failed: bool = False,
                  dry_run: bool = False) -> dict:
    d = json.loads(path.read_text())
    stats = {"fetched": 0, "grounded": 0, "todo": 0,
             "todo_sfpl": 0, "todo_dl": 0, "transient": 0}
    pat = alias_pattern(d.get("aliases") or [])
    if pat is None:
        return stats
    for it in head_per_pool(d.get("items") or []):
        if not needs_fetch(it, force, retry_failed):
            if it.get("ocr_status") == "ok":
                stats["grounded"] += 1
            continue
        stats["todo"] += 1
        stats["todo_dl" if it.get("pool") == "dl" else "todo_sfpl"] += 1
        if dry_run:
            continue
        text, truncated, failure = fetch_ocr(it["identifier"])
        time.sleep(SLEEP)
        if text is None:
            if failure == "transient":
                # Deliberately leave ocr_excerpts unset so the next run retries.
                it["ocr_status"] = "fetch_error"
                it["ocr_error_at"] = now_iso()
                it.pop("ocr_excerpts", None)
                stats["transient"] += 1
            else:
                it["ocr_status"] = "missing"
                it["ocr_chars"] = 0
                it["ocr_excerpts"] = []
            continue
        it.pop("ocr_error_at", None)
        stats["fetched"] += 1
        it["ocr_chars"] = len(text) + (1 if truncated else 0)  # +1 marks a capped read
        if not text.strip():
            it["ocr_status"] = "empty"
            it["ocr_excerpts"] = []
            continue
        excerpts = extract_excerpts(text, pat)
        it["ocr_excerpts"] = excerpts
        it["ocr_status"] = "ok" if excerpts else "no_alias_hit"
        if excerpts:
            stats["grounded"] += 1
    if not dry_run:
        d["ocr_enriched_at"] = now_iso()
        path.write_text(json.dumps(d, indent=1, ensure_ascii=False))
    return stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=["places", "departments", "payees"], default="places")
    ap.add_argument("--only", help="single slug")
    ap.add_argument("--force", action="store_true",
                    help="refetch every in-budget item, including ones already grounded")
    ap.add_argument("--retry-failed", action="store_true",
                    help="also reopen sticky non-results (404 'missing', 'empty')")
    ap.add_argument("--dry-run", action="store_true",
                    help="count what would be fetched, per pool; touch nothing")
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
    if args.workers > 3:
        print(f"--workers {args.workers} is impolite to archive.org; capping at 3")
        args.workers = 3

    tot = {"fetched": 0, "grounded": 0, "todo": 0,
           "todo_sfpl": 0, "todo_dl": 0, "transient": 0}

    def run(f: Path) -> dict:
        return enrich_entity(f, args.force, args.retry_failed, args.dry_run)

    def record(f: Path, s: dict) -> None:
        for k in tot:
            tot[k] += s[k]
        if args.dry_run:
            if s["todo"]:
                print(f"  {f.stem:36} todo={s['todo']:2} (sfpl={s['todo_sfpl']} dl={s['todo_dl']})",
                      flush=True)
        else:
            extra = f" transient={s['transient']}" if s["transient"] else ""
            print(f"  {f.stem:36} fetched={s['fetched']:2} grounded={s['grounded']:2}{extra}",
                  flush=True)

    if args.workers > 1 and not args.dry_run:
        from concurrent.futures import ThreadPoolExecutor, as_completed
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            futs = {ex.submit(run, f): f for f in files}
            for fut in as_completed(futs):
                record(futs[fut], fut.result())
    else:
        for f in files:
            record(f, run(f))

    if args.dry_run:
        print(f"\nDRY RUN {args.kind}: {tot['todo']} items would be fetched "
              f"(sfpl={tot['todo_sfpl']}, dl={tot['todo_dl']}) across {len(files)} entities. "
              f"{tot['grounded']} already grounded. "
              f"~{tot['todo'] * SLEEP / 60:.0f} min at {SLEEP}s/item, 1 worker.")
    else:
        print(f"\nDone. {tot['fetched']} OCR files pulled, {tot['grounded']} items grounded "
              f"across {len(files)} entities. {tot['transient']} transient failures left "
              f"retryable (rerun to pick them up).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
