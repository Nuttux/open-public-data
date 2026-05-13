#!/usr/bin/env python3
"""
Fetch OFGL consolidated communes data → JSON for /c/[slug] pages.

Source: data.ofgl.fr — ofgl-base-communes-consolidee
        Pre-harmonised aggregates (M14/M57 transparently merged), 2013→latest.

For each commune in `pipeline/seeds/seed_communes_cibles.csv`, we fetch
~20 aggregates × 10 years of history. Output:

    website/public/data/communes/{slug}.json   per-city detailed file
    website/public/data/communes/_index.json   list of all cities + latest_year

Used by `lib/commune-data.ts` consumed by `/c/[slug]/CityClient.tsx`.

⚠ M14/M57 cutoff is hidden by OFGL — they republish the harmonised series
under a single label. No "before/after" annotation needed in the chart.
"""

import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

OFGL_API = (
    "https://data.ofgl.fr/api/explore/v2.1/catalog/datasets/"
    "ofgl-base-communes-consolidee/records"
)

ROOT = Path(__file__).parent.parent.parent.parent
SEED_FILE = ROOT / "pipeline" / "seeds" / "seed_communes_cibles.csv"
OUTPUT_DIR = ROOT / "pipeline" / "cache" / "wip" / "communes"

# Aggregates retained for the city pages.
# Order matters for Sankey building (revenues vs expenses categorised below).
KPIS = {
    # Top-line totals
    "recettes_totales": "Recettes totales hors emprunts",
    "depenses_totales": "Dépenses totales hors remb",
    "encours_dette": "Encours de dette",
    "epargne_brute": "Epargne brute",
    "capacite_financement": "Capacité ou besoin de financement",
    # Section totals
    "depenses_fonctionnement": "Dépenses de fonctionnement",
    "recettes_fonctionnement": "Recettes de fonctionnement",
    "depenses_investissement": "Dépenses d'investissement",
    # Revenue components
    "impots_locaux": "Impôts locaux",
    "concours_etat": "Concours de l'Etat",
    "fiscalite_reversee": "Fiscalité reversée",
    "ventes_services": "Ventes de biens et services",
    "subventions_recues": "Subventions reçues et participations",
    # Expense components
    "frais_personnel": "Frais de personnel",
    "achats_charges": "Achats et charges externes",
    "depenses_intervention": "Dépenses d'intervention",
    "charges_financieres": "Charges financières",
    "depenses_equipement": "Dépenses d'équipement",
    "subventions_equipement": "Subventions d'équipement versées",
    "remboursements_emprunts": "Remboursements d'emprunts hors GAD",
}

START_YEAR = 2014
END_YEAR = datetime.now().year


def load_communes() -> list[dict]:
    out = []
    with open(SEED_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            out.append(row)
    return out


def fetch_paginated(where: str) -> list[dict]:
    out = []
    offset = 0
    limit = 100
    while True:
        params = {
            "limit": str(limit),
            "offset": str(offset),
            "select": "exer,agregat,montant,euros_par_habitant,ptot",
            "where": where,
        }
        url = f"{OFGL_API}?{urlencode(params)}"
        req = Request(url, headers={"User-Agent": "FranceOpenData/1.0"})
        with urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        results = data.get("results", [])
        out.extend(results)
        if len(results) < limit:
            break
        offset += limit
        if offset > 5000:
            break
    return out


def build_city(commune: dict) -> dict:
    insee = commune["code_insee"]
    print(f"  → {commune['nom']} ({insee})")

    where = (
        f'insee="{insee}" '
        f"AND year(exer) >= {START_YEAR} "
        f"AND year(exer) <= {END_YEAR}"
    )
    rows = fetch_paginated(where)
    print(f"    {len(rows)} rows")

    # Pivot: kpi_key → { year: {montant, eur_hab, pop} }
    series: dict[str, dict[int, dict]] = {k: {} for k in KPIS}
    population_by_year: dict[int, int] = {}

    label_to_key = {label: key for key, label in KPIS.items()}

    for r in rows:
        agg = r.get("agregat")
        key = label_to_key.get(agg)
        if not key:
            continue
        exer = r.get("exer")
        if not exer:
            continue
        # exer comes as ISO datetime '2024-01-01T00:00:00+00:00' — extract year
        year = int(str(exer)[:4])
        montant = r.get("montant")
        eur_hab = r.get("euros_par_habitant")
        ptot = r.get("ptot")
        if montant is None:
            continue
        series[key][year] = {
            "montant": int(round(montant)),
            "eur_hab": round(eur_hab, 1) if eur_hab is not None else None,
        }
        if ptot:
            population_by_year[year] = int(round(ptot))

    years_sorted = sorted({y for s in series.values() for y in s.keys()})
    latest_year = max(years_sorted) if years_sorted else None

    # Convert pivoted dict to ordered list of points
    series_out = {}
    for key in KPIS:
        pts = []
        for y in years_sorted:
            v = series[key].get(y)
            if v is not None:
                pts.append({"year": y, "montant": v["montant"], "eur_hab": v["eur_hab"]})
        series_out[key] = pts

    population_latest = population_by_year.get(latest_year) if latest_year else None

    return {
        "slug": commune["slug"],
        "nom": commune["nom"],
        "code_insee": commune["code_insee"],
        "siren": commune["siren"],
        "dep_name": commune["dep_name"],
        "reg_name": commune["reg_name"],
        "population_latest": population_latest,
        "latest_year": latest_year,
        "years": years_sorted,
        "series": series_out,
    }


def main() -> int:
    print("→ OFGL communes sync")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    communes = load_communes()
    print(f"  {len(communes)} communes to fetch")

    all_cities = {}
    for c in communes:
        try:
            city_data = build_city(c)
            all_cities[c["slug"]] = city_data
            out_file = OUTPUT_DIR / f"{c['slug']}.json"
            payload = {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "source": "OFGL — ofgl-base-communes-consolidee",
                "source_url": "https://data.ofgl.fr/explore/dataset/ofgl-base-communes-consolidee/",
                "perimeter_label_fr": "Comptes consolidés — OFGL (M14 + M57 harmonisés)",
                "perimeter_label_en": "Consolidated accounts — OFGL (M14 + M57 harmonised)",
                "city": city_data,
                "kpi_labels_fr": {
                    "recettes_totales": "Recettes totales hors emprunts",
                    "depenses_totales": "Dépenses totales hors remb.",
                    "encours_dette": "Encours de dette",
                    "epargne_brute": "Épargne brute",
                    "capacite_financement": "Capacité ou besoin de financement",
                    "depenses_fonctionnement": "Dépenses de fonctionnement",
                    "recettes_fonctionnement": "Recettes de fonctionnement",
                    "depenses_investissement": "Dépenses d'investissement",
                    "impots_locaux": "Impôts locaux",
                    "concours_etat": "Concours de l'État",
                    "fiscalite_reversee": "Fiscalité reversée",
                    "ventes_services": "Ventes de biens et services",
                    "subventions_recues": "Subventions reçues",
                    "frais_personnel": "Frais de personnel",
                    "achats_charges": "Achats et charges externes",
                    "depenses_intervention": "Dépenses d'intervention",
                    "charges_financieres": "Charges financières",
                    "depenses_equipement": "Dépenses d'équipement",
                    "subventions_equipement": "Subventions d'équipement versées",
                    "remboursements_emprunts": "Remboursements d'emprunts",
                },
                "kpi_labels_en": {
                    "recettes_totales": "Total revenue (excl. borrowing)",
                    "depenses_totales": "Total expenditure",
                    "encours_dette": "Debt outstanding",
                    "epargne_brute": "Gross savings",
                    "capacite_financement": "Financing capacity / needs",
                    "depenses_fonctionnement": "Operating expenditure",
                    "recettes_fonctionnement": "Operating revenue",
                    "depenses_investissement": "Capital expenditure",
                    "impots_locaux": "Local taxes",
                    "concours_etat": "State transfers",
                    "fiscalite_reversee": "Tax sharing",
                    "ventes_services": "Sales of goods & services",
                    "subventions_recues": "Subsidies received",
                    "frais_personnel": "Personnel costs",
                    "achats_charges": "External purchases",
                    "depenses_intervention": "Intervention spending",
                    "charges_financieres": "Financial charges",
                    "depenses_equipement": "Capital spending (equipment)",
                    "subventions_equipement": "Capital subsidies paid",
                    "remboursements_emprunts": "Loan repayments",
                },
            }
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            print(f"    ✓ Wrote {out_file.name}")
        except Exception as e:
            print(f"    ✗ FAILED: {e}")
            continue

    # Index
    index = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "OFGL — ofgl-base-communes-consolidee",
        "source_url": "https://data.ofgl.fr/explore/dataset/ofgl-base-communes-consolidee/",
        "cities": [
            {
                "slug": c["slug"],
                "nom": c["nom"],
                "code_insee": c["code_insee"],
                "latest_year": all_cities[c["slug"]]["latest_year"]
                if c["slug"] in all_cities
                else None,
            }
            for c in communes
        ],
    }
    with open(OUTPUT_DIR / "_index.json", "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"  ✓ Wrote _index.json")

    # Sanity-check on Marseille
    if "marseille" in all_cities:
        m = all_cities["marseille"]
        print(f"\n  Sanity check (Marseille, {m['latest_year']}):")
        ly = m["latest_year"]
        for key in ("depenses_totales", "encours_dette", "frais_personnel", "impots_locaux"):
            pts = m["series"].get(key, [])
            latest = next((p for p in pts if p["year"] == ly), None)
            if latest:
                label = KPIS[key]
                print(
                    f"    {label:42} "
                    f"{latest['montant'] / 1e6:>8,.0f} M€  "
                    f"({latest['eur_hab']:>7.1f} €/hab)"
                )
    return 0


if __name__ == "__main__":
    sys.exit(main())
