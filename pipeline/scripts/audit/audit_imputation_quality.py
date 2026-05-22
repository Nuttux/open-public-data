#!/usr/bin/env python3
"""
Audit la QUALITÉ de l'imputation proportionnelle.

Pour chaque combo (category, flow_category) du seed_fonction_imputed.csv,
on calcule la VARIANCE des ratios sur les 6 ans (2019-2024). Plus la
variance est faible, plus l'imputation est fiable. Si un combo varie
beaucoup d'une année à l'autre, projeter une moyenne devient hasardeux.

Output : un rapport markdown trié, montrant :
  - Combos très stables (variance faible) → imputation safe
  - Combos volatiles (variance forte) → à vérifier humainement

Le but : pouvoir défendre les chiffres face à un élu sceptique
('Sécurité+Personnel→Police pour 90% du montant : c'est cohérent avec
ce qu'on observe depuis 6 ans'), ET identifier les cas où l'imputation
n'est pas fiable ('ce combo varie de 30% à 60% selon l'année — projection
incertaine').

Usage :
    python pipeline/scripts/audit/audit_imputation_quality.py
"""

from __future__ import annotations

import csv
import json
import statistics
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = REPO_ROOT / "website" / "public" / "data"
SEED_PATH = REPO_ROOT / "pipeline" / "seeds" / "seed_fonction_imputed.csv"
REPORT_PATH = REPO_ROOT / "docs" / "audits" / "imputation-quality.md"

CA_YEARS = [2019, 2020, 2021, 2022, 2023, 2024]


def collect_combo_ratios_by_year() -> dict[tuple[str, str], dict[int, dict[str, float]]]:
    """Build {(category, flow_category) → {year → {fonction → ratio_in_combo}}}."""
    combos: dict[tuple[str, str], dict[int, dict[str, float]]] = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    raw_amounts: dict[tuple[str, str], dict[int, float]] = defaultdict(lambda: defaultdict(float))

    for year in CA_YEARS:
        path = DATA_DIR / f"budget_sankey_{year}.json"
        if not path.exists():
            continue
        with path.open() as f:
            data = json.load(f)
        for group_name, items in data.get("drilldown", {}).get("expenses", {}).items():
            if not isinstance(items, list):
                continue
            for it in items:
                fonction = it.get("fonction")
                flow_category = it.get("flow_category")
                name = it.get("name", "")
                value = it.get("value", 0)
                # Skip imputed items (we want CA executed only)
                if it.get("fonction_imputed") or fonction == "Non spécifié" or not flow_category:
                    continue
                category = name.split(":")[0].strip() if ":" in name else group_name
                key = (category, flow_category)
                combos[key][year][fonction] += value
                raw_amounts[key][year] += value

    # Convert amounts to ratios per year
    out: dict[tuple[str, str], dict[int, dict[str, float]]] = {}
    for key, year_dict in combos.items():
        out[key] = {}
        for year, fonctions in year_dict.items():
            total = sum(fonctions.values())
            if total > 0:
                out[key][year] = {f: v / total for f, v in fonctions.items()}
    return out


def compute_stability(combo_ratios: dict[int, dict[str, float]]) -> dict:
    """For one combo, compute stability metrics across years.

    Returns:
      - n_years: nb of years observed
      - all_fonctions: set of all distinct fonctions seen
      - per_fonction_stats: {fonction → {mean, stddev, min, max, range}}
      - overall_stddev: avg stddev across all major fonctions (>5% mean)
    """
    if not combo_ratios:
        return {"n_years": 0, "all_fonctions": [], "per_fonction_stats": {}, "overall_stddev": 0.0}

    all_fonctions = set()
    for fr in combo_ratios.values():
        all_fonctions.update(fr.keys())

    per_fonction_stats = {}
    for f in all_fonctions:
        ratios = [combo_ratios[y].get(f, 0.0) for y in combo_ratios]
        mean = statistics.mean(ratios)
        stddev = statistics.stdev(ratios) if len(ratios) > 1 else 0.0
        per_fonction_stats[f] = {
            "mean": mean,
            "stddev": stddev,
            "min": min(ratios),
            "max": max(ratios),
            "range": max(ratios) - min(ratios),
        }

    # Overall stability = avg stddev for fonctions with mean >5% (les "vraies" composantes)
    major_stddevs = [s["stddev"] for s in per_fonction_stats.values() if s["mean"] >= 0.05]
    overall_stddev = statistics.mean(major_stddevs) if major_stddevs else 0.0

    return {
        "n_years": len(combo_ratios),
        "all_fonctions": sorted(all_fonctions),
        "per_fonction_stats": per_fonction_stats,
        "overall_stddev": overall_stddev,
    }


def main():
    all_ratios = collect_combo_ratios_by_year()
    print(f"Analysed {len(all_ratios)} combos across {CA_YEARS}")

    rows = []
    for key, year_data in all_ratios.items():
        stability = compute_stability(year_data)
        if stability["n_years"] < 3:
            continue
        rows.append({
            "category": key[0],
            "flow_category": key[1],
            "n_years": stability["n_years"],
            "n_fonctions": len(stability["all_fonctions"]),
            "overall_stddev": stability["overall_stddev"],
            "per_fonction_stats": stability["per_fonction_stats"],
        })

    # Sort by stddev ascending (most stable first)
    rows.sort(key=lambda r: r["overall_stddev"])

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with REPORT_PATH.open("w") as f:
        f.write("# Audit qualité de l'imputation proportionnelle\n\n")
        f.write(f"Analyse de la stabilité des ratios `(category, flow_category) → fonction` sur {len(CA_YEARS)} ans (CA exécutés {CA_YEARS[0]}-{CA_YEARS[-1]}).\n\n")
        f.write("**Lecture** : un combo est *fiable* si la part de chaque fonction reste similaire d'une année à l'autre. Si une fonction passe de 5% à 60% selon l'année, la moyenne est trompeuse.\n\n")
        f.write("**Métrique** : `overall_stddev` = moyenne des écarts-types des fonctions ≥5%. Plus c'est bas, plus l'imputation est fiable.\n\n")

        # Section: top 20 most stable
        f.write("## ✅ Combos les plus stables (imputation safe)\n\n")
        f.write("| Combo | Years | Fonctions ≥5% (moyenne ± écart-type) |\n")
        f.write("|---|---:|---|\n")
        for r in rows[:20]:
            major = sorted(
                ((fn, s) for fn, s in r["per_fonction_stats"].items() if s["mean"] >= 0.05),
                key=lambda x: -x[1]["mean"]
            )
            display = " · ".join(f"**{fn}** {s['mean']*100:.0f}% ± {s['stddev']*100:.0f}pt" for fn, s in major[:3])
            f.write(f"| {r['category']} → {r['flow_category']} | {r['n_years']} | {display} |\n")

        # Section: top 20 most volatile
        f.write("\n## ⚠️ Combos les plus volatils (imputation risquée)\n\n")
        f.write("Ces combos ont des fonctions dont la part varie fortement d'une année à l'autre. L'imputation proportionnelle est moins fiable et la projection 2026 peut s'écarter de la réalité.\n\n")
        f.write("| Combo | Years | Fonctions ≥5% (moyenne ± écart-type, min-max) |\n")
        f.write("|---|---:|---|\n")
        for r in rows[-20:]:
            major = sorted(
                ((fn, s) for fn, s in r["per_fonction_stats"].items() if s["mean"] >= 0.05),
                key=lambda x: -x[1]["mean"]
            )
            display = " · ".join(
                f"**{fn}** {s['mean']*100:.0f}% ± {s['stddev']*100:.0f}pt ({s['min']*100:.0f}-{s['max']*100:.0f}%)"
                for fn, s in major[:3]
            )
            f.write(f"| {r['category']} → {r['flow_category']} | {r['n_years']} | {display} |\n")

        # Summary stats
        f.write("\n## Résumé statistique\n\n")
        very_stable = sum(1 for r in rows if r["overall_stddev"] < 0.05)
        stable = sum(1 for r in rows if 0.05 <= r["overall_stddev"] < 0.10)
        moderate = sum(1 for r in rows if 0.10 <= r["overall_stddev"] < 0.15)
        volatile = sum(1 for r in rows if r["overall_stddev"] >= 0.15)
        f.write(f"- Très stable (écart-type <5 pts) : **{very_stable}** combos\n")
        f.write(f"- Stable (5-10 pts) : **{stable}**\n")
        f.write(f"- Modéré (10-15 pts) : **{moderate}**\n")
        f.write(f"- Volatile (≥15 pts) : **{volatile}**\n")

    print(f"✓ {REPORT_PATH.relative_to(REPO_ROOT)}")

    # Console summary
    print()
    very_stable = sum(1 for r in rows if r["overall_stddev"] < 0.05)
    stable = sum(1 for r in rows if 0.05 <= r["overall_stddev"] < 0.10)
    moderate = sum(1 for r in rows if 0.10 <= r["overall_stddev"] < 0.15)
    volatile = sum(1 for r in rows if r["overall_stddev"] >= 0.15)
    total = len(rows)
    print(f"Analysed {total} combos with ≥3 years of CA data:")
    print(f"  Very stable (<5pt stddev)  : {very_stable:3d} ({100*very_stable/total:.0f}%)")
    print(f"  Stable (5-10pt)            : {stable:3d} ({100*stable/total:.0f}%)")
    print(f"  Moderate (10-15pt)         : {moderate:3d} ({100*moderate/total:.0f}%)")
    print(f"  Volatile (≥15pt)           : {volatile:3d} ({100*volatile/total:.0f}%)")
    print()
    print("Top 5 most volatile combos (risque imputation):")
    for r in rows[-5:][::-1]:
        major = sorted(
            ((fn, s) for fn, s in r["per_fonction_stats"].items() if s["mean"] >= 0.05),
            key=lambda x: -x[1]["mean"]
        )
        display = ", ".join(f"{fn}={s['min']*100:.0f}-{s['max']*100:.0f}%" for fn, s in major[:3])
        print(f"  [{r['overall_stddev']*100:.0f}pt] {r['category']} → {r['flow_category']}: {display}")


if __name__ == "__main__":
    main()
