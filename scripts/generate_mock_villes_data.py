#!/usr/bin/env python3
"""Generate realistic mock data for multi-city frontend development."""

import json
import random
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / "website" / "public" / "data" / "villes"

CITIES = [
    {"slug": "paris", "name": "Paris", "population": 2133111, "scale": 1.0},
    {"slug": "marseille", "name": "Marseille", "population": 873076, "scale": 0.35},
    {"slug": "lyon", "name": "Lyon", "population": 522250, "scale": 0.28},
    {"slug": "toulouse", "name": "Toulouse", "population": 504078, "scale": 0.22},
    {"slug": "nice", "name": "Nice", "population": 342669, "scale": 0.18},
]

YEARS = [2023, 2022, 2021, 2020, 2019]

REVENUE_GROUPS = ["Fiscalité", "Dotations État", "Produits des services", "Autres produits", "Emprunts"]
EXPENSE_GROUPS = ["Personnel", "Fonctionnement courant", "Transferts & subventions", "Charges financières", "Investissements"]

CPV_CATEGORIES = ["Construction & Bâtiment", "Informatique & Télécom", "Transport & Véhicules",
                   "Environnement & Propreté", "Énergie", "Services professionnels",
                   "Santé & Social", "Alimentation & Restauration", "Autres"]


def jitter(base: float, pct: float = 0.1) -> float:
    return round(base * (1 + random.uniform(-pct, pct)), 2)


def generate_sankey(city: dict, year: int) -> dict:
    base_budget = 11_000_000_000 * city["scale"]
    growth = 1 + (year - 2019) * 0.02

    rev_weights = [0.45, 0.20, 0.15, 0.10, 0.10]
    exp_weights = [0.40, 0.20, 0.15, 0.05, 0.20]

    total_rev = jitter(base_budget * growth)
    total_exp = jitter(base_budget * growth * 1.02)

    nodes = []
    links = []
    drilldown = {"revenue": {}, "expenses": {}}
    central = f"Budget {city['name']}"

    for i, group in enumerate(REVENUE_GROUPS):
        val = round(total_rev * rev_weights[i] * (1 + random.uniform(-0.05, 0.05)))
        nodes.append({"name": group, "category": "revenue"})
        links.append({"source": group, "target": central, "value": val})
        drilldown["revenue"][group] = [{"name": group, "value": val}]

    nodes.append({"name": central, "category": "central"})

    for i, group in enumerate(EXPENSE_GROUPS):
        val = round(total_exp * exp_weights[i] * (1 + random.uniform(-0.05, 0.05)))
        nodes.append({"name": group, "category": "expense"})
        links.append({"source": central, "target": group, "value": val})
        drilldown["expenses"][group] = [{"name": group, "value": val}]

    actual_rev = sum(l["value"] for l in links if l["target"] == central)
    actual_exp = sum(l["value"] for l in links if l["source"] == central)

    return {
        "year": year,
        "type_budget": "execute",
        "city_slug": city["slug"],
        "city_name": city["name"],
        "dataStatus": "COMPLET",
        "totals": {
            "recettes": actual_rev,
            "depenses": actual_exp,
            "solde": actual_rev - actual_exp,
        },
        "nodes": nodes,
        "links": links,
        "drilldown": drilldown,
    }


def generate_benchmarking() -> dict:
    cities = []
    for city in CITIES:
        years_data = {}
        for year in YEARS:
            base = 11_000_000_000 * city["scale"]
            growth = 1 + (year - 2019) * 0.02
            pop = city["population"]

            rev = jitter(base * growth)
            exp = jitter(base * growth * 0.98)
            inv = jitter(base * growth * 0.18)
            dette = jitter(base * growth * 0.7)
            epargne = rev - exp
            personnel = jitter(exp * 0.42)
            fiscal = jitter(rev * 0.55)

            years_data[str(year)] = {
                "recettes_fonctionnement": round(rev),
                "depenses_fonctionnement": round(exp),
                "produits_fiscaux": round(fiscal),
                "dgf": round(rev * 0.12),
                "charges_personnel": round(personnel),
                "depenses_investissement": round(inv),
                "encours_dette": round(dette),
                "epargne_brute": round(epargne),
                "epargne_nette": round(epargne * 0.6),
                "recettes_par_hab": round(rev / pop, 2),
                "depenses_par_hab": round(exp / pop, 2),
                "dette_par_hab": round(dette / pop, 2),
                "investissement_par_hab": round(inv / pop, 2),
                "personnel_par_hab": round(personnel / pop, 2),
                "fiscalite_par_hab": round(fiscal / pop, 2),
                "taux_epargne_brute": round(epargne / rev * 100, 2) if rev > 0 else None,
                "pct_personnel": round(personnel / exp * 100, 2) if exp > 0 else None,
                "ratio_dette_recettes": round(dette / rev * 100, 2) if rev > 0 else None,
            }

        cities.append({
            "slug": city["slug"],
            "name": city["name"],
            "population": city["population"],
            "years": years_data,
        })

    return {
        "latest_year": YEARS[0],
        "available_years": YEARS,
        "cities": cities,
    }


def generate_evolution(city: dict) -> list:
    evolution = []
    for year in YEARS:
        base = 11_000_000_000 * city["scale"]
        growth = 1 + (year - 2019) * 0.02
        rev = jitter(base * growth)
        exp = jitter(base * growth * 0.98)
        evolution.append({
            "year": year,
            "recettes_totales": round(rev),
            "depenses_totales": round(exp),
            "solde": round(rev - exp),
            "epargne_brute": round((rev - exp) * 0.8),
            "section": {
                "Fonctionnement": {"recettes": round(rev * 0.8), "depenses": round(exp * 0.78)},
                "Investissement": {"recettes": round(rev * 0.2), "depenses": round(exp * 0.22)},
            },
            "par_categorie": {
                "personnel": round(exp * 0.42),
                "fonctionnement_courant": round(exp * 0.20),
                "transferts": round(exp * 0.15),
                "charges_financieres": round(exp * 0.05),
                "investissements": round(exp * 0.18),
            },
        })
    return evolution


def generate_marches(city: dict, year: int) -> dict:
    base = 500_000_000 * city["scale"]
    categories = []
    for cat in CPV_CATEGORIES:
        n = random.randint(5, 80)
        montant = jitter(base / len(CPV_CATEGORIES))
        categories.append({
            "categorie": cat,
            "nb_marches": n,
            "montant_total": round(montant),
            "montant_moyen": round(montant / n),
        })

    top_marches = []
    for i in range(20):
        top_marches.append({
            "objet": f"Marché {city['name']} #{i+1} - {random.choice(CPV_CATEGORIES)}",
            "montant": round(random.uniform(100000, 5000000) * city["scale"]),
            "categorie": random.choice(CPV_CATEGORIES),
            "titulaire": f"Entreprise {chr(65 + i % 26)}{random.randint(1,9)}",
            "date": f"{year}-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
            "procedure": random.choice(["Appel d'offres ouvert", "Procédure adaptée", "Marché négocié"]),
        })

    return {
        "annee": year,
        "city_slug": city["slug"],
        "total_montant": sum(c["montant_total"] for c in categories),
        "total_marches": sum(c["nb_marches"] for c in categories),
        "categories": categories,
        "top_marches": sorted(top_marches, key=lambda x: -x["montant"]),
    }


def generate_subventions(city: dict, year: int) -> dict:
    n = random.randint(20, 80)
    beneficiaires = []
    for i in range(n):
        beneficiaires.append({
            "beneficiaire": f"Association {city['name']} {i+1}",
            "objet": f"Subvention {year} - activité {random.choice(['sociale', 'culturelle', 'sportive', 'éducative'])}",
            "montant": round(random.uniform(23000, 500000) * city["scale"]),
            "nature": random.choice(["Aide en numéraire", "Aide en nature"]),
            "date": f"{year}-{random.randint(1,12):02d}-{random.randint(1,28):02d}",
        })
    beneficiaires.sort(key=lambda x: -x["montant"])

    return {
        "annee": year,
        "city_slug": city["slug"],
        "total_montant": sum(b["montant"] for b in beneficiaires),
        "nb_subventions": len(beneficiaires),
        "nb_beneficiaires": len(set(b["beneficiaire"] for b in beneficiaires)),
        "beneficiaires": beneficiaires,
    }


def generate_bilan(city: dict, year: int) -> dict:
    base = 15_000_000_000 * city["scale"]
    return {
        "year": year,
        "city_slug": city["slug"],
        "totals": {
            "actif_total": round(jitter(base)),
            "passif_total": round(jitter(base * 0.95)),
            "dette_financiere": round(jitter(base * 0.35)),
            "fonds_propres": round(jitter(base * 0.55)),
            "tresorerie": round(jitter(base * 0.05)),
            "immobilisations": round(jitter(base * 0.80)),
        },
        "kpis": {
            "ratio_endettement": round(jitter(60, 0.2), 1),
            "pct_fonds_propres": round(jitter(55, 0.15), 1),
            "dette_par_hab": round(jitter(base * 0.35 / city["population"]), 2),
        },
    }


def main():
    random.seed(42)  # Reproducible

    # Cities index
    cities_index = {
        "cities": [
            {
                "slug": c["slug"],
                "name": c["name"],
                "population": c["population"],
                "available_years": YEARS,
                "datasets": ["budget", "patrimoine", "marches", "subventions"],
            }
            for c in CITIES
        ],
        "latest_year": YEARS[0],
        "available_years": YEARS,
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_DIR / "cities.json", "w") as f:
        json.dump(cities_index, f, ensure_ascii=False, indent=2)
    print(f"cities.json")

    # Benchmarking
    benchmarking = generate_benchmarking()
    with open(OUTPUT_DIR / "benchmarking.json", "w") as f:
        json.dump(benchmarking, f, ensure_ascii=False, indent=2)
    print(f"benchmarking.json")

    # Per-city data
    for city in CITIES:
        city_dir = OUTPUT_DIR / city["slug"]
        city_dir.mkdir(parents=True, exist_ok=True)

        # Budget Sankey
        for year in YEARS:
            data = generate_sankey(city, year)
            with open(city_dir / f"budget_sankey_{year}.json", "w") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

        with open(city_dir / "budget_index.json", "w") as f:
            json.dump({"availableYears": YEARS, "latestYear": YEARS[0]}, f)

        # Evolution
        evo = generate_evolution(city)
        with open(city_dir / "evolution.json", "w") as f:
            json.dump(evo, f, ensure_ascii=False, indent=2)

        # Bilan
        for year in YEARS:
            data = generate_bilan(city, year)
            with open(city_dir / f"bilan_{year}.json", "w") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        with open(city_dir / "bilan_index.json", "w") as f:
            json.dump({"availableYears": YEARS}, f)

        # Marchés
        for year in YEARS:
            data = generate_marches(city, year)
            with open(city_dir / f"marches_{year}.json", "w") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        with open(city_dir / "marches_index.json", "w") as f:
            json.dump({"availableYears": YEARS}, f)

        # Subventions
        for year in YEARS:
            data = generate_subventions(city, year)
            with open(city_dir / f"subventions_{year}.json", "w") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        with open(city_dir / "subventions_index.json", "w") as f:
            json.dump({"availableYears": YEARS}, f)

        print(f"{city['name']}: all data generated")

    print(f"\nAll mock data written to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
