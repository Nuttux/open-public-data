#!/usr/bin/env python3
"""
Export Marseille Budget Sankey → JSON

Reads mart_marseille_budget_sankey_lines (per-year, per-nature) and produces:
  website/public/data/marseille/budget_sankey_{year}.json
  website/public/data/marseille/budget_index.json

⚠ Différence vs export_sankey_data.py (Paris):
  - Paris regroupe par chapitre fonctionnel (930-939 = politique publique)
  - Marseille regroupe par `ode_categorie_flux` (par nature, M57 universel):
    Personnel / Achats / Subventions / Investissements matériels / etc.
  Because Marseille publishes its budget WITHOUT a functional dimension.

Output schema is JSON-compatible with Paris (BudgetClient consumes both).
"""

from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from pathlib import Path

from google.cloud import bigquery

PIPELINE_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PIPELINE_ROOT / "scripts"))
from utils.logger import Logger  # noqa: E402

PROJECT_ID = "open-data-france-484717"
# Marts dataset can be overridden (e.g. for dev runs against
# `dbt_paris_dev_<user>_marts`). Same env var as Paris export.
_MARTS_DATASET = os.environ.get("PARIS_MARTS_DATASET", "dbt_paris_marts")
MART_TABLE = f"{_MARTS_DATASET}.mart_marseille_budget_sankey_lines"
OUTPUT_DIR = PIPELINE_ROOT.parent / "website" / "public" / "data" / "marseille"

CITY_LABEL = "Marseille"
CENTRAL_NODE_NAME = f"Budget {CITY_LABEL}"

# Years in Marseille pipeline:
#   BP available: 2018-2024 (vote)
#   CA available: 2018-2022 (execute)
# We expose BP+CA: pick CA (execute) when available, else BP (vote).
EXECUTE_YEARS = [2018, 2019, 2020, 2021, 2022]
VOTE_ONLY_YEARS = [2023, 2024]
ALL_YEARS = sorted(set(EXECUTE_YEARS) | set(VOTE_ONLY_YEARS), reverse=True)


def get_bigquery_client() -> bigquery.Client:
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not creds_path:
        for p in [
            Path.home() / ".config" / "gcloud" / "application_default_credentials.json",
            PIPELINE_ROOT.parent / "credentials.json",
            PIPELINE_ROOT / "credentials.json",
        ]:
            if p.exists():
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(p)
                break
    return bigquery.Client(project=PROJECT_ID)


def query_year(client: bigquery.Client, year: int, type_budget: str) -> list[dict]:
    """Query Marseille budget lines for one (year, type_budget)."""
    sql = f"""
    SELECT
        sens_flux,
        ode_categorie_flux,
        nature_libelle,
        chapitre_libelle,
        section,
        montant
    FROM `{PROJECT_ID}.{MART_TABLE}`
    WHERE annee = {year}
      AND type_budget = '{type_budget}'
    """
    return [dict(row) for row in client.query(sql).result()]


def build_sankey(records: list[dict], year: int, type_budget: str) -> dict:
    """Aggregate by ode_categorie_flux on each side, build Sankey nodes/links."""
    revenue_by_cat = defaultdict(float)
    expense_by_cat = defaultdict(float)
    revenue_drill = defaultdict(lambda: defaultdict(float))
    # Keys: (flow_category, nature_libelle) — flow_category propagé pour rétro-
    # compat shape avec Paris (front PosteFiche peut afficher un tag si utile).
    # Pour Marseille la cat top-level == flow_category, donc le tag serait
    # redondant et le front s'en abstient — mais on garde le champ pour la
    # cohérence du contrat JSON multi-villes.
    expense_drill = defaultdict(lambda: defaultdict(float))

    # Track section breakdown per expense category (Fonct vs Invest)
    expense_section = defaultdict(lambda: {
        "Fonctionnement": {"total": 0.0, "items": defaultdict(float)},
        "Investissement": {"total": 0.0, "items": defaultdict(float)},
    })

    for r in records:
        montant = float(r.get("montant") or 0)
        sens = r.get("sens_flux") or ""
        cat = r.get("ode_categorie_flux") or "Autre"
        detail = r.get("nature_libelle") or r.get("chapitre_libelle") or "Non spécifié"
        section = r.get("section")

        if "Recette" in sens:
            revenue_by_cat[cat] += montant
            revenue_drill[cat][detail] += montant
        elif "Dépense" in sens:
            expense_by_cat[cat] += montant
            expense_drill[cat][(cat, detail)] += montant
            if section in ("Fonctionnement", "Investissement"):
                expense_section[cat][section]["total"] += montant
                expense_section[cat][section]["items"][(cat, detail)] += montant

    # Disambiguate node names if same category appears on both sides
    rev_names = {n for n, v in revenue_by_cat.items() if v > 0}
    exp_names = {n for n, v in expense_by_cat.items() if v > 0}
    collisions = rev_names & exp_names

    def rev_disp(n: str) -> str:
        return f"{n} (R)" if n in collisions else n

    def exp_disp(n: str) -> str:
        return f"{n} (D)" if n in collisions else n

    nodes = []
    for n in sorted(rev_names):
        nodes.append({"name": rev_disp(n), "category": "revenue"})
    nodes.append({"name": CENTRAL_NODE_NAME, "category": "central"})
    for n in sorted(exp_names):
        nodes.append({"name": exp_disp(n), "category": "expense"})

    links = []
    for n, v in revenue_by_cat.items():
        if v > 0:
            links.append({"source": rev_disp(n), "target": CENTRAL_NODE_NAME, "value": v})
    for n, v in expense_by_cat.items():
        if v > 0:
            links.append({"source": CENTRAL_NODE_NAME, "target": exp_disp(n), "value": v})

    drilldown = {"revenue": {}, "expenses": {}}
    for cat, items in revenue_drill.items():
        drilldown["revenue"][rev_disp(cat)] = sorted(
            [{"name": n, "value": v} for n, v in items.items() if v > 0],
            key=lambda x: -x["value"],
        )[:50]
    for cat, items in expense_drill.items():
        drilldown["expenses"][exp_disp(cat)] = sorted(
            [
                {"name": n, "value": v, "flow_category": flow}
                for (flow, n), v in items.items()
                if v > 0
            ],
            key=lambda x: -x["value"],
        )[:50]

    by_section = {}
    for cat, sections in expense_section.items():
        if expense_by_cat.get(cat, 0) <= 0:
            continue
        disp = exp_disp(cat)
        by_section[disp] = {}
        for sec_name, sec_data in sections.items():
            if sec_data["total"] > 0:
                items_sorted = sorted(
                    sec_data["items"].items(), key=lambda x: -x[1]
                )[:20]
                by_section[disp][sec_name] = {
                    "total": sec_data["total"],
                    "items": [
                        {"name": n, "value": v, "flow_category": flow}
                        for (flow, n), v in items_sorted
                    ],
                }

    total_recettes = sum(revenue_by_cat.values())
    total_depenses = sum(expense_by_cat.values())

    result = {
        "year": year,
        "city": "marseille",
        "city_label": CITY_LABEL,
        "type_budget": type_budget,
        "dataStatus": "COMPLET" if type_budget == "execute" else "BUDGET_VOTE",
        "dataAvailability": {
            "budget": True,
            "subventions": False,
            "autorisations": False,
            "arrondissements": False,
        },
        "totals": {
            "recettes": total_recettes,
            "depenses": total_depenses,
            "solde": total_recettes - total_depenses,
        },
        "nodes": nodes,
        "links": links,
        "drilldown": drilldown,
        "bySection": by_section,
        "byEntity": [],
        "drill_down": {},  # legacy field used by Paris client
    }

    if type_budget == "vote":
        result["disclaimer"] = (
            "Budget prévisionnel voté par le Conseil municipal (Budget Primitif). "
            "Les montants réellement exécutés seront disponibles après publication "
            "du Compte Administratif."
        )
    return result


def export_year(client: bigquery.Client, year: int, log: Logger) -> dict | None:
    type_budget = "execute" if year in EXECUTE_YEARS else "vote"
    log.info(f"querying {year} ({type_budget})")
    records = query_year(client, year, type_budget)
    log.info(f"  {len(records)} rows")

    if not records:
        log.warning(f"no data for {year} {type_budget} — skipping")
        return None

    sankey = build_sankey(records, year, type_budget)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_file = OUTPUT_DIR / f"budget_sankey_{year}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(sankey, f, ensure_ascii=False, indent=2)
    log.success(
        f"  ✓ {out_file.name}",
        extra=f"R={sankey['totals']['recettes']/1e9:.2f} Md€ "
              f"D={sankey['totals']['depenses']/1e9:.2f} Md€",
    )
    return {
        "year": year,
        "type_budget": type_budget,
        "dataStatus": sankey["dataStatus"],
        "recettes": sankey["totals"]["recettes"],
        "depenses": sankey["totals"]["depenses"],
        "solde": sankey["totals"]["solde"],
    }


def export_index(summaries: list[dict], log: Logger):
    summaries = [s for s in summaries if s]
    summaries.sort(key=lambda x: x["year"], reverse=True)
    complete_years = [s["year"] for s in summaries if s["dataStatus"] == "COMPLET"]
    voted_years = [s["year"] for s in summaries if s["dataStatus"] == "BUDGET_VOTE"]
    year_types = {str(s["year"]): s["type_budget"] for s in summaries}

    index = {
        "city": "marseille",
        "city_label": CITY_LABEL,
        "availableYears": [s["year"] for s in summaries],
        "latestYear": summaries[0]["year"] if summaries else None,
        "latestCompleteYear": complete_years[0] if complete_years else None,
        "completeYears": complete_years,
        "partialYears": [],
        "votedYears": voted_years,
        "year_types": year_types,
        "covid_years": [2020, 2021],
        "summary": summaries,
    }
    out_file = OUTPUT_DIR / "budget_index.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    log.success(f"index → {out_file.name}", extra=f"{len(summaries)} years")


def main() -> int:
    log = Logger("export_marseille_sankey")
    log.header("Export Marseille Budget Sankey → JSON")

    log.info("output dir", extra=str(OUTPUT_DIR))
    log.info("source mart", extra=MART_TABLE)

    log.section("BigQuery client")
    client = get_bigquery_client()
    log.success("connected", extra=PROJECT_ID)

    log.section(f"Exporting {len(ALL_YEARS)} years")
    summaries = []
    for year in ALL_YEARS:
        try:
            summaries.append(export_year(client, year, log))
        except Exception as e:
            log.error(f"failed year {year}", extra=str(e))
            import traceback
            traceback.print_exc()

    log.section("Index")
    export_index(summaries, log)

    log.summary()
    return 0


if __name__ == "__main__":
    sys.exit(main())
