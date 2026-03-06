#!/usr/bin/env python3
"""
Bootstrap: Fetch marchés publics directly from OpenData Paris API → JSON.

Generates the same JSON structure as export_marches_data.py but without
requiring BigQuery/dbt. Useful for immediate frontend development.

Usage:
    python scripts/export/bootstrap_marches_data.py
"""

import json
import time
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List
from urllib.request import urlopen, Request
from urllib.parse import urlencode

OUTPUT_DIR = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data" / "marches-publics"

API_BASE = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/liste-des-marches-de-la-collectivite-parisienne/records"

TOP_CATEGORIES = 12


def api_fetch(params: dict, retries: int = 3) -> dict:
    """Fetch from OpenData Paris API with retry."""
    url = f"{API_BASE}?{urlencode(params)}"
    req = Request(url, headers={"User-Agent": "DonneesLumieres/1.0"})
    for attempt in range(retries):
        try:
            with urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            if attempt < retries - 1:
                print(f"    Retry {attempt+1}/{retries} for: {url[:100]}... ({e})")
                time.sleep(1 + attempt)
            else:
                raise


def fetch_all_records(year: Optional[int] = None) -> list:
    """Fetch all records, paginating through the API (100 per page)."""
    records = []
    offset = 0
    limit = 100
    where = f"year(annee_de_notification)={year}" if year else None

    while True:
        params = {"limit": str(limit), "offset": str(offset)}
        if where:
            params["where"] = where

        data = api_fetch(params)
        results = data.get("results", [])
        if not results:
            break

        records.extend(results)
        if len(records) % 500 == 0:
            print(f"    ... {len(records)} records so far")
        offset += limit

        if len(results) < limit:
            break

        time.sleep(0.3)  # Rate limiting

    return records


def parse_record(r: dict) -> dict:
    """Parse a raw API record into our standard format."""
    montant_min = r.get("montant_min") or 0
    montant_max = r.get("montant_max") or 0
    duree = r.get("duree_du_marche_en_jours")
    fournisseur = r.get("fournisseur_nom", "")

    return {
        "numero_marche": r.get("num_marche", ""),
        "objet": r.get("objet_du_marche", ""),
        "nature": r.get("nature_du_marche", ""),
        "fournisseur_nom": fournisseur,
        "fournisseur_siret": r.get("fournisseur_siret", ""),
        "montant_min": float(montant_min),
        "montant_max": float(montant_max),
        "date_notification": r.get("date_de_notification"),
        "duree_jours": int(duree) if duree else None,
        "categorie_libelle": r.get("categorie_d_achat_texte", ""),
        "perimetre_financier": r.get("perimetre_financier", ""),
        "is_multiattributaire": fournisseur == "MARCHE MULTIATTRIBUTAIRE",
    }


def get_years(records: list[dict]) -> list[int]:
    """Extract sorted unique years."""
    years = set()
    for r in records:
        y = r.get("annee_de_notification")
        if y:
            years.add(int(y))
    return sorted(years, reverse=True)


def build_tendances(all_marches: Dict[int, List]) -> dict:
    """Build tendances data from all years."""
    years_data = []

    for year in sorted(all_marches.keys()):
        data = all_marches[year]
        enveloppe_totale = sum(m["montant_max"] for m in data)

        # Par nature
        by_nature = {}
        for m in data:
            key = m["nature"] or "Non renseigné"
            if key not in by_nature:
                by_nature[key] = {"label": key, "montant": 0, "count": 0}
            by_nature[key]["montant"] += m["montant_max"]
            by_nature[key]["count"] += 1

        # Par catégorie (top N + Autres)
        by_cat_raw = {}
        for m in data:
            key = m["categorie_libelle"] or "Non renseigné"
            if key not in by_cat_raw:
                by_cat_raw[key] = {"label": key, "montant": 0, "count": 0}
            by_cat_raw[key]["montant"] += m["montant_max"]
            by_cat_raw[key]["count"] += 1

        sorted_cats = sorted(by_cat_raw.values(), key=lambda x: -x["montant"])
        by_categorie = sorted_cats[:TOP_CATEGORIES]
        if len(sorted_cats) > TOP_CATEGORIES:
            autres = {"label": "Autres", "montant": 0, "count": 0}
            for c in sorted_cats[TOP_CATEGORIES:]:
                autres["montant"] += c["montant"]
                autres["count"] += c["count"]
            by_categorie.append(autres)

        # Par périmètre
        by_perimetre = {}
        for m in data:
            key = m["perimetre_financier"] or "Non renseigné"
            if key not in by_perimetre:
                by_perimetre[key] = {"label": key, "montant": 0, "count": 0}
            by_perimetre[key]["montant"] += m["montant_max"]
            by_perimetre[key]["count"] += 1

        years_data.append({
            "year": year,
            "enveloppe_totale": enveloppe_totale,
            "nb_marches": len(data),
            "par_nature": sorted(by_nature.values(), key=lambda x: -x["montant"]),
            "par_categorie": by_categorie,
            "par_perimetre": sorted(by_perimetre.values(), key=lambda x: -x["montant"]),
        })

    return {
        "generated_at": datetime.now().isoformat(),
        "source": "OpenData Paris API (bootstrap direct)",
        "note": "Les montants sont des enveloppes pluriannuelles (plafonds contractuels).",
        "years": years_data,
    }


def main():
    print("=" * 60)
    print("  Bootstrap Marchés Publics — API OpenData Paris → JSON")
    print("=" * 60)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Discover years first
    print("\n  Discovering available years...")
    years_data = api_fetch({"select": "annee_de_notification", "group_by": "annee_de_notification", "limit": "20"})
    years = sorted(set(int(str(r["annee_de_notification"])[:4]) for r in years_data.get("results", []) if r.get("annee_de_notification")), reverse=True)
    print(f"  → {len(years)} years: {years[0]}–{years[-1]}")

    # Fetch year by year (avoids 10k offset API limit)
    all_marches: Dict[int, List] = {}
    total_count = 0
    for year in years:
        print(f"  Fetching {year}...", end=" ")
        raw_records = fetch_all_records(year)
        parsed = [parse_record(r) for r in raw_records]
        parsed = [m for m in parsed if m["montant_max"] > 0]
        parsed = [m for m in parsed if m["duree_jours"] is None or m["duree_jours"] > 0]
        all_marches[year] = sorted(parsed, key=lambda m: -m["montant_max"])
        total_count += len(parsed)
        print(f"{len(parsed)} marchés")

    print(f"  → Total: {total_count} records across {len(years)} years")

    # Collect all parsed records for filter computation
    parsed = []
    for data in all_marches.values():
        parsed.extend(data)

    # Collect all natures, categories, perimetres for filters
    all_natures = sorted(set(m["nature"] for m in parsed if m["nature"]))
    cat_counts: dict[str, int] = {}
    for m in parsed:
        c = m["categorie_libelle"]
        if c:
            cat_counts[c] = cat_counts.get(c, 0) + 1
    all_categories = [c for c, _ in sorted(cat_counts.items(), key=lambda x: -x[1])[:30]]
    all_perimetres = sorted(set(m["perimetre_financier"] for m in parsed if m["perimetre_financier"]))

    # Export index
    print("\n  Generating index.json...")
    totals_by_year = {}
    for year, data in all_marches.items():
        totals_by_year[year] = {
            "nb_marches": len(data),
            "enveloppe_max_totale": sum(m["montant_max"] for m in data),
        }

    index = {
        "generated_at": datetime.now().isoformat(),
        "source": "OpenData Paris API (bootstrap direct)",
        "note": "Les montants sont des enveloppes pluriannuelles (plafonds contractuels), pas des dépenses annuelles.",
        "availableYears": years,
        "totalsByYear": totals_by_year,
        "filters": {
            "natures": all_natures,
            "categories": all_categories,
            "perimetres": all_perimetres,
        },
    }

    with open(OUTPUT_DIR / "index.json", "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"  → index.json ({len(years)} years)")

    # Export per-year files
    print(f"\n  Exporting {len(years)} year files...")
    for year in years:
        data = all_marches[year]
        output = {
            "year": year,
            "generated_at": datetime.now().isoformat(),
            "enveloppe_max_totale": sum(m["montant_max"] for m in data),
            "nb_marches": len(data),
            "note": "montant_max = enveloppe pluriannuelle (plafond contractuel), pas une dépense annuelle.",
            "data": data,
        }
        fname = f"marches_{year}.json"
        with open(OUTPUT_DIR / fname, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        print(f"    → {fname} ({len(data)} marchés)")

    # Export tendances
    print("\n  Generating tendances...")
    tendances = build_tendances(all_marches)
    with open(OUTPUT_DIR / "marches_tendances.json", "w", encoding="utf-8") as f:
        json.dump(tendances, f, ensure_ascii=False, indent=2)
    print(f"  → marches_tendances.json ({len(tendances['years'])} years)")

    print("\n" + "=" * 60)
    print(f"  Done! Files written to: {OUTPUT_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
