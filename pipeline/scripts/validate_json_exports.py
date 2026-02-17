#!/usr/bin/env python3
from __future__ import annotations
"""
Validate JSON exports against expected structure and cross-check totals.

Usage:
    python pipeline/scripts/validate_json_exports.py

Checks:
    1. Budget Sankey: structure, totals > 0, nodes/links present
    2. Bilan Sankey: actif/passif totals, KPIs present
    3. Evolution Budget: all expected years, totals consistency
    4. Subventions Treemap: totals, thematique count
    5. Budget Nature: niveau_1 sums match total_depenses
    6. Vote vs Execute: coverage years, taux_execution range
    7. Cross-file: budget_sankey depenses == evolution_budget depenses per year
"""

import json
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "website" / "public" / "data"

passed = 0
failed = 0
warned = 0


def check(name: str, condition: bool, msg: str = ""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✅ {name}")
    else:
        failed += 1
        print(f"  ❌ {name}: {msg}")


def warn(name: str, condition: bool, msg: str = ""):
    global passed, warned
    if condition:
        passed += 1
        print(f"  ✅ {name}")
    else:
        warned += 1
        print(f"  ⚠️  {name}: {msg}")


def load_json(path: Path) -> dict | list | None:
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"  ❌ Failed to load {path.name}: {e}")
        global failed
        failed += 1
        return None


def validate_budget_sankey():
    print("\n── Budget Sankey ──")
    years_found = []
    for f in sorted(DATA_DIR.glob("budget_sankey_*.json")):
        data = load_json(f)
        if data is None:
            continue
        year = data.get("year")
        years_found.append(year)

        check(f"  {year}: has totals", "totals" in data, "missing totals key")
        if "totals" in data:
            check(f"  {year}: depenses > 0", data["totals"].get("depenses", 0) > 0,
                  f"depenses = {data['totals'].get('depenses')}")
            check(f"  {year}: recettes > 0", data["totals"].get("recettes", 0) > 0,
                  f"recettes = {data['totals'].get('recettes')}")

        check(f"  {year}: has nodes", len(data.get("nodes", [])) > 0, "no nodes")
        check(f"  {year}: has links", len(data.get("links", [])) > 0, "no links")

    check("budget_sankey: at least 6 year files", len(years_found) >= 6,
          f"found {len(years_found)}")


def validate_bilan_sankey():
    print("\n── Bilan Sankey ──")
    years_found = []
    for f in sorted(DATA_DIR.glob("bilan_sankey_*.json")):
        data = load_json(f)
        if data is None:
            continue
        year = data.get("year")
        years_found.append(year)

        totals = data.get("totals", {})
        check(f"  {year}: has actif_net", "actif_net" in totals, "missing actif_net")
        check(f"  {year}: has passif_net", "passif_net" in totals, "missing passif_net")

        if "actif_net" in totals and "passif_net" in totals:
            actif = totals["actif_net"]
            passif = totals["passif_net"]
            pct_diff = abs(actif - passif) / max(actif, passif) * 100 if max(actif, passif) > 0 else 0
            warn(f"  {year}: actif ≈ passif (within 5%)", pct_diff < 5,
                 f"actif={actif:.0f}, passif={passif:.0f}, diff={pct_diff:.2f}%")

        check(f"  {year}: has KPIs", "kpis" in data, "missing kpis")
        check(f"  {year}: has nodes", len(data.get("nodes", [])) > 0, "no nodes")

    check("bilan_sankey: at least 4 year files", len(years_found) >= 4,
          f"found {len(years_found)}")


def validate_evolution_budget():
    print("\n── Evolution Budget ──")
    data = load_json(DATA_DIR / "evolution_budget.json")
    if data is None:
        return

    years = data.get("years", [])
    check("evolution: has years", len(years) > 0, "empty years array")
    check("evolution: at least 6 years", len(years) >= 6, f"found {len(years)}")

    for y in years:
        year = y.get("year")
        totals = y.get("totals", {})
        check(f"  {year}: has recettes", totals.get("recettes", 0) != 0,
              "recettes is 0 or missing")
        check(f"  {year}: has depenses", totals.get("depenses", 0) != 0,
              "depenses is 0 or missing")

        # Sections should add up to totals
        sections = y.get("sections", {})
        if sections:
            fonct = sections.get("fonctionnement", {})
            invest = sections.get("investissement", {})
            section_depenses = fonct.get("depenses", 0) + invest.get("depenses", 0)
            if section_depenses > 0 and totals.get("depenses", 0) > 0:
                pct = abs(section_depenses - totals["depenses"]) / totals["depenses"] * 100
                warn(f"  {year}: sections sum ≈ totals (within 1%)", pct < 1,
                     f"sections={section_depenses:.0f}, total={totals['depenses']:.0f}, diff={pct:.2f}%")


def validate_subventions_treemap():
    print("\n── Subventions Treemap ──")
    years_found = []
    for f in sorted((DATA_DIR / "subventions").glob("treemap_*.json")):
        data = load_json(f)
        if data is None:
            continue
        year = data.get("year")
        years_found.append(year)

        check(f"  {year}: total_montant > 0", data.get("total_montant", 0) > 0,
              f"total_montant = {data.get('total_montant')}")
        check(f"  {year}: has data array", len(data.get("data", [])) > 0, "empty data")

        # Sum of data items should match total_montant
        items = data.get("data", [])
        items_total = sum(item.get("montant_total", 0) for item in items)
        declared_total = data.get("total_montant", 0)
        if declared_total > 0:
            pct = abs(items_total - declared_total) / declared_total * 100
            check(f"  {year}: items sum ≈ total (within 1%)", pct < 1,
                  f"items={items_total:.0f}, total={declared_total:.0f}, diff={pct:.2f}%")

    check("treemap: at least 4 year files", len(years_found) >= 4,
          f"found {len(years_found)}")


def validate_budget_nature():
    print("\n── Budget Nature ──")
    for f in sorted(DATA_DIR.glob("budget_nature_*.json")):
        if f.name == "budget_nature_index.json":
            continue
        data = load_json(f)
        if data is None:
            continue
        year = data.get("year")

        total_dep = data.get("total_depenses", 0)
        check(f"  {year}: total_depenses > 0", total_dep > 0,
              f"total_depenses = {total_dep}")

        # niveau_1 items should sum close to total
        niveau_1 = data.get("niveau_1", [])
        check(f"  {year}: has niveau_1", len(niveau_1) > 0, "empty niveau_1")
        n1_total = sum(item.get("montant", 0) for item in niveau_1)
        if total_dep > 0 and n1_total > 0:
            pct = abs(n1_total - total_dep) / total_dep * 100
            check(f"  {year}: niveau_1 sum ≈ total (within 1%)", pct < 1,
                  f"n1={n1_total:.0f}, total={total_dep:.0f}, diff={pct:.2f}%")


def validate_vote_vs_execute():
    print("\n── Vote vs Execute ──")
    data = load_json(DATA_DIR / "vote_vs_execute.json")
    if data is None:
        return

    coverage = data.get("coverage", {})
    comp_years = coverage.get("comparison_years", [])
    check("vote_vs_execute: has comparison years", len(comp_years) >= 4,
          f"found {len(comp_years)}")

    chapters = data.get("chapters", [])
    if chapters:
        for ch in chapters[:5]:  # spot-check first 5
            taux = ch.get("taux_execution")
            if taux is not None:
                warn(f"  chapter {ch.get('chapitre_libelle', '?')}: taux in [10, 300]",
                     10 <= taux <= 300,
                     f"taux_execution = {taux}")


def validate_cross_file_consistency():
    print("\n── Cross-File Consistency ──")
    # Budget sankey depenses vs evolution budget depenses per year
    evo_data = load_json(DATA_DIR / "evolution_budget.json")
    if evo_data is None:
        return

    evo_by_year = {y["year"]: y["totals"]["depenses"] for y in evo_data.get("years", [])
                   if "totals" in y and "depenses" in y["totals"]}

    for f in sorted(DATA_DIR.glob("budget_sankey_*.json")):
        data = load_json(f)
        if data is None:
            continue
        year = data.get("year")
        sankey_dep = data.get("totals", {}).get("depenses", 0)
        evo_dep = evo_by_year.get(year)

        if evo_dep and sankey_dep > 0:
            pct = abs(sankey_dep - evo_dep) / evo_dep * 100
            check(f"  {year}: sankey dep ≈ evolution dep (within 1%)", pct < 1,
                  f"sankey={sankey_dep:.0f}, evo={evo_dep:.0f}, diff={pct:.2f}%")


def main():
    print("=" * 60)
    print("JSON Export Validation")
    print(f"Data directory: {DATA_DIR}")
    print("=" * 60)

    validate_budget_sankey()
    validate_bilan_sankey()
    validate_evolution_budget()
    validate_subventions_treemap()
    validate_budget_nature()
    validate_vote_vs_execute()
    validate_cross_file_consistency()

    print("\n" + "=" * 60)
    print(f"Results: {passed} passed, {failed} failed, {warned} warnings")
    print("=" * 60)

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
