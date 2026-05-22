#!/usr/bin/env python3
"""
Build seed_fonction_imputed.csv : pour chaque combinaison (category, flow_category)
trouvée dans les CA exécutés (2019-2024), identifier la fonction dominante.

Ces combos sont la VRAIE clé de matching : les libellés `name` complets
diffèrent entre BP voté (2025+) et CA exécuté (libellés abrégés vs détaillés),
mais le couple (category, flow_category) reste stable.

Sortie : pipeline/seeds/seed_fonction_imputed.csv avec colonnes :
  - category        : 1er segment du name avant ":" ex "Éducation"
  - flow_category   : nature comptable ("Personnel", "Subventions...", etc.)
  - fonction        : fonction dominante observée sur les CA passés
  - confidence      : "high" (≥70% du montant) | "medium" (entre 40 et 70%)
                      | rien (en deçà → on n'impute pas)
  - confidence_pct  : % du montant qui était classé sur cette fonction
  - years_observed  : nombre d'années où ce combo existe
  - total_value     : montant cumulé observé (pour info / tri)

Usage :
    python pipeline/scripts/audit/build_fonction_imputation.py
"""

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

CA_YEARS = [2019, 2020, 2021, 2022, 2023, 2024]

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "website" / "public" / "data"
SEED_PATH = REPO_ROOT / "pipeline" / "seeds" / "seed_fonction_imputed.csv"

HIGH_CONFIDENCE_PCT = 0.70   # ≥70% du montant → high
MEDIUM_CONFIDENCE_PCT = 0.40  # 40-70% → medium, <40% → skip


def collect_combos() -> dict[tuple[str, str], dict]:
    """Build {(category, flow_category) → {fonction → cumulative_value}}, plus year set."""
    combos: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)
    combo_years: dict[tuple[str, str], set[int]] = defaultdict(set)

    for year in CA_YEARS:
        path = DATA_DIR / f"budget_sankey_{year}.json"
        if not path.exists():
            continue
        with path.open() as f:
            data = json.load(f)
        for group_name, items in data.get("drilldown", {}).get("expenses", {}).items():
            if not isinstance(items, list):
                continue
            for item in items:
                fonction = item.get("fonction")
                flow_category = item.get("flow_category")
                name = item.get("name", "")
                value = item.get("value", 0)
                if not fonction or fonction == "Non spécifié" or not flow_category:
                    continue
                # Extract category = first segment before ":"
                category = name.split(":")[0].strip() if ":" in name else group_name
                key = (category, flow_category)
                combos[key][fonction] += value
                combo_years[key].add(year)
    return {k: {"counter": v, "years": combo_years[k]} for k, v in combos.items()}


def classify_combo(data: dict) -> tuple[str, str, int, int, float] | None:
    """Return (fonction, confidence, pct, years, total) or None to skip."""
    counter: Counter[str] = data["counter"]
    years: set[int] = data["years"]
    total = sum(counter.values())
    if total == 0:
        return None
    top_fonction, top_value = counter.most_common(1)[0]
    pct = top_value / total
    confidence = (
        "high" if pct >= HIGH_CONFIDENCE_PCT
        else "medium" if pct >= MEDIUM_CONFIDENCE_PCT
        else None
    )
    if confidence is None:
        return None
    return top_fonction, confidence, round(pct * 100), len(years), total


def build_seed() -> None:
    combos = collect_combos()
    print(f"Collected {len(combos)} unique (category, flow_category) combos from CA {CA_YEARS}")

    rows: list[dict] = []
    stats = Counter()
    for (category, flow_category), data in combos.items():
        result = classify_combo(data)
        if not result:
            stats["skipped_low_confidence"] += 1
            continue
        fonction, confidence, pct, years, total = result
        rows.append({
            "category": category,
            "flow_category": flow_category,
            "fonction": fonction,
            "confidence": confidence,
            "confidence_pct": pct,
            "years_observed": years,
            "total_value": round(total),
        })
        stats[confidence] += 1

    rows.sort(key=lambda r: (r["category"], r["flow_category"]))

    SEED_PATH.parent.mkdir(parents=True, exist_ok=True)
    with SEED_PATH.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "category", "flow_category", "fonction", "confidence",
            "confidence_pct", "years_observed", "total_value",
        ])
        writer.writeheader()
        writer.writerows(rows)

    total_seed_value = sum(r["total_value"] for r in rows)
    high_value = sum(r["total_value"] for r in rows if r["confidence"] == "high")
    print()
    print(f"✓ {SEED_PATH.relative_to(REPO_ROOT)}")
    print(f"  {len(rows)} combos imputed, {stats['skipped_low_confidence']} skipped (<40%)")
    print(f"  - high   : {stats['high']:3d}  ({100*high_value/total_seed_value:.0f}% du montant cumulé)")
    print(f"  - medium : {stats['medium']:3d}  ({100*(total_seed_value-high_value)/total_seed_value:.0f}% du montant cumulé)")


if __name__ == "__main__":
    build_seed()
