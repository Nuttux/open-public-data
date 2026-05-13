#!/usr/bin/env python3
"""
POC stub: build Marseille budget JSON directly from a data.gouv.fr CSV
(bypasses BigQuery + dbt + export to unblock front rendering before the
full pipeline tooling is plumbed).

Reproduces inline:
  - the staging logic of stg_marseille_budget (schema normalisation)
  - the mart logic of mart_marseille_budget_sankey_lines (ode_categorie_flux)
  - the export logic of export_marseille_sankey.py (Sankey build)

Outputs:
  website/public/data/marseille/budget_sankey_2024.json
  website/public/data/marseille/budget_index.json

⚠ This is a one-shot POC fixture — once the BQ pipeline is wired,
delete this script and use the canonical export path.
"""

from __future__ import annotations

import csv
import io
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from urllib.request import Request, urlopen

OUT_DIR = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data" / "marseille"

CITY = "marseille"
CITY_LABEL = "Marseille"
CENTRAL_NODE = f"Budget {CITY_LABEL}"

# data.gouv.fr API resolution: dataset slug → CSV resource URL
DATAGOUV_API = "https://www.data.gouv.fr/api/1/datasets/{slug}/"


def fetch_csv_for_slug(slug: str) -> bytes:
    api_url = DATAGOUV_API.format(slug=slug)
    req = Request(api_url, headers={"User-Agent": "france-open-data-poc/1.0"})
    with urlopen(req, timeout=30) as resp:
        meta = json.load(resp)
    csv_resources = [r for r in meta.get("resources", []) if "csv" in (r.get("format") or "").lower()]
    if not csv_resources:
        raise RuntimeError(f"No CSV in {slug}")
    csv_resources.sort(key=lambda r: r.get("last_modified") or "", reverse=True)
    url = csv_resources[0]["url"]
    print(f"  fetching {url}")
    req = Request(url, headers={"User-Agent": "france-open-data-poc/1.0"})
    with urlopen(req, timeout=120) as resp:
        return resp.read()


def categorise(nature_code: str, sens: str) -> str:
    """Replicate mart_marseille_budget_sankey_lines.ode_categorie_flux."""
    n = nature_code or ""
    if n.startswith("64"):
        return "Personnel"
    if n.startswith("657"):
        return "Subventions (fonctionnement)"
    if n.startswith("204"):
        return "Subventions (investissement)"
    if n.startswith("651") or n.startswith("652"):
        return "Transferts sociaux"
    if n.startswith("655") or n.startswith("656"):
        return "Contributions obligatoires"
    if n.startswith("60"):
        return "Achats"
    if n.startswith("61"):
        return "Services extérieurs"
    if n.startswith("62"):
        return "Autres services"
    if n.startswith("66"):
        return "Charges financières"
    if n.startswith("16"):
        return "Remboursement dette"
    if n.startswith("739"):
        return "Reversements péréquation"
    if n.startswith("748"):
        return "Dotations arrondissements"
    if n.startswith("21"):
        return "Immobilisations corporelles"
    if n.startswith("23"):
        return "Immobilisations en cours"
    if n.startswith("20") and not n.startswith("204"):
        return "Études"
    if n.startswith("73"):
        return "Impôts et taxes"
    if n.startswith("74"):
        return "Dotations et participations"
    if n.startswith("75"):
        return "Autres produits gestion"
    if n.startswith("70"):
        return "Produits services"
    return "Autre"


def _first(row: dict, *keys: str) -> str:
    """Return the first non-empty value across alias keys."""
    for k in keys:
        v = row.get(k)
        if v is not None and str(v).strip() != "":
            return str(v).strip()
    return ""


def parse_bp_csv(csv_bytes: bytes) -> list[dict]:
    """Parse BP Marseille CSV with year-to-year schema tolerance.

    Marseille publishes a different CSV shape almost every year — different
    separators (`,` vs `;`), different column names, sometimes an extra empty
    column. We sniff the separator and use alias lookups for each field.
    """
    text = csv_bytes.decode("utf-8", errors="replace")
    head = text.split("\n", 1)[0]
    sep = ";" if head.count(";") > head.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=sep)
    rows = []
    for r in reader:
        type_mvt = _first(r, "Type mvt", "Type Mvt").upper()
        if type_mvt not in ("REELS", "RÉEL", "REEL"):
            continue
        montant_raw = _first(
            r, "Montant BP en euros", "Montant BP", "Montant", "MontantBP",
        )
        try:
            montant = float(montant_raw.replace(",", ".").replace(" ", ""))
        except ValueError:
            continue
        if montant <= 0:
            continue

        section_raw = _first(r, "Section")
        # ⚠ Marseille uses "INVE" (not "INV") for Investissement
        section = "Fonctionnement" if section_raw == "FONC" else ("Investissement" if section_raw in ("INV", "INVE") else section_raw)
        sens_raw = _first(r, "Inscription")
        sens = "Dépense" if sens_raw == "DEP" else ("Recette" if sens_raw == "REC" else sens_raw)

        annee_raw = _first(r, "Exercice", "Exercice budgétaire")
        try:
            annee = int(annee_raw)
        except ValueError:
            continue
        rows.append({
            "annee": annee,
            "section": section,
            "sens_flux": sens,
            "chapitre_code": _first(r, "Chap"),
            "chapitre_libelle": _first(r, "Lib Chap", "Libellé Chap"),
            "nature_code": _first(r, "Nature"),
            "nature_libelle": _first(
                r, "Lib. article / nature", "Lib. Article", "Libellé nature",
            ),
            "montant": abs(montant),
        })
    return rows


def build_sankey(records: list[dict], year: int) -> dict:
    revenue = defaultdict(float)
    expense = defaultdict(float)
    revenue_drill = defaultdict(lambda: defaultdict(float))
    expense_drill = defaultdict(lambda: defaultdict(float))
    expense_section = defaultdict(lambda: {
        "Fonctionnement": {"total": 0.0, "items": defaultdict(float)},
        "Investissement": {"total": 0.0, "items": defaultdict(float)},
    })

    for r in records:
        cat = categorise(r["nature_code"], r["sens_flux"])
        montant = r["montant"]
        detail = r["nature_libelle"] or r["chapitre_libelle"] or "Non spécifié"

        if r["sens_flux"] == "Recette":
            revenue[cat] += montant
            revenue_drill[cat][detail] += montant
        elif r["sens_flux"] == "Dépense":
            expense[cat] += montant
            expense_drill[cat][detail] += montant
            section = r["section"]
            if section in ("Fonctionnement", "Investissement"):
                expense_section[cat][section]["total"] += montant
                expense_section[cat][section]["items"][detail] += montant

    rev_names = {n for n, v in revenue.items() if v > 0}
    exp_names = {n for n, v in expense.items() if v > 0}
    collisions = rev_names & exp_names

    def rev_disp(n: str) -> str:
        return f"{n} (R)" if n in collisions else n

    def exp_disp(n: str) -> str:
        return f"{n} (D)" if n in collisions else n

    nodes = []
    for n in sorted(rev_names):
        nodes.append({"name": rev_disp(n), "category": "revenue"})
    nodes.append({"name": CENTRAL_NODE, "category": "central"})
    for n in sorted(exp_names):
        nodes.append({"name": exp_disp(n), "category": "expense"})

    links = []
    for n, v in revenue.items():
        if v > 0:
            links.append({"source": rev_disp(n), "target": CENTRAL_NODE, "value": v})
    for n, v in expense.items():
        if v > 0:
            links.append({"source": CENTRAL_NODE, "target": exp_disp(n), "value": v})

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
        if expense.get(cat, 0) <= 0:
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

    total_r = sum(revenue.values())
    total_d = sum(expense.values())

    return {
        "year": year,
        "city": CITY,
        "city_label": CITY_LABEL,
        "type_budget": "vote",
        "dataStatus": "BUDGET_VOTE",
        "dataAvailability": {
            "budget": True,
            "subventions": False,
            "autorisations": False,
            "arrondissements": False,
        },
        "totals": {"recettes": total_r, "depenses": total_d, "solde": total_r - total_d},
        "nodes": nodes,
        "links": links,
        "drilldown": drilldown,
        "bySection": by_section,
        "byEntity": [],
        "drill_down": {},
        "disclaimer": (
            "Budget prévisionnel voté par le Conseil municipal (Budget Primitif). "
            "POC Marseille v1 — données extraites directement du CSV data.gouv.fr "
            "sans pipeline BigQuery."
        ),
    }


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    summaries = []
    # 7 années BP disponibles sur data.gouv.fr (2018-2024).
    # CA disponibles 2018-2022 mais avec 2 schémas différents — non couvert
    # par ce stub POC (sera ajouté quand le pipeline BQ tournera vraiment).
    for year in [2024, 2023, 2022, 2021, 2020, 2019, 2018]:
        slug = f"marseille-budget-primitif-{year}"
        print(f"\n=== {year} ===")
        try:
            csv_bytes = fetch_csv_for_slug(slug)
        except Exception as e:
            print(f"  skip {year}: {e}")
            continue
        rows = parse_bp_csv(csv_bytes)
        print(f"  parsed {len(rows)} rows")
        sankey = build_sankey(rows, year)
        out = OUT_DIR / f"budget_sankey_{year}.json"
        with open(out, "w", encoding="utf-8") as f:
            json.dump(sankey, f, ensure_ascii=False, indent=2)
        print(f"  → {out.name} ({sankey['totals']['recettes']/1e9:.2f} Md€ R, {sankey['totals']['depenses']/1e9:.2f} Md€ D)")
        summaries.append({
            "year": year,
            "type_budget": "vote",
            "dataStatus": "BUDGET_VOTE",
            "recettes": sankey["totals"]["recettes"],
            "depenses": sankey["totals"]["depenses"],
            "solde": sankey["totals"]["solde"],
        })

    summaries.sort(key=lambda s: s["year"], reverse=True)
    index = {
        "city": CITY,
        "city_label": CITY_LABEL,
        "availableYears": [s["year"] for s in summaries],
        "latestYear": summaries[0]["year"] if summaries else None,
        "latestCompleteYear": None,
        "completeYears": [],
        "partialYears": [],
        "votedYears": [s["year"] for s in summaries],
        "year_types": {str(s["year"]): "vote" for s in summaries},
        "covid_years": [2020, 2021],
        "summary": summaries,
    }
    out_index = OUT_DIR / "budget_index.json"
    with open(out_index, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"\n=== index → {out_index.name} ({len(summaries)} years) ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
