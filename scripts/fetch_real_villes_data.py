#!/usr/bin/env python3
"""
Fetch real open data for multi-city dashboard — no BigQuery needed.

Sources:
    - DGFiP Balances Comptables (data.economie.gouv.fr) → budget sankey, evolution, bilan
    - OFGL Agrégats (data.ofgl.fr) → benchmarking KPIs
    - DECP Marchés Publics (data.gouv.fr) → public contracts
    - Subventions SCDL (data.gouv.fr) → subsidies

Usage:
    python scripts/fetch_real_villes_data.py
    python scripts/fetch_real_villes_data.py --source dgfip   # single source
    python scripts/fetch_real_villes_data.py --dry-run         # preview only
"""

import argparse
import csv
import json
import time
from collections import defaultdict
from pathlib import Path

import pandas as pd
import requests

# =============================================================================
# Configuration
# =============================================================================

ROOT = Path(__file__).parent.parent
SEEDS_DIR = ROOT / "pipeline" / "seeds"
OUTPUT_DIR = ROOT / "website" / "public" / "data" / "villes"

DGFIP_API = "https://data.economie.gouv.fr/api/explore/v2.1"
OFGL_API = "https://data.ofgl.fr/api/explore/v2.1"

DGFIP_YEARS = list(range(2024, 2016, -1))  # 2024→2017

# M57 nomenclature (loaded from seed)
M57_MAP: dict[str, dict] = {}

# City display labels
CITY_LABELS = {
    "paris": "Budget Paris",
    "marseille": "Budget Marseille",
    "lyon": "Budget Lyon",
    "toulouse": "Budget Toulouse",
    "nice": "Budget Nice",
}

# CPV code → category mapping
CPV_CATEGORIES = {
    "09": "Énergie",
    "30": "Informatique & Télécom", "32": "Informatique & Télécom",
    "34": "Transport & Véhicules", "50": "Transport & Véhicules",
    "33": "Santé & Social", "85": "Santé & Social",
    "45": "Construction & Bâtiment", "44": "Construction & Bâtiment",
    "71": "Services professionnels", "72": "Informatique & Télécom",
    "79": "Services professionnels",
    "90": "Environnement & Propreté", "77": "Environnement & Propreté",
    "15": "Alimentation & Restauration", "55": "Alimentation & Restauration",
}


# =============================================================================
# Helpers
# =============================================================================

def load_communes() -> list[dict]:
    csv_path = SEEDS_DIR / "seed_communes_cibles.csv"
    communes = []
    with open(csv_path, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            row["population"] = int(row["population"])
            communes.append(row)
    print(f"  {len(communes)} communes: {', '.join(c['nom'] for c in communes)}")
    return communes


def load_m57():
    global M57_MAP
    csv_path = SEEDS_DIR / "seed_nomenclature_m57.csv"
    with open(csv_path, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            M57_MAP[row["nature_prefix"]] = row
    print(f"  M57 nomenclature: {len(M57_MAP)} prefixes loaded")


def save_json(data, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"    → {path.relative_to(ROOT)} ({path.stat().st_size / 1024:.1f} KB)")


def _float(v) -> float | None:
    if v is None:
        return None
    try:
        return round(float(v), 2)
    except (ValueError, TypeError):
        return None


def download_ods(api_base: str, dataset_id: str, where: str = "",
                 select: str = "", limit: int = 100, max_records: int = 200_000) -> list[dict]:
    """Download from OpenDataSoft Explore v2.1 API with pagination."""
    url = f"{api_base}/catalog/datasets/{dataset_id}/records"
    all_records = []
    offset = 0

    while offset < max_records:
        params = {"limit": limit, "offset": offset}
        if where:
            params["where"] = where
        if select:
            params["select"] = select

        resp = requests.get(url, params=params, timeout=60)
        resp.raise_for_status()
        data = resp.json()

        results = data.get("results", [])
        if not results:
            break

        all_records.extend(results)
        total = data.get("total_count", 0)

        if offset + limit >= total:
            break
        offset += limit
        time.sleep(0.3)

    return all_records


def classify_account(compte: str) -> dict | None:
    """Map a M57 account number to its nomenclature entry."""
    if not compte:
        return None
    # Try 2-digit prefix
    prefix = compte[:2]
    if prefix in M57_MAP:
        return M57_MAP[prefix]
    return None


# =============================================================================
# 1. DGFiP Balances → Budget Sankey + Evolution + Bilan
# =============================================================================

def fetch_dgfip(communes: list[dict], dry_run: bool = False):
    print(f"\n{'='*60}")
    print(f"  DGFIP BALANCES COMPTABLES")
    print(f"{'='*60}")

    sirens = [c["siren"].strip() for c in communes]
    slug_by_siren = {c["siren"].strip(): c["slug"] for c in communes}
    pop_by_slug = {c["slug"]: c["population"] for c in communes}

    siren_filter = " OR ".join(f"siren='{s}'" for s in sirens)

    all_rows = []
    for year in DGFIP_YEARS:
        dataset_id = f"balances-comptables-des-communes-en-{year}"
        print(f"  [{year}] {dataset_id}...", end=" ", flush=True)

        try:
            records = download_ods(
                api_base=DGFIP_API,
                dataset_id=dataset_id,
                where=siren_filter,
            )
            if not records:
                print("no data")
                continue
            for r in records:
                r["_year"] = year
                r["_slug"] = slug_by_siren.get(r.get("siren", ""), "")
            all_rows.extend(records)
            print(f"{len(records):,} rows")
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                print("not found")
            else:
                print(f"error: {e}")
        except Exception as e:
            print(f"error: {e}")

    if not all_rows:
        print("  No DGFiP data found!")
        return

    print(f"\n  Total: {len(all_rows):,} account rows across all years")

    if dry_run:
        print("  DRY RUN — skipping export")
        return

    # --- Process: classify each row via M57 ---
    classified = []
    for row in all_rows:
        compte = row.get("compte") or row.get("ccompte") or row.get("ncompte") or ""
        m57 = classify_account(str(compte).strip())
        if not m57:
            continue

        # DGFiP balance comptable fields:
        #   sd/sc = solde débiteur/créditeur (cumulative balance for class 1-5, annual for 6-7)
        #   obnetdeb/obnetcre = opérations budgétaires nettes (annual budget flows)
        #   oobdeb/oobcre = opérations d'ordre budgétaire (annual order operations)
        #   onbdeb/onbcre = opérations non budgétaires
        #
        # For class 6/7 (P&L): sd/sc = annual flow (accounts reset each year)
        # For class 1/2 (balance sheet): sd/sc = cumulative stock → use obnetdeb/obnetcre for annual flow
        sd = float(row.get("sd", 0) or row.get("soldedeb", 0) or 0)
        sc = float(row.get("sc", 0) or row.get("soldecre", 0) or 0)
        obnetdeb = float(row.get("obnetdeb", 0) or 0)
        obnetcre = float(row.get("obnetcre", 0) or 0)
        oobdeb = float(row.get("oobdeb", 0) or 0)
        oobcre = float(row.get("oobcre", 0) or 0)

        classe = str(compte).strip()[0]
        if classe in ("6",):  # expenses → annual debit flow (sd = annual amount)
            montant = sd
        elif classe in ("7",):  # revenues → annual credit flow (sc = annual amount)
            montant = sc
        elif classe in ("2",):  # investments (balance sheet) → annual budget flow only
            montant = obnetdeb + oobdeb  # annual investment spending
        elif classe in ("1",):  # debt/equity → annual budget flow
            montant = obnetcre + oobcre  # annual debt/grants received (credit side)
            if obnetdeb + oobdeb > 0:
                # Also has debit side (debt repayment)
                montant = (obnetcre + oobcre) - (obnetdeb + oobdeb)
        else:
            montant = sd - sc

        if abs(montant) < 1:
            continue

        classified.append({
            "slug": row["_slug"],
            "year": row["_year"],
            "compte": str(compte).strip(),
            "section": m57["section"],
            "sens_flux": m57["sens_flux"],
            "sankey_group": m57["sankey_group"],
            "montant": montant,
        })

    print(f"  Classified: {len(classified):,} rows with M57 mapping")

    # --- Generate Budget Sankey ---
    print("\n  GENERATING BUDGET SANKEY...")
    by_slug_year = defaultdict(lambda: defaultdict(list))
    for r in classified:
        by_slug_year[r["slug"]][r["year"]].append(r)

    for slug, years_data in by_slug_year.items():
        city_dir = OUTPUT_DIR / slug
        available_years = sorted(years_data.keys(), reverse=True)

        for year, rows in years_data.items():
            revenue_nodes = defaultdict(float)
            expense_nodes = defaultdict(float)

            for r in rows:
                group = r["sankey_group"]
                montant = abs(r["montant"])
                sens = r["sens_flux"]

                if sens == "Recette":
                    revenue_nodes[group] += montant
                elif sens == "Depense":
                    expense_nodes[group] += montant
                elif sens == "Both":
                    # Emprunts & Dette: positive = received, negative = repaid
                    if r["montant"] > 0:
                        revenue_nodes["Emprunts"] += r["montant"]
                    else:
                        expense_nodes["Dette"] += abs(r["montant"])

            central = CITY_LABELS.get(slug, f"Budget {slug.title()}")
            nodes = []
            links = []
            drilldown = {"revenue": {}, "expenses": {}}

            for name, val in sorted(revenue_nodes.items(), key=lambda x: -x[1]):
                if val > 0:
                    nodes.append({"name": name, "category": "revenue"})
                    links.append({"source": name, "target": central, "value": round(val, 2)})
                    drilldown["revenue"][name] = [{"name": name, "value": round(val, 2)}]

            nodes.append({"name": central, "category": "central"})

            for name, val in sorted(expense_nodes.items(), key=lambda x: -x[1]):
                if val > 0:
                    nodes.append({"name": name, "category": "expense"})
                    links.append({"source": central, "target": name, "value": round(val, 2)})
                    drilldown["expenses"][name] = [{"name": name, "value": round(val, 2)}]

            total_r = sum(revenue_nodes.values())
            total_d = sum(expense_nodes.values())

            sankey = {
                "year": year,
                "type_budget": "execute",
                "city_slug": slug,
                "city_name": slug.title() if slug != "paris" else "Paris",
                "dataStatus": "COMPLET",
                "totals": {
                    "recettes": round(total_r, 2),
                    "depenses": round(total_d, 2),
                    "solde": round(total_r - total_d, 2),
                },
                "nodes": nodes,
                "links": links,
                "drilldown": drilldown,
            }
            save_json(sankey, city_dir / f"budget_sankey_{year}.json")

        save_json({
            "availableYears": available_years,
            "latestYear": available_years[0] if available_years else None,
        }, city_dir / "budget_index.json")
        print(f"    {slug}: {len(available_years)} years")

    # --- Generate Evolution ---
    print("\n  GENERATING EVOLUTION...")
    for slug, years_data in by_slug_year.items():
        city_dir = OUTPUT_DIR / slug
        evolution = []

        for year in sorted(years_data.keys()):
            rows = years_data[year]
            rec_fonc = sum(r["montant"] for r in rows if r["section"] == "F" and r["sens_flux"] == "Recette")
            dep_fonc = sum(abs(r["montant"]) for r in rows if r["section"] == "F" and r["sens_flux"] == "Depense")
            rec_inv = sum(r["montant"] for r in rows if r["section"] == "I" and r["sens_flux"] == "Recette")
            dep_inv = sum(abs(r["montant"]) for r in rows if r["section"] == "I" and r["sens_flux"] == "Depense")

            # By category
            personnel = sum(abs(r["montant"]) for r in rows if r["sankey_group"] == "Personnel")
            fonc_courant = sum(abs(r["montant"]) for r in rows if r["sankey_group"] == "Fonctionnement courant")
            transferts = sum(abs(r["montant"]) for r in rows if r["sankey_group"] == "Transferts & subventions")
            charges_fin = sum(abs(r["montant"]) for r in rows if r["sankey_group"] == "Charges financières")
            invest = sum(abs(r["montant"]) for r in rows if r["sankey_group"] == "Investissements")

            total_r = rec_fonc + rec_inv
            total_d = dep_fonc + dep_inv

            evolution.append({
                "year": year,
                "recettes_totales": round(total_r, 2),
                "depenses_totales": round(total_d, 2),
                "solde": round(total_r - total_d, 2),
                "epargne_brute": round(rec_fonc - dep_fonc, 2),
                "section": {
                    "Fonctionnement": {
                        "recettes": round(rec_fonc, 2),
                        "depenses": round(dep_fonc, 2),
                    },
                    "Investissement": {
                        "recettes": round(rec_inv, 2),
                        "depenses": round(dep_inv, 2),
                    },
                },
                "par_categorie": {
                    "personnel": round(personnel, 2),
                    "fonctionnement_courant": round(fonc_courant, 2),
                    "transferts": round(transferts, 2),
                    "charges_financieres": round(charges_fin, 2),
                    "investissements": round(invest, 2),
                },
            })

        save_json(evolution, city_dir / "evolution.json")
        print(f"    {slug}: {len(evolution)} years")

    # --- Generate Bilan (from balance sheet accounts: class 1, 2, 3, 4, 5) ---
    print("\n  GENERATING BILAN...")
    for slug, years_data in by_slug_year.items():
        city_dir = OUTPUT_DIR / slug
        available_years = sorted(years_data.keys(), reverse=True)
        pop = pop_by_slug.get(slug, 1)

        for year, rows_all in years_data.items():
            # Use all DGFiP rows (not just classified) for balance sheet
            year_raw = [r for r in all_rows if r["_slug"] == slug and r["_year"] == year]

            immobilisations = 0
            dette_financiere = 0
            fonds_propres = 0
            tresorerie = 0

            for row in year_raw:
                compte = str(row.get("compte") or row.get("ccompte") or row.get("ncompte") or "").strip()
                if not compte:
                    continue
                sd = float(row.get("sd", 0) or row.get("soldedeb", 0) or 0)
                sc = float(row.get("sc", 0) or row.get("soldecre", 0) or 0)
                solde = sd - sc

                classe = compte[0]
                prefix2 = compte[:2]

                if classe == "2":  # immobilisations
                    immobilisations += abs(solde)
                elif prefix2 == "16":  # dette financière
                    dette_financiere += abs(sc - sd)  # credit side = debt
                elif prefix2 in ("10", "11", "12", "13"):  # fonds propres
                    fonds_propres += abs(sc - sd)
                elif classe == "5":  # trésorerie
                    tresorerie += solde

            actif_total = immobilisations + max(tresorerie, 0)
            passif_total = fonds_propres + dette_financiere

            bilan = {
                "year": year,
                "city_slug": slug,
                "totals": {
                    "actif_total": round(actif_total, 2),
                    "passif_total": round(passif_total, 2),
                    "dette_financiere": round(dette_financiere, 2),
                    "fonds_propres": round(fonds_propres, 2),
                    "tresorerie": round(tresorerie, 2),
                    "immobilisations": round(immobilisations, 2),
                },
                "kpis": {
                    "ratio_endettement": round(dette_financiere / passif_total * 100, 2) if passif_total else None,
                    "pct_fonds_propres": round(fonds_propres / passif_total * 100, 2) if passif_total else None,
                    "dette_par_hab": round(dette_financiere / pop, 2) if pop else None,
                },
            }
            save_json(bilan, city_dir / f"bilan_{year}.json")

        save_json({"availableYears": available_years}, city_dir / "bilan_index.json")
        print(f"    {slug}: {len(available_years)} years")

    return classified  # Return for benchmarking


# =============================================================================
# 2. Benchmarking from DGFiP + dotations-communes
# =============================================================================

def generate_benchmarking_from_dgfip(communes: list[dict], dgfip_classified: list[dict], dry_run: bool = False):
    """Generate benchmarking KPIs from DGFiP balance data."""
    print(f"\n{'='*60}")
    print(f"  BENCHMARKING (from DGFiP balances)")
    print(f"{'='*60}")

    if not dgfip_classified:
        print("  No DGFiP data available for benchmarking!")
        return

    if dry_run:
        print("  DRY RUN — skipping")
        return

    pop_by_slug = {c["slug"]: c["population"] for c in communes}
    name_by_slug = {c["slug"]: c["nom"] for c in communes}

    # Group by city/year
    by_slug_year = defaultdict(lambda: defaultdict(list))
    for r in dgfip_classified:
        by_slug_year[r["slug"]][r["year"]].append(r)

    cities = {}
    all_years = set()

    for slug, years_data in by_slug_year.items():
        pop = pop_by_slug.get(slug, 1)
        cities[slug] = {
            "slug": slug,
            "name": name_by_slug.get(slug, slug.title()),
            "population": pop,
            "years": {},
        }

        for year, rows in years_data.items():
            all_years.add(year)

            rec_fonc = sum(abs(r["montant"]) for r in rows if r["section"] == "F" and r["sens_flux"] == "Recette")
            dep_fonc = sum(abs(r["montant"]) for r in rows if r["section"] == "F" and r["sens_flux"] == "Depense")
            fiscalite = sum(abs(r["montant"]) for r in rows if r["sankey_group"] == "Fiscalité")
            dotations = sum(abs(r["montant"]) for r in rows if r["sankey_group"] == "Dotations État")
            personnel = sum(abs(r["montant"]) for r in rows if r["sankey_group"] == "Personnel")
            dep_invest = sum(abs(r["montant"]) for r in rows if r["sankey_group"] == "Investissements")
            charges_fin = sum(abs(r["montant"]) for r in rows if r["sankey_group"] == "Charges financières")

            # Debt: look for Emprunts & Dette
            dette_rows = [r for r in rows if r["sankey_group"] == "Emprunts & Dette"]
            encours_dette = sum(abs(r["montant"]) for r in dette_rows)

            epargne_brute = rec_fonc - dep_fonc

            kpis = {
                "recettes_fonctionnement": round(rec_fonc, 2),
                "depenses_fonctionnement": round(dep_fonc, 2),
                "produits_fiscaux": round(fiscalite, 2),
                "dgf": round(dotations, 2),
                "charges_personnel": round(personnel, 2),
                "depenses_investissement": round(dep_invest, 2),
                "encours_dette": round(encours_dette, 2),
                "epargne_brute": round(epargne_brute, 2),
                "epargne_nette": round(epargne_brute - charges_fin, 2),
                "recettes_par_hab": round(rec_fonc / pop, 2) if pop else None,
                "depenses_par_hab": round(dep_fonc / pop, 2) if pop else None,
                "dette_par_hab": round(encours_dette / pop, 2) if pop else None,
                "investissement_par_hab": round(dep_invest / pop, 2) if pop else None,
                "personnel_par_hab": round(personnel / pop, 2) if pop else None,
                "fiscalite_par_hab": round(fiscalite / pop, 2) if pop else None,
                "taux_epargne_brute": round(epargne_brute / rec_fonc * 100, 2) if rec_fonc else None,
                "pct_personnel": round(personnel / dep_fonc * 100, 2) if dep_fonc else None,
                "ratio_dette_recettes": round(encours_dette / rec_fonc * 100, 2) if rec_fonc else None,
            }
            cities[slug]["years"][str(year)] = kpis

    sorted_years = sorted(all_years, reverse=True)
    benchmarking = {
        "latest_year": sorted_years[0] if sorted_years else None,
        "available_years": sorted_years,
        "cities": list(cities.values()),
    }

    save_json(benchmarking, OUTPUT_DIR / "benchmarking.json")
    print(f"  {len(cities)} cities, {len(sorted_years)} years")


# =============================================================================
# 3. DECP → Marchés Publics
# =============================================================================

def fetch_decp(communes: list[dict], dry_run: bool = False):
    print(f"\n{'='*60}")
    print(f"  DECP MARCHÉS PUBLICS")
    print(f"{'='*60}")

    resource_id = "22847056-61df-452d-837d-8b8ceadbfc52"
    api_url = f"https://tabular-api.data.gouv.fr/api/resources/{resource_id}/data/"

    # DECP uses acheteur_nom__contains to find commune contracts
    # Some cities publish under multiple entities - use the main one
    DECP_SEARCH = {
        "paris": ["VILLE DE PARIS"],
        "marseille": ["COMMUNE DE MARSEILLE"],
        "lyon": ["COMMUNE DE LYON"],
        "toulouse": ["COMMUNE DE TOULOUSE", "TOULOUSE METROPOLE"],
        "nice": ["COMMUNE DE NICE"],
    }

    all_records = []
    for commune in communes:
        slug = commune["slug"]
        search_names = DECP_SEARCH.get(slug, [f"COMMUNE DE {commune['nom'].upper()}"])
        city_count = 0

        for search_name in search_names:
            print(f"  {commune['nom']} (\"{search_name}\")...", end=" ", flush=True)
            name_count = 0
            page = 1

            while True:
                try:
                    params = {
                        "page": page,
                        "page_size": 200,
                        "acheteur_nom__contains": search_name,
                    }
                    resp = requests.get(api_url, params=params, timeout=120)
                    resp.raise_for_status()
                    data = resp.json()

                    records = data.get("data", [])
                    if not records:
                        break

                    for r in records:
                        r["_slug"] = slug
                    all_records.extend(records)
                    name_count += len(records)

                    total = data.get("meta", {}).get("total", 0)
                    if page * 200 >= total:
                        break
                    page += 1
                    time.sleep(0.2)
                except Exception as e:
                    print(f"error page {page}: {e}")
                    break

            print(f"{name_count:,} contracts")
            city_count += name_count

        if city_count:
            print(f"    → {commune['nom']} total: {city_count:,}")

    if not all_records:
        print("  No DECP data found!")
        return

    if dry_run:
        print(f"  DRY RUN — {len(all_records)} contracts")
        return

    # Group by city/year and generate JSONs
    by_slug_year = defaultdict(lambda: defaultdict(list))
    for r in all_records:
        slug = r["_slug"]
        date = r.get("dateNotification") or r.get("datePublicationDonnees") or ""
        if not date:
            continue
        year = int(str(date)[:4])
        if year < 2017 or year > 2025:
            continue
        by_slug_year[slug][year].append(r)

    for slug, years_data in by_slug_year.items():
        city_dir = OUTPUT_DIR / slug
        available_years = sorted(years_data.keys(), reverse=True)

        for year, contracts in years_data.items():
            # Aggregate by CPV category
            cat_agg = defaultdict(lambda: {"nb": 0, "montant": 0.0})
            top_marches = []

            for c in contracts:
                cpv = str(c.get("codeCPV") or "")[:2]
                cat = CPV_CATEGORIES.get(cpv, "Autres")
                montant = float(c.get("montant") or 0)
                cat_agg[cat]["nb"] += 1
                cat_agg[cat]["montant"] += montant

                top_marches.append({
                    "objet": c.get("objet", ""),
                    "montant": _float(montant),
                    "categorie": cat,
                    "titulaire": c.get("titulaire_denominationSociale") or c.get("titulaires", ""),
                    "date": str(c.get("dateNotification", "")),
                    "procedure": c.get("procedure") or c.get("typeGroupementOperateurs", ""),
                })

            # Sort top_marches by amount
            top_marches.sort(key=lambda x: x["montant"] or 0, reverse=True)

            categories = []
            for cat_name, agg in sorted(cat_agg.items(), key=lambda x: -x[1]["montant"]):
                categories.append({
                    "categorie": cat_name,
                    "nb_marches": agg["nb"],
                    "montant_total": round(agg["montant"], 2),
                    "montant_moyen": round(agg["montant"] / agg["nb"], 2) if agg["nb"] else 0,
                })

            marches_data = {
                "annee": year,
                "city_slug": slug,
                "total_montant": sum(c["montant_total"] for c in categories),
                "total_marches": sum(c["nb_marches"] for c in categories),
                "categories": categories,
                "top_marches": top_marches[:100],
            }
            save_json(marches_data, city_dir / f"marches_{year}.json")

        save_json({"availableYears": available_years}, city_dir / "marches_index.json")
        print(f"    {slug}: {len(available_years)} years")


# =============================================================================
# 4. Subventions SCDL
# =============================================================================

def fetch_subventions(communes: list[dict], dry_run: bool = False):
    """Subventions SCDL — currently no consolidated national API available."""
    print(f"\n{'='*60}")
    print(f"  SUBVENTIONS")
    print(f"{'='*60}")
    print("  Skipped — no consolidated subventions API currently available.")
    print("  Each city publishes subventions on its own open data portal.")
    print("  TODO: Fetch from individual city portals (opendata.paris.fr, etc.)")
    return


# =============================================================================
# 5. Cities Index
# =============================================================================

def generate_cities_index(communes: list[dict]):
    """Generate cities.json from whatever data files exist."""
    print(f"\n{'='*60}")
    print(f"  CITIES INDEX")
    print(f"{'='*60}")

    cities = []
    all_years = set()

    for commune in communes:
        slug = commune["slug"]
        city_dir = OUTPUT_DIR / slug

        # Find available years from budget index
        budget_idx = city_dir / "budget_index.json"
        if budget_idx.exists():
            with open(budget_idx) as f:
                idx = json.load(f)
            years = idx.get("availableYears", [])
        else:
            years = []

        all_years.update(years)

        # Check which datasets exist
        datasets = []
        for ds in ["budget", "patrimoine", "marches", "subventions"]:
            idx_name = {
                "budget": "budget_index.json",
                "patrimoine": "bilan_index.json",
                "marches": "marches_index.json",
                "subventions": "subventions_index.json",
            }[ds]
            if (city_dir / idx_name).exists():
                datasets.append(ds)

        cities.append({
            "slug": slug,
            "name": commune["nom"],
            "population": commune["population"],
            "available_years": years,
            "datasets": datasets,
        })

    index = {
        "cities": cities,
        "latest_year": max(all_years) if all_years else None,
        "available_years": sorted(all_years, reverse=True),
    }

    save_json(index, OUTPUT_DIR / "cities.json")
    print(f"  {len(cities)} cities indexed, {len(all_years)} years")


# =============================================================================
# Main
# =============================================================================

SOURCES = ["dgfip", "benchmarking", "decp", "subventions"]


def main():
    parser = argparse.ArgumentParser(description="Fetch real open data for multi-city dashboard")
    parser.add_argument("--source", choices=SOURCES, help="Single source")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("  FETCH REAL DATA → JSON (no BigQuery)")
    print("=" * 60)

    communes = load_communes()
    load_m57()

    dgfip_classified = None

    if args.source:
        if args.source == "dgfip":
            dgfip_classified = fetch_dgfip(communes, dry_run=args.dry_run)
        elif args.source == "benchmarking":
            dgfip_classified = fetch_dgfip(communes, dry_run=args.dry_run)
            if dgfip_classified:
                generate_benchmarking_from_dgfip(communes, dgfip_classified, dry_run=args.dry_run)
        elif args.source == "decp":
            fetch_decp(communes, dry_run=args.dry_run)
        elif args.source == "subventions":
            fetch_subventions(communes, dry_run=args.dry_run)
    else:
        dgfip_classified = fetch_dgfip(communes, dry_run=args.dry_run)
        if dgfip_classified:
            generate_benchmarking_from_dgfip(communes, dgfip_classified, dry_run=args.dry_run)
        fetch_decp(communes, dry_run=args.dry_run)
        fetch_subventions(communes, dry_run=args.dry_run)

    # Always regenerate index
    if not args.dry_run:
        generate_cities_index(communes)

    print(f"\n  Done! Data in {OUTPUT_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
