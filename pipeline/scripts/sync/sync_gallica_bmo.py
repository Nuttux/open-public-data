#!/usr/bin/env python3
"""Sync ciblé Gallica — Bulletin Municipal Officiel de la Ville de Paris.

Le BMO (débats et décisions du conseil municipal) est numérisé sur Gallica
de 1882 à 1985 (périodique ark cb343512457, vérifié 2026-07-17 : la
recherche plein-texte par fascicule répond via SRU avec
`collapsing=disabled` — « piscine des Amiraux » → 741 fascicules datés).

Écrit une ligne JSONL par fascicule où le lieu est mentionné : date du
fascicule, ark, URL Gallica. Raw only — la sélection éditoriale des
fascicules significatifs est un enrichissement séparé, cité page à page.

Usage :
    python pipeline/scripts/sync/sync_gallica_bmo.py
    python pipeline/scripts/sync/sync_gallica_bmo.py --query "Théâtre de la Ville" --slug theatre-de-la-ville
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SRU = "https://gallica.bnf.fr/SRU"
BMO_ARK = "cb343512457_date"
UA = {"User-Agent": "france-open-data/0.1 (recherche civique; franceopendata.org)"}
ROOT = Path(__file__).resolve().parents[3]
OUT_DIR = ROOT / "pipeline" / "cache" / "lieux"

LIEUX_V0 = {
    "piscine-des-amiraux": "piscine des Amiraux",
    "philharmonie-de-paris": "Philharmonie de Paris",   # attendu ~0 avant 1985 — le confirmer est aussi une donnée
    "theatre-de-la-ville": "Théâtre de la Ville",
    "porte-maillot": "Porte Maillot",
}

REC_RE = re.compile(
    r"<srw:record>.*?<dc:identifier>([^<]+)</dc:identifier>.*?<dc:date>([^<]+)</dc:date>.*?</srw:record>",
    re.S,
)
NUM_RE = re.compile(r"<srw:numberOfRecords>(\d+)</srw:numberOfRecords>")


def sru(query: str, start: int, count: int = 50) -> str:
    params = {
        "operation": "searchRetrieve",
        "version": "1.2",
        "query": f'(gallica all "{query}") and (arkPress all "{BMO_ARK}")',
        "collapsing": "disabled",
        "startRecord": str(start),
        "maximumRecords": str(count),
    }
    req = urllib.request.Request(SRU + "?" + urllib.parse.urlencode(params), headers=UA)
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.read().decode("utf-8", "ignore")


def search_all(query: str, hard_cap: int = 2000) -> tuple[list[dict], int]:
    rows: list[dict] = []
    start, total = 1, None
    while True:
        xml = sru(query, start)
        if total is None:
            m = NUM_RE.search(xml)
            total = int(m.group(1)) if m else 0
        batch = [
            {"gallica_url": ident.strip(), "issue_date": date.strip()}
            for ident, date in REC_RE.findall(xml)
        ]
        rows.extend(batch)
        start += len(batch)
        if not batch or start > min(total, hard_cap):
            break
        time.sleep(1.0)
    return rows, total or 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--query")
    ap.add_argument("--slug", default="adhoc")
    args = ap.parse_args()

    targets = {args.slug: args.query} if args.query else LIEUX_V0
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    synced_at = datetime.now(timezone.utc).isoformat()

    for slug, query in targets.items():
        try:
            rows, total = search_all(query)
        except Exception as exc:
            print(f"ERR {slug}: {type(exc).__name__} {exc}", file=sys.stderr)
            continue
        out = OUT_DIR / f"{slug}_bmo.jsonl"
        with out.open("w") as f:
            for r in rows:
                r.update({
                    "lieu_slug": slug,
                    "query": query,
                    "source": "Gallica / BnF — Bulletin Municipal Officiel de la Ville de Paris (1882–1985)",
                    "source_periodical": f"https://gallica.bnf.fr/ark:/12148/{BMO_ARK.split('_')[0]}/date",
                    "_synced_at": synced_at,
                })
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(f"{slug}: {len(rows)}/{total} fascicules -> {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
