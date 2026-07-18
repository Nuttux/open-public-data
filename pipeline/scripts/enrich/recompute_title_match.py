#!/usr/bin/env python3
"""Recalcule le flag title_match des caches délibs depuis le seed.

Le runner ne passait pas `--phrase` : le sync retombait sur `--query`, donc
`title_match` testait « tour AND Saint-Jacques » dans le titre — jamais vrai
(bug corrigé 2026-07-17). Les titres ramenés étant complets et corrects, on
recalcule le flag sur place, sans re-télécharger.

Usage : python pipeline/scripts/enrich/recompute_title_match.py
"""
from __future__ import annotations

import csv
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "seed_lieux_v1.csv"
CACHE = ROOT / "pipeline" / "cache" / "lieux"


def norm(s: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", s.lower())
                if unicodedata.category(c) != "Mn")
    return re.sub(r"[\s\-’']+", " ", s).strip()


def main() -> int:
    rows = {r["slug"]: r for r in csv.DictReader(SEED.open())}
    total_before = total_after = 0
    for slug, seed in rows.items():
        path = CACHE / f"{slug}_delibs.jsonl"
        if not path.exists():
            continue
        phrase = seed["title_phrase"]
        docs = [json.loads(l) for l in path.open()]
        before = sum(1 for d in docs if d.get("title_match"))
        for d in docs:
            d["title_phrase"] = phrase
            d["title_match"] = norm(phrase) in norm(d.get("titre") or "")
        after = sum(1 for d in docs if d["title_match"])
        with path.open("w") as f:
            for d in docs:
                f.write(json.dumps(d, ensure_ascii=False) + "\n")
        total_before += before
        total_after += after
        flag = "  ←" if after != before else ""
        print(f"{slug:<30} {len(docs):>5} docs | title_match {before:>4} → {after:>4}{flag}")
    print(f"\nTOTAL title_match : {total_before} → {total_after}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
