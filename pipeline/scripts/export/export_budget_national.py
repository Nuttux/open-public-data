#!/usr/bin/env python3
"""
Export National Budget-by-nature → per-commune JSON.

Reads mart_sankey_national (line-level, axe NATURE, all communes) and produces,
for each requested commune, in the SAME JSON contract as Paris/Marseille
(BudgetClient / loadBudgetPageData consume all three):

    website/public/data/communes-budget/{slug}/budget_sankey_{year}.json
    website/public/data/communes-budget/{slug}/budget_index.json

The slug↔insee mapping comes from the frontend all-communes index
(communes-all/index.json) so routing and export agree exactly.

This is the NATIONAL tier: every commune present in the mart can be exported.
Block 1 exports a documented subset (--slugs / --insee / --limit); --all is
capable but committing ~35k × N files is a deploy-scale decision (see report).

Usage:
    python scripts/export/export_budget_national.py --slugs albi cerizay
    python scripts/export/export_budget_national.py --insee 81004 79062
    python scripts/export/export_budget_national.py --all --limit 50
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import bigquery

PIPELINE_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ID = "open-data-france-484717"
_MARTS_DATASET = os.environ.get("PARIS_MARTS_DATASET", "dbt_paris_marts")
MART_TABLE = f"{PROJECT_ID}.{_MARTS_DATASET}.mart_sankey_national"

WEBSITE_DATA = PIPELINE_ROOT.parent / "website" / "public" / "data"
INDEX_FILE = WEBSITE_DATA / "communes-all" / "index.json"
OUT_ROOT = WEBSITE_DATA / "communes-budget"

SOURCE_LABEL = "Balances comptables DGFiP (axe nature)"
SOURCE_URL = "https://data.economie.gouv.fr/explore/dataset/balances-comptables-des-communes-en-2024/"
SOURCE_PIPELINE = "sync_dgfip_balances_national.py → dbt national (mart_sankey_national) → export_budget_national.py"


def load_slug_index() -> dict[str, dict]:
    """insee → {slug, nom, pop, siren} from the frontend all-communes index."""
    idx = json.load(open(INDEX_FILE, encoding="utf-8"))
    return idx["communes"]


def get_client() -> bigquery.Client:
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        for p in [
            Path.home() / ".config" / "gcloud" / "application_default_credentials.json",
            PIPELINE_ROOT.parent / "credentials.json",
        ]:
            if p.exists():
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(p)
                break
    return bigquery.Client(project=PROJECT_ID)


def fetch_lines(client: bigquery.Client, insees: list[str] | None) -> dict[str, list[dict]]:
    """Return {insee: [line dicts]} for the requested communes (or all)."""
    where = ""
    params = []
    if insees:
        where = "WHERE code_insee IN UNNEST(@insees)"
        params = [bigquery.ArrayQueryParameter("insees", "STRING", insees)]
    sql = f"""
        SELECT code_insee, commune_nom, population, annee, section,
               sens_flux, sankey_group_fr, category_fr, montant
        FROM `{MART_TABLE}`
        {where}
    """
    job = client.query(
        sql, job_config=bigquery.QueryJobConfig(query_parameters=params)
    )
    by_insee: dict[str, list[dict]] = defaultdict(list)
    for row in job.result():
        by_insee[row["code_insee"]].append(dict(row))
    return by_insee


def build_sankey(records: list[dict], year: int, central: str) -> dict:
    """Aggregate by sankey_group on each side; build nodes/links/drilldown/bySection."""
    revenue_by_cat: dict[str, float] = defaultdict(float)
    expense_by_cat: dict[str, float] = defaultdict(float)
    revenue_drill = defaultdict(lambda: defaultdict(float))
    expense_drill = defaultdict(lambda: defaultdict(float))
    expense_section = defaultdict(lambda: {
        "Fonctionnement": {"total": 0.0, "items": defaultdict(float)},
        "Investissement": {"total": 0.0, "items": defaultdict(float)},
    })

    for r in records:
        if int(r["annee"]) != year:
            continue
        montant = float(r.get("montant") or 0)
        if montant <= 0:
            continue
        sens = r.get("sens_flux") or ""
        cat = r.get("sankey_group_fr") or "Autre"
        detail = r.get("category_fr") or "Non spécifié"
        section = r.get("section")
        if sens == "Recette":
            revenue_by_cat[cat] += montant
            revenue_drill[cat][detail] += montant
        elif sens == "Depense":
            expense_by_cat[cat] += montant
            expense_drill[cat][detail] += montant
            if section in ("Fonctionnement", "Investissement"):
                expense_section[cat][section]["total"] += montant
                expense_section[cat][section]["items"][detail] += montant

    rev_names = {n for n, v in revenue_by_cat.items() if v > 0}
    exp_names = {n for n, v in expense_by_cat.items() if v > 0}
    collisions = rev_names & exp_names  # e.g. "Emprunts et dettes" both sides

    def rev_disp(n: str) -> str:
        return f"{n} (R)" if n in collisions else n

    def exp_disp(n: str) -> str:
        return f"{n} (D)" if n in collisions else n

    nodes = [{"name": rev_disp(n), "category": "revenue"} for n in sorted(rev_names)]
    nodes.append({"name": central, "category": "central"})
    nodes += [{"name": exp_disp(n), "category": "expense"} for n in sorted(exp_names)]

    links = []
    for n, v in revenue_by_cat.items():
        if v > 0:
            links.append({"source": rev_disp(n), "target": central, "value": v})
    for n, v in expense_by_cat.items():
        if v > 0:
            links.append({"source": central, "target": exp_disp(n), "value": v})

    drilldown = {"revenue": {}, "expenses": {}}
    for cat, items in revenue_drill.items():
        drilldown["revenue"][rev_disp(cat)] = sorted(
            [{"name": n, "value": v} for n, v in items.items() if v > 0],
            key=lambda x: -x["value"],
        )[:50]
    for cat, items in expense_drill.items():
        drilldown["expenses"][exp_disp(cat)] = sorted(
            [{"name": n, "value": v} for n, v in items.items() if v > 0],
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
                items_sorted = sorted(sec_data["items"].items(), key=lambda x: -x[1])[:20]
                by_section[disp][sec_name] = {
                    "total": sec_data["total"],
                    "items": [{"name": n, "value": v} for n, v in items_sorted],
                }

    total_recettes = sum(revenue_by_cat.values())
    total_depenses = sum(expense_by_cat.values())
    return {
        "year": year,
        "type_budget": "execute",
        "dataStatus": "COMPLET",
        "axis": "nature",
        "source": SOURCE_LABEL,
        "source_url": SOURCE_URL,
        "totals": {
            "recettes": total_recettes,
            "depenses": total_depenses,
            "solde": total_recettes - total_depenses,
        },
        "nodes": nodes,
        "links": links,
        "drilldown": drilldown,
        "bySection": by_section,
    }


def export_commune(insee: str, meta: dict, records: list[dict]) -> dict | None:
    slug = meta["slug"]
    nom = meta["nom"]
    central = f"Budget {nom}"
    years = sorted({int(r["annee"]) for r in records}, reverse=True)
    if not years:
        return None

    out_dir = OUT_ROOT / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()

    summaries = []
    for year in years:
        sankey = build_sankey(records, year, central)
        if sankey["totals"]["depenses"] <= 0 and sankey["totals"]["recettes"] <= 0:
            continue
        sankey["generated_at"] = now
        sankey["source_pipeline"] = SOURCE_PIPELINE
        sankey["commune"] = {"insee": insee, "slug": slug, "nom": nom}
        with open(out_dir / f"budget_sankey_{year}.json", "w", encoding="utf-8") as f:
            json.dump(sankey, f, ensure_ascii=False, indent=2)
        summaries.append({
            "year": year,
            "type_budget": "execute",
            "dataStatus": "COMPLET",
            "depenses": sankey["totals"]["depenses"],
            "recettes": sankey["totals"]["recettes"],
            "solde": sankey["totals"]["solde"],
        })

    if not summaries:
        return None
    summaries.sort(key=lambda s: s["year"], reverse=True)
    index = {
        "generated_at": now,
        "source_pipeline": SOURCE_PIPELINE,
        "source": SOURCE_LABEL,
        "source_url": SOURCE_URL,
        "axis": "nature",
        "commune": {"insee": insee, "slug": slug, "nom": nom},
        "availableYears": [s["year"] for s in summaries],
        "latestYear": summaries[0]["year"],
        "latestCompleteYear": summaries[0]["year"],
        "completeYears": [s["year"] for s in summaries],
        "partialYears": [],
        "votedYears": [],
        "summary": summaries,
    }
    with open(out_dir / "budget_index.json", "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    return {"slug": slug, "nom": nom, "insee": insee, "years": index["availableYears"]}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", nargs="*", default=[])
    ap.add_argument("--insee", nargs="*", default=[])
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    slug_index = load_slug_index()
    slug_to_insee = {v["slug"]: k for k, v in slug_index.items()}

    target_insees: list[str] | None
    if args.all:
        target_insees = None
        print("→ Exporting ALL communes present in the mart")
    else:
        target_insees = list(args.insee)
        for s in args.slugs:
            if s in slug_to_insee:
                target_insees.append(slug_to_insee[s])
            else:
                print(f"  ⚠️  slug '{s}' not in all-communes index — skipping")
        if not target_insees:
            print("Nothing to export. Pass --slugs/--insee/--all.")
            return 1
        print(f"→ Exporting {len(target_insees)} commune(s): {target_insees}")

    client = get_client()
    by_insee = fetch_lines(client, target_insees)
    print(f"  mart returned lines for {len(by_insee)} commune(s)")

    exported = []
    all_insees = list(by_insee.keys())
    if args.limit:
        all_insees = all_insees[: args.limit]
        print(f"  ⚠️  --limit {args.limit}: capping export at {len(all_insees)} communes (rest deferred, NOT dropped from pipeline)")
    for insee in all_insees:
        meta = slug_index.get(insee)
        if not meta:
            print(f"  ⚠️  insee {insee} not in all-communes index — cannot map to slug, skipping")
            continue
        res = export_commune(insee, meta, by_insee[insee])
        if res:
            exported.append(res)
            print(f"  ✓ {res['slug']} ({insee}) — years {res['years']}")

    print(f"\n✓ Exported {len(exported)} commune(s) → {OUT_ROOT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
