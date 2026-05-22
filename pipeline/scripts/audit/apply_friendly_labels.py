#!/usr/bin/env python3
"""
Applique seed_label_friendly.csv aux JSON de website/public/data/ :
remplace les libellés techno-comptables ("Charges intervent° cpt prop.")
par leur version grand-public ("Charges d'intervention").

Stratégie :
- Pour les `name` au format "Catégorie: Nature comptable" → on remplace
  uniquement la partie après le ":" (la nature). Le préfixe section est
  conservé tel quel.
- Pour les autres champs label/libelle/nature/fonction → remplacement direct.
- Le libellé technique original est conservé dans un champ `name_original`
  pour le tooltip ou export méthode.

Usage :
    python pipeline/scripts/audit/apply_friendly_labels.py
"""

from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "website" / "public" / "data"
SEED_PATH = REPO_ROOT / "pipeline" / "seeds" / "seed_label_friendly.csv"

# Champs où l'on cherche/remplace
LABEL_KEYS = {"name", "label", "libelle", "nature", "fonction", "categorie", "categorie_libelle", "nature_libelle"}


def load_mapping() -> dict[str, str]:
    if not SEED_PATH.exists():
        print(f"⚠ {SEED_PATH} missing")
        return {}
    m: dict[str, str] = {}
    with SEED_PATH.open() as f:
        for row in csv.DictReader(f):
            technical = row.get("technical", "")
            friendly = row.get("friendly", "")
            # Skip comment lines (rows where "technical" starts with "#")
            if not technical or technical.startswith("#") or not friendly:
                continue
            m[technical] = friendly
    return m


def rewrite_label(value: str, mapping: dict[str, str], stats: Counter) -> tuple[str, bool]:
    """Returns (new_value, was_changed)."""
    if not isinstance(value, str):
        return value, False
    # 1. exact match
    if value in mapping:
        stats[value] += 1
        return mapping[value], True
    # 2. "Category: Nature" pattern → only rewrite the nature
    if ": " in value:
        prefix, _, suffix = value.partition(": ")
        if suffix in mapping:
            stats[suffix] += 1
            return f"{prefix}: {mapping[suffix]}", True
    return value, False


def walk(obj, mapping: dict[str, str], stats: Counter):
    if isinstance(obj, dict):
        for k, v in list(obj.items()):
            if k in LABEL_KEYS and isinstance(v, str):
                new_v, changed = rewrite_label(v, mapping, stats)
                if changed:
                    obj.setdefault(f"{k}_original", v)
                    obj[k] = new_v
            walk(v, mapping, stats)
    elif isinstance(obj, list):
        for item in obj:
            walk(item, mapping, stats)


def process_file(path: Path, mapping: dict[str, str]) -> int:
    with path.open() as f:
        data = json.load(f)
    stats: Counter = Counter()
    walk(data, mapping, stats)
    total = sum(stats.values())
    if total > 0:
        with path.open("w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    return total


def main():
    mapping = load_mapping()
    print(f"Loaded mapping: {len(mapping)} entries")
    for path in sorted(DATA_DIR.glob("*.json")):
        try:
            n = process_file(path, mapping)
        except json.JSONDecodeError:
            continue
        if n > 0:
            print(f"  {path.name}: {n} labels rewritten")


if __name__ == "__main__":
    main()
