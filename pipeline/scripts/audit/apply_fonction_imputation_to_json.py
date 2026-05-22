#!/usr/bin/env python3
"""
Post-process : applique l'imputation fonction (seed_fonction_imputed.csv) aux
JSON budget_sankey_*.json existants, sans nécessiter de re-run le pipeline BQ
complet.

Pour chaque item où fonction == "Non spécifié" (typique BP voté 2025/2026),
on cherche dans le seed via (category, flow_category) et on remplace :
  - fonction              → fonction dominante observée sur le CA passé
  - fonction_confidence   → "high" (≥70%) | "medium" (40-70%)

Items dont fonction != "Non spécifié" (CA exécuté) → confidence = "ca"
Items non trouvés dans le seed → confidence = "unknown", fonction inchangée.

Usage:
    python pipeline/scripts/audit/apply_fonction_imputation_to_json.py
"""

from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "website" / "public" / "data"
SEED_PATH = REPO_ROOT / "pipeline" / "seeds" / "seed_fonction_imputed.csv"


def load_seed() -> dict[tuple[str, str], dict]:
    cache: dict[tuple[str, str], dict] = {}
    if not SEED_PATH.exists():
        print(f"⚠ {SEED_PATH} missing — run build_fonction_imputation.py first")
        return cache
    with SEED_PATH.open() as f:
        for row in csv.DictReader(f):
            key = (row["category"], row["flow_category"])
            cache[key] = {
                "fonction": row["fonction"],
                "confidence": row["confidence"],
            }
    return cache


def impute_items(items: list[dict], group_name: str, seed: dict[tuple[str, str], dict], stats: Counter) -> list[dict]:
    out = []
    for it in items:
        name = it.get("name", "")
        current_fonction = it.get("fonction", "")
        flow_category = it.get("flow_category", "")
        if current_fonction == "Non spécifié":
            category = name.split(":")[0].strip() if ":" in name else group_name
            entry = seed.get((category, flow_category))
            if entry:
                it = {**it, "fonction": entry["fonction"], "fonction_confidence": entry["confidence"]}
                stats[entry["confidence"]] += 1
            else:
                it = {**it, "fonction_confidence": "unknown"}
                stats["unknown"] += 1
        else:
            it = {**it, "fonction_confidence": "ca"}
            stats["ca"] += 1
        out.append(it)
    return out


def process_file(path: Path, seed: dict[tuple[str, str], dict]) -> None:
    with path.open() as f:
        data = json.load(f)
    stats: Counter = Counter()

    for group_name, items in data.get("drilldown", {}).get("expenses", {}).items():
        if isinstance(items, list):
            data["drilldown"]["expenses"][group_name] = impute_items(items, group_name, seed, stats)

    for group_name, sections in data.get("bySection", {}).items():
        if not isinstance(sections, dict):
            continue
        for section_name, section in sections.items():
            if isinstance(section, dict) and isinstance(section.get("items"), list):
                section["items"] = impute_items(section["items"], group_name, seed, stats)

    with path.open("w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"  {path.name}: ca={stats['ca']} high={stats['high']} medium={stats['medium']} unknown={stats['unknown']}")


def main() -> None:
    seed = load_seed()
    print(f"Loaded seed: {len(seed)} (category, flow_category) entries")
    for path in sorted(DATA_DIR.glob("budget_sankey_*.json")):
        process_file(path, seed)


if __name__ == "__main__":
    main()
