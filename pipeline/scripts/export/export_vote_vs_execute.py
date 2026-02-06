#!/usr/bin/env python3
"""
Export Vote vs Execute Data for Paris Budget Dashboard

Queries the mart_vote_vs_execute model to generate JSON files for the
/prevision page with:
- Global execution rates by year and section
- Per-post ranking by execution gap
- Estimation tables for 2025-2026 (vote-only years)
- Detail by thematique

Coverage:
  - Comparison possible: 2019-2024 (both Vote + Execute exist)
    * 2019: Vote from OpenData CSV
    * 2020-2024: Vote from PDFs éditique BG
  - Vote-only (forecast): 2025-2026

Output:
    website/public/data/vote_vs_execute.json

Usage:
    python pipeline/scripts/export/export_vote_vs_execute.py
"""

import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from google.cloud import bigquery

# Import logger utility
sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.logger import Logger

logger = Logger("export_vote_execute")

# Configuration
PROJECT_ID = "open-data-france-484717"
MART_DATASET = "dbt_paris_marts"
ANALYTICS_DATASET = "dbt_paris_analytics"
OUTPUT_DIR = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data"


def get_bigquery_client() -> bigquery.Client:
    """Initialize BigQuery client."""
    return bigquery.Client(project=PROJECT_ID)


def fetch_mart_data(client: bigquery.Client) -> list[dict]:
    """
    Fetch all rows from mart_vote_vs_execute.

    Returns list of dicts with all mart columns.
    """
    logger.info("Fetching data from mart_vote_vs_execute...")

    query = f"""
    SELECT
        annee,
        section,
        sens_flux,
        chapitre_code,
        chapitre_libelle,
        ode_thematique,
        montant_vote,
        montant_execute,
        taux_execution_pct,
        ecart_absolu,
        ecart_relatif_pct,
        comparaison_possible,
        vote_seul,
        taux_execution_moyen,
        taux_execution_stddev,
        nb_annees_comparees,
        montant_estime,
        confiance_estimation
    FROM `{PROJECT_ID}.{MART_DATASET}.mart_vote_vs_execute`
    ORDER BY annee, section, sens_flux, chapitre_code
    """

    results = client.query(query).result()
    rows = []
    for row in results:
        rows.append({
            "annee": row.annee,
            "section": row.section,
            "sens_flux": row.sens_flux,
            "chapitre_code": row.chapitre_code,
            "chapitre_libelle": row.chapitre_libelle,
            "ode_thematique": row.ode_thematique,
            "montant_vote": float(row.montant_vote) if row.montant_vote else None,
            "montant_execute": float(row.montant_execute) if row.montant_execute else None,
            "taux_execution_pct": float(row.taux_execution_pct) if row.taux_execution_pct else None,
            "ecart_absolu": float(row.ecart_absolu) if row.ecart_absolu else None,
            "ecart_relatif_pct": float(row.ecart_relatif_pct) if row.ecart_relatif_pct else None,
            "comparaison_possible": row.comparaison_possible,
            "vote_seul": row.vote_seul,
            "taux_execution_moyen": float(row.taux_execution_moyen) if row.taux_execution_moyen else None,
            "taux_execution_stddev": float(row.taux_execution_stddev) if row.taux_execution_stddev else None,
            "nb_annees_comparees": row.nb_annees_comparees,
            "montant_estime": float(row.montant_estime) if row.montant_estime else None,
            "confiance_estimation": row.confiance_estimation,
        })

    logger.info(f"  - {len(rows)} rows fetched")
    return rows


def build_global_rates(rows: list[dict]) -> list[dict]:
    """
    Build global execution rates by year and section.

    Returns list of year objects with taux_global, taux_fonctionnement,
    taux_investissement.
    """
    # Aggregate vote and execute by year × section (depenses only for rates)
    agg = defaultdict(lambda: defaultdict(lambda: {"vote": 0, "execute": 0}))

    for r in rows:
        if r["sens_flux"] != "Dépense":
            continue
        if not r["montant_vote"] or r["montant_vote"] <= 0:
            continue
        key_section = r["section"] if r["section"] else "Autre"
        agg[r["annee"]][key_section]["vote"] += r["montant_vote"]
        if r["montant_execute"]:
            agg[r["annee"]][key_section]["execute"] += r["montant_execute"]

    result = []
    for annee in sorted(agg.keys()):
        sections = agg[annee]
        total_vote = sum(s["vote"] for s in sections.values())
        total_exec = sum(s["execute"] for s in sections.values())

        year_data = {
            "annee": annee,
            "type": "comparaison" if total_exec > 0 else "previsionnel",
            "depenses_vote": total_vote,
            "depenses_execute": total_exec if total_exec > 0 else None,
            "taux_global": round(total_exec / total_vote * 100, 1) if total_vote > 0 and total_exec > 0 else None,
        }

        # Per-section rates
        for section_name in ["Fonctionnement", "Investissement"]:
            s = sections.get(section_name, {"vote": 0, "execute": 0})
            key = section_name.lower()[:5]  # "fonct" or "inves"
            year_data[f"vote_{key}"] = s["vote"]
            year_data[f"execute_{key}"] = s["execute"] if s["execute"] > 0 else None
            year_data[f"taux_{key}"] = (
                round(s["execute"] / s["vote"] * 100, 1)
                if s["vote"] > 0 and s["execute"] > 0
                else None
            )

        result.append(year_data)

    return result


def build_ecart_ranking(rows: list[dict]) -> list[dict]:
    """
    Build ranking of budget posts by average execution gap.

    Groups by (section, ode_thematique, sens_flux), averages over comparison years.
    Sorted by absolute ecart.
    """
    # Aggregate: (thematique, section, sens_flux) → list of ecart_relatif_pct
    agg = defaultdict(lambda: {"ecarts": [], "vote_total": 0, "exec_total": 0, "annees": set()})

    for r in rows:
        if not r["comparaison_possible"]:
            continue
        if not r["ode_thematique"]:
            continue
        key = (r["ode_thematique"], r["section"], r["sens_flux"])
        if r["ecart_relatif_pct"] is not None:
            agg[key]["ecarts"].append(r["ecart_relatif_pct"])
        if r["montant_vote"]:
            agg[key]["vote_total"] += r["montant_vote"]
        if r["montant_execute"]:
            agg[key]["exec_total"] += r["montant_execute"]
        agg[key]["annees"].add(r["annee"])

    result = []
    for (thematique, section, sens_flux), data in agg.items():
        if not data["ecarts"]:
            continue
        ecart_moyen = sum(data["ecarts"]) / len(data["ecarts"])
        result.append({
            "thematique": thematique,
            "section": section,
            "sens_flux": sens_flux,
            "ecart_moyen_pct": round(ecart_moyen, 1),
            "vote_total": data["vote_total"],
            "execute_total": data["exec_total"],
            "taux_execution": round(data["exec_total"] / data["vote_total"] * 100, 1) if data["vote_total"] > 0 else None,
            "nb_annees": len(data["annees"]),
        })

    # Sort by absolute ecart (biggest gaps first)
    result.sort(key=lambda x: abs(x["ecart_moyen_pct"]), reverse=True)
    return result


def build_estimation_table(rows: list[dict]) -> list[dict]:
    """
    Build estimation table for vote-only years (2025-2026).

    Groups by (annee, section, sens_flux, ode_thematique).
    """
    result = []
    for r in rows:
        if not r["vote_seul"]:
            continue
        if not r["montant_vote"] or r["montant_vote"] <= 0:
            continue
        result.append({
            "annee": r["annee"],
            "section": r["section"],
            "sens_flux": r["sens_flux"],
            "thematique": r["ode_thematique"],
            "chapitre_code": r["chapitre_code"],
            "chapitre_libelle": r["chapitre_libelle"],
            "montant_vote": r["montant_vote"],
            "montant_estime": r["montant_estime"],
            "taux_execution_moyen": r["taux_execution_moyen"],
            "confiance": r["confiance_estimation"],
        })

    # Sort by montant_vote descending
    result.sort(key=lambda x: (x["annee"], -(x["montant_vote"] or 0)))
    return result


def build_detail_thematique(rows: list[dict]) -> list[dict]:
    """
    Build detail table by thematique with average vote/execute across years.

    Only includes comparison years and depenses.
    """
    # Aggregate by thematique
    agg = defaultdict(lambda: {
        "vote_by_year": defaultdict(float),
        "exec_by_year": defaultdict(float),
        "annees": set(),
    })

    for r in rows:
        if not r["comparaison_possible"]:
            continue
        if r["sens_flux"] != "Dépense":
            continue
        if not r["ode_thematique"]:
            continue

        key = r["ode_thematique"]
        if r["montant_vote"]:
            agg[key]["vote_by_year"][r["annee"]] += r["montant_vote"]
        if r["montant_execute"]:
            agg[key]["exec_by_year"][r["annee"]] += r["montant_execute"]
        agg[key]["annees"].add(r["annee"])

    result = []
    for thematique, data in agg.items():
        years = sorted(data["annees"])
        # Compute average and totals
        vote_values = list(data["vote_by_year"].values())
        exec_values = list(data["exec_by_year"].values())
        vote_avg = sum(vote_values) / len(vote_values) if vote_values else 0
        exec_avg = sum(exec_values) / len(exec_values) if exec_values else 0

        result.append({
            "thematique": thematique,
            "vote_moyen": round(vote_avg),
            "execute_moyen": round(exec_avg),
            "taux_execution": round(exec_avg / vote_avg * 100, 1) if vote_avg > 0 else None,
            "ecart_moyen": round(exec_avg - vote_avg),
            "annees_comparees": years,
            # Year-by-year data for sparklines
            "par_annee": [
                {
                    "annee": y,
                    "vote": round(data["vote_by_year"].get(y, 0)),
                    "execute": round(data["exec_by_year"].get(y, 0)),
                }
                for y in years
            ],
        })

    # Sort by vote_moyen descending (biggest posts first)
    result.sort(key=lambda x: -(x["vote_moyen"] or 0))
    return result


def build_estimation_summary(estimations: list[dict]) -> dict:
    """
    Build summary of estimations for 2025 and 2026.

    Aggregates by (annee, section, sens_flux).
    """
    agg = defaultdict(lambda: {"vote": 0, "estime": 0, "count": 0})

    for r in estimations:
        if r["sens_flux"] != "Dépense":
            continue
        key = (r["annee"], r["section"])
        agg[key]["vote"] += r["montant_vote"] or 0
        agg[key]["estime"] += r["montant_estime"] or 0
        agg[key]["count"] += 1

    result = {}
    for (annee, section), data in sorted(agg.items()):
        year_key = str(annee)
        if year_key not in result:
            result[year_key] = {"annee": annee, "sections": {}}
        result[year_key]["sections"][section] = {
            "vote": round(data["vote"]),
            "estime": round(data["estime"]),
            "taux_estime": round(data["estime"] / data["vote"] * 100, 1) if data["vote"] > 0 else None,
            "nb_postes": data["count"],
        }

    # Add totals per year
    for year_key, year_data in result.items():
        total_vote = sum(s["vote"] for s in year_data["sections"].values())
        total_estime = sum(s["estime"] for s in year_data["sections"].values())
        year_data["total_vote"] = total_vote
        year_data["total_estime"] = total_estime
        year_data["taux_global_estime"] = round(total_estime / total_vote * 100, 1) if total_vote > 0 else None

    return result


def transform_for_frontend(rows: list[dict]) -> dict:
    """
    Transform raw mart data into frontend-friendly JSON structure.

    Output structure:
    {
        "generated_at": "...",
        "coverage": { "comparison_years": [2023, 2024], "forecast_years": [2025, 2026] },
        "global_rates": [...],       // Taux d'exécution globaux par année
        "ecart_ranking": [...],      // Classement par écart (sur/sous-exécuté)
        "estimation_summary": {...}, // Résumé estimations 2025/2026
        "estimations": [...],        // Détail estimations par poste
        "detail_thematique": [...],  // Détail par thématique
    }
    """
    logger.info("Transforming data for frontend...")

    # Identify comparison vs forecast years
    comparison_years = sorted(set(
        r["annee"] for r in rows if r["comparaison_possible"]
    ))
    forecast_years = sorted(set(
        r["annee"] for r in rows if r["vote_seul"]
    ))

    logger.info(f"  - Comparison years: {comparison_years}")
    logger.info(f"  - Forecast years: {forecast_years}")

    # Build all sections
    global_rates = build_global_rates(rows)
    ecart_ranking = build_ecart_ranking(rows)
    estimations = build_estimation_table(rows)
    estimation_summary = build_estimation_summary(estimations)
    detail_thematique = build_detail_thematique(rows)

    result = {
        "generated_at": datetime.now().isoformat(),
        "source": "mart_vote_vs_execute",
        "description": (
            "Comparaison Budget Voté (BP) vs Budget Exécuté (CA) de la Ville de Paris. "
            "Le Budget Voté provient des PDFs Éditique BG (présentation croisée, "
            "opérations ventilées uniquement). Le Budget Exécuté provient du Compte "
            "Administratif (Open Data Paris)."
        ),
        "coverage": {
            "comparison_years": comparison_years,
            "forecast_years": forecast_years,
            "note_perimeter": (
                "Les montants couvrent les opérations ventilées par fonction "
                "(chapitres 900-908 et 930-938). Les opérations non-ventilées "
                "(dette, dotations globales) ne sont pas incluses dans la comparaison."
            ),
        },
        "definitions": {
            "taux_execution": "Montant exécuté / Montant voté × 100",
            "ecart_relatif": "(Exécuté - Voté) / Voté × 100 (positif = sur-exécuté)",
            "montant_estime": "Montant voté × taux d'exécution moyen historique",
            "comparaison": "Année où les deux données (vote + exécution) existent",
            "previsionnel": "Année avec uniquement le Budget Voté (pas encore exécuté)",
        },
        "global_rates": global_rates,
        "ecart_ranking": ecart_ranking,
        "estimation_summary": estimation_summary,
        "estimations": estimations,
        "detail_thematique": detail_thematique,
    }

    logger.info(f"  - {len(global_rates)} years in global_rates")
    logger.info(f"  - {len(ecart_ranking)} posts in ecart_ranking")
    logger.info(f"  - {len(estimations)} rows in estimations")
    logger.info(f"  - {len(detail_thematique)} thematiques in detail")

    return result


def save_json(data: dict, filename: str):
    """Save data to JSON file."""
    output_path = OUTPUT_DIR / filename
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    size_kb = output_path.stat().st_size / 1024
    logger.success(f"Saved {filename}", extra=f"{size_kb:.1f} KB")


def main():
    """Main export function."""
    logger.header("Export Vote vs Execute Data")

    try:
        client = get_bigquery_client()

        # Fetch raw mart data
        rows = fetch_mart_data(client)

        # Transform for frontend
        frontend_data = transform_for_frontend(rows)

        # Save single JSON file
        save_json(frontend_data, "vote_vs_execute.json")

        logger.header("Export completed")
        logger.summary()

    except Exception as e:
        logger.error(f"Export failed: {e}")
        raise


if __name__ == "__main__":
    main()
