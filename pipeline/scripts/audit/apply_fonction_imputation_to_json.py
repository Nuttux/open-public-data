#!/usr/bin/env python3
"""
Post-process : applique la répartition proportionnelle des fonctions aux JSON
budget_sankey_*.json existants.

Pour chaque item où fonction == "Non spécifié" (BP voté), on cherche dans le
seed les fonctions historiques observées pour ce (category, flow_category)
et on ÉCLATE l'item en N sub-items selon les ratios observés.

Exemple :
  Avant : { name: "Éducation: Personnel", value: 334M, fonction: "Non spécifié" }
  Après : 5 items :
    - { ..., value: 140M, fonction: "Écoles primaires",     imputed: true, ratio: 0.42 }
    - { ..., value: 117M, fonction: "Écoles maternelles",   imputed: true, ratio: 0.35 }
    - { ..., value:  47M, fonction: "Services communs",     imputed: true, ratio: 0.14 }
    - { ..., value:  20M, fonction: "Collèges",             imputed: true, ratio: 0.06 }
    - { ..., value:  10M, fonction: "Apprentissage",        imputed: true, ratio: 0.03 }

Le TOTAL est exactement préservé (voté = somme des items éclatés).

Items dont fonction != "Non spécifié" → confidence = "ca", pas d'éclatement.
Items non trouvés dans le seed → confidence = "unknown", non éclatés.

Usage:
    python pipeline/scripts/audit/apply_fonction_imputation_to_json.py
"""

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "website" / "public" / "data"
SEED_PATH = REPO_ROOT / "pipeline" / "seeds" / "seed_fonction_imputed.csv"


def load_seed() -> dict[tuple[str, str], list[dict]]:
    """Returns {(category, flow_category) → [{fonction, ratio, confidence}, ...]}."""
    seed: dict[tuple[str, str], list[dict]] = defaultdict(list)
    if not SEED_PATH.exists():
        print(f"⚠ {SEED_PATH} missing — run build_fonction_imputation.py first")
        return seed
    with SEED_PATH.open() as f:
        for row in csv.DictReader(f):
            key = (row["category"], row["flow_category"])
            seed[key].append({
                "fonction": row["fonction"],
                "ratio": float(row["ratio"]),
                "confidence": row["confidence"],
            })
    return seed


def split_item(item: dict, group_name: str, seed: dict[tuple[str, str], list[dict]], stats: Counter) -> list[dict]:
    """Return [item] or [item1, item2, ...] (eclated). Preserves total value."""
    name = item.get("name", "")
    current = item.get("fonction", "")
    flow_category = item.get("flow_category", "")

    if current != "Non spécifié":
        # CA exécuté direct → keep as-is, just tag confidence
        stats["ca"] += 1
        return [{**item, "fonction_confidence": "ca"}]

    category = name.split(":")[0].strip() if ":" in name else group_name
    entries = seed.get((category, flow_category))
    if not entries:
        stats["unknown"] += 1
        return [{**item, "fonction_confidence": "unknown"}]

    value = item.get("value", 0)
    out = []
    accumulated = 0.0
    for i, entry in enumerate(entries):
        # Last item gets the rounding residual to preserve exact total
        if i == len(entries) - 1:
            part = value - accumulated
        else:
            part = round(value * entry["ratio"], 2)
            accumulated += part
        if part <= 0:
            continue
        out.append({
            **item,
            "value": part,
            "fonction": entry["fonction"],
            "fonction_confidence": entry["confidence"],
            "fonction_imputed": True,
            "fonction_ratio": entry["ratio"],
        })
    stats[entries[0]["confidence"] + "_split"] += 1
    stats["items_emitted"] += len(out)
    return out


def split_items(items: list[dict], group_name: str, seed, stats: Counter) -> list[dict]:
    out = []
    for it in items:
        out.extend(split_item(it, group_name, seed, stats))
    # Re-sort by value desc
    out.sort(key=lambda x: -x.get("value", 0))
    return out


def process_file(path: Path, seed) -> None:
    with path.open() as f:
        data = json.load(f)
    stats: Counter = Counter()

    for group_name, items in data.get("drilldown", {}).get("expenses", {}).items():
        if isinstance(items, list):
            data["drilldown"]["expenses"][group_name] = split_items(items, group_name, seed, stats)

    for group_name, sections in data.get("bySection", {}).items():
        if not isinstance(sections, dict):
            continue
        for section_name, section in sections.items():
            if isinstance(section, dict) and isinstance(section.get("items"), list):
                section["items"] = split_items(section["items"], group_name, seed, stats)

    with path.open("w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"  {path.name}: ca={stats['ca']} high={stats['high_split']} medium={stats['medium_split']} unknown={stats['unknown']} → {stats['items_emitted']} items éclatés")


def main() -> None:
    seed = load_seed()
    n_combos = len(seed)
    n_rows = sum(len(v) for v in seed.values())
    print(f"Loaded seed: {n_combos} combos, {n_rows} (fonction, ratio) rows")
    for path in sorted(DATA_DIR.glob("budget_sankey_*.json")):
        process_file(path, seed)


if __name__ == "__main__":
    main()
