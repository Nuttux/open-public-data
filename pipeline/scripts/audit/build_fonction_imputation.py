#!/usr/bin/env python3
"""
Build seed_fonction_imputed.csv : pour chaque combinaison (category, flow_category)
trouvée dans les CA exécutés (2019-2024), produit la VENTILATION COMPLÈTE
observée (ratios par fonction).

Stratégie de projection :
  - Pas de "fonction dominante unique" (biaisé : 58% va ailleurs si dominante 42%)
  - On répartit le montant BP voté selon les ratios historiques observés
  - Ex : "Éducation+Personnel" sur 6 ans = 42% Écoles primaires + 35% maternelles
    + 14% services communs + ... → on éclate le montant BP 2026 dans ces ratios.

Sortie : pipeline/seeds/seed_fonction_imputed.csv (long format)
  - category        : 1er segment du name avant ":"
  - flow_category   : nature comptable
  - fonction        : fonction observée (peut y avoir plusieurs rows pour
                       un même combo)
  - ratio           : part du montant observé sur cette fonction (0-1)
  - confidence      : "high" si combo dominé ≥70% par 1 fonction, sinon "medium"
                       (info au niveau du COMBO, pas de la fonction individuelle)
  - years_observed  : nb d'années où ce combo existe
  - total_value     : montant cumulé du combo (info)

On garde les fonctions avec ratio ≥ 1%. Les fonctions <1% sont regroupées
dans une row "Autres" pour ne pas polluer le rendu.

Usage :
    python pipeline/scripts/audit/build_fonction_imputation.py
"""

from __future__ import annotations

import csv
import json
import statistics
from collections import Counter, defaultdict
from pathlib import Path

CA_YEARS = [2019, 2020, 2021, 2022, 2023, 2024]
REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "website" / "public" / "data"
SEED_PATH = REPO_ROOT / "pipeline" / "seeds" / "seed_fonction_imputed.csv"

# Threshold for dominance (used to set combo-level confidence flag)
HIGH_DOMINANCE_THRESHOLD = 0.70
# Functions <1% are aggregated into "Autres" (avoid drawer noise)
MIN_FUNCTION_RATIO = 0.01
# Exclude combos where the average stddev of major (≥5%) functions exceeds
# this threshold — the imputation would be unreliable (cf. option C user choice).
# Concerne ~22% des combos, essentiellement investissements (où la fonction
# change projet par projet et ne peut pas être projetée fiablement).
VOLATILITY_EXCLUDE_THRESHOLD = 0.15  # 15 points of stddev


def collect_combos() -> dict[tuple[str, str], dict]:
    # combos[key]["counter"] = Counter(fonction → cumulative_value)
    # combos[key]["per_year"] = {year → {fonction → ratio_in_year}} (pour calcul variance)
    combos: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)
    combo_years: dict[tuple[str, str], set[int]] = defaultdict(set)
    per_year_ratios: dict[tuple[str, str], dict[int, dict[str, float]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(float))
    )
    per_year_totals: dict[tuple[str, str], dict[int, float]] = defaultdict(lambda: defaultdict(float))

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
                # Skip imputed items (we want CA executed only)
                if item.get("fonction_imputed"):
                    continue
                if not fonction or fonction == "Non spécifié" or not flow_category:
                    continue
                category = name.split(":")[0].strip() if ":" in name else group_name
                key = (category, flow_category)
                combos[key][fonction] += value
                combo_years[key].add(year)
                per_year_ratios[key][year][fonction] += value
                per_year_totals[key][year] += value

    # Convert per-year amounts to ratios
    out = {}
    for key, counter in combos.items():
        years_dict = {}
        for year in per_year_ratios[key]:
            total = per_year_totals[key][year]
            if total > 0:
                years_dict[year] = {f: v / total for f, v in per_year_ratios[key][year].items()}
        out[key] = {
            "counter": counter,
            "years": combo_years[key],
            "per_year_ratios": years_dict,
        }
    return out


def compute_volatility(per_year_ratios: dict[int, dict[str, float]]) -> float:
    """Average stddev of major (≥5% mean) functions across years."""
    if len(per_year_ratios) < 2:
        return 0.0
    all_fonctions = set()
    for fr in per_year_ratios.values():
        all_fonctions.update(fr.keys())
    stddevs = []
    for f in all_fonctions:
        ratios = [per_year_ratios[y].get(f, 0.0) for y in per_year_ratios]
        mean = statistics.mean(ratios)
        if mean >= 0.05:  # only consider major functions
            stddevs.append(statistics.stdev(ratios) if len(ratios) > 1 else 0.0)
    return statistics.mean(stddevs) if stddevs else 0.0


def build_seed() -> None:
    combos = collect_combos()
    print(f"Collected {len(combos)} unique (category, flow_category) combos")

    rows: list[dict] = []
    stats = Counter()

    for (category, flow_category), data in combos.items():
        counter: Counter[str] = data["counter"]
        years: set[int] = data["years"]
        total = sum(counter.values())
        if total == 0:
            continue

        # Skip volatile combos: imputation would be unreliable
        volatility = compute_volatility(data["per_year_ratios"])
        if volatility >= VOLATILITY_EXCLUDE_THRESHOLD:
            stats["excluded_volatile"] += 1
            continue

        # Compute combo-level confidence
        top_value = counter.most_common(1)[0][1]
        dominance = top_value / total
        confidence = "high" if dominance >= HIGH_DOMINANCE_THRESHOLD else "medium"

        # Build ratios + aggregate <1% functions into "Autres"
        sorted_fonctions = counter.most_common()
        autres_value = 0.0
        keep = []
        for fonction, value in sorted_fonctions:
            ratio = value / total
            if ratio < MIN_FUNCTION_RATIO and fonction != "Autres":
                autres_value += value
            else:
                keep.append((fonction, value, ratio))

        if autres_value > 0:
            # Merge into existing "Autres" or add new row
            existing_autres = next((i for i, (f, _, _) in enumerate(keep) if f == "Autres"), None)
            if existing_autres is not None:
                f_, v, _ = keep[existing_autres]
                keep[existing_autres] = (f_, v + autres_value, (v + autres_value) / total)
            else:
                keep.append(("Autres", autres_value, autres_value / total))
            # Re-sort by value desc
            keep.sort(key=lambda x: -x[1])

        for fonction, value, ratio in keep:
            rows.append({
                "category": category,
                "flow_category": flow_category,
                "fonction": fonction,
                "ratio": round(ratio, 4),
                "confidence": confidence,
                "years_observed": len(years),
                "total_value": round(value),
            })
        stats[confidence] += 1
        stats["functions_per_combo"] += len(keep)

    # Sort by (category, flow_category, ratio desc) for diffability
    rows.sort(key=lambda r: (r["category"], r["flow_category"], -r["ratio"]))

    SEED_PATH.parent.mkdir(parents=True, exist_ok=True)
    with SEED_PATH.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "category", "flow_category", "fonction", "ratio",
            "confidence", "years_observed", "total_value",
        ])
        writer.writeheader()
        writer.writerows(rows)

    n_combos = stats["high"] + stats["medium"]
    print()
    print(f"✓ {SEED_PATH.relative_to(REPO_ROOT)}")
    print(f"  {len(rows)} rows ({n_combos} combos × ~{stats['functions_per_combo'] / max(n_combos, 1):.1f} fonctions/combo)")
    print(f"  - high dominance (≥70%)  : {stats['high']:3d} combos")
    print(f"  - medium (40-70%)        : {stats['medium']:3d} combos")
    print(f"  EXCLUDED (volatility ≥{int(VOLATILITY_EXCLUDE_THRESHOLD*100)}pt) : {stats['excluded_volatile']:3d} combos")
    print(f"    → ces combos restent en 'Non spécifié' dans les JSON, le frontend")
    print(f"      regroupe par flow_category à la place (Personnel/Subventions/etc.)")


if __name__ == "__main__":
    build_seed()
