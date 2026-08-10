#!/usr/bin/env python3
"""
Fetch Eurostat COFOG (gov_10a_exp) → JSON for the /apu page.

Source: Eurostat — gov_10a_exp (General government expenditure by function)
Endpoint: https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10a_exp
Filters:
    - unit=PC_GDP        (% of GDP)
    - sector=S13         (general government, APU)
    - na_item=TE         (total expenditure)
    - cofog99=GF01..GF10 (10 main functions)
    - geo=FR,DE,IT,ES,NL,EU27_2020
    - time=latest available

Output: website/public/data/national/eurostat_cofog_{year}.json
        + website/public/data/national/eurostat_cofog_index.json

Why no BigQuery/dbt here:
    Eurostat publishes already-harmonized aggregates with no need for
    transformation, joining, or business logic. Direct-to-JSON is the
    right tool. If we later cross-join with French national data, we
    add raw → stg → mart at that point.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

# =============================================================================
# Configuration
# =============================================================================

EUROSTAT_API = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10a_exp"

# 10 main COFOG functions (level 1)
COFOG_FUNCTIONS = [
    ("GF01", "Services généraux", "General public services"),
    ("GF02", "Défense", "Defence"),
    ("GF03", "Ordre et sécurité", "Public order and safety"),
    ("GF04", "Affaires économiques", "Economic affairs"),
    ("GF05", "Protection environnement", "Environmental protection"),
    ("GF06", "Logement, équipements", "Housing and community amenities"),
    ("GF07", "Santé", "Health"),
    ("GF08", "Loisirs, culture", "Recreation, culture, religion"),
    ("GF09", "Enseignement", "Education"),
    ("GF10", "Protection sociale", "Social protection"),
]

# Total general government expenditure (sum of all COFOG)
COFOG_TOTAL = ("TOTAL", "Total dépenses publiques", "Total general government expenditure")

COUNTRIES = [
    ("FR", "France"),
    ("DE", "Allemagne"),
    ("IT", "Italie"),
    ("ES", "Espagne"),
    ("NL", "Pays-Bas"),
    ("EU27_2020", "Moyenne UE27"),
]

OUTPUT_DIR = Path(__file__).parent.parent.parent.parent / "pipeline" / "cache" / "wip" / "national"


# =============================================================================
# Eurostat fetch
# =============================================================================

def fetch_eurostat(cofog_codes: list[str], geos: list[str], year: int) -> dict:
    """Fetch one slice of gov_10a_exp from Eurostat JSON-stat 2.0 API."""
    params = [
        ("format", "JSON"),
        ("unit", "PC_GDP"),
        ("sector", "S13"),
        ("na_item", "TE"),
        ("time", str(year)),
    ]
    for c in cofog_codes:
        params.append(("cofog99", c))
    for g in geos:
        params.append(("geo", g))

    url = f"{EUROSTAT_API}?{urlencode(params)}"
    req = Request(url, headers={"User-Agent": "Qipu/1.0"})
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def parse_jsonstat(data: dict) -> dict[tuple[str, str], float]:
    """
    Parse JSON-stat 2.0 response into a flat {(cofog, geo): value} dict.

    JSON-stat encodes values as a flat array indexed by the cartesian product
    of dimension categories. We need to reverse that index to get coordinates.
    """
    dim_order = data["id"]                  # e.g. ['freq', 'unit', 'sector', 'cofog99', 'na_item', 'geo', 'time']
    sizes = data["size"]                    # e.g. [1, 1, 1, 10, 1, 6, 1]
    dimension = data["dimension"]
    values = data["value"]                  # e.g. {"0": 9.1, "1": 8.0, ...}

    # Build inverse index for each dimension: position in array → category code
    inv_index = {}
    for dim_name in dim_order:
        cats = dimension[dim_name]["category"]["index"]
        if isinstance(cats, dict):
            inv_index[dim_name] = {pos: code for code, pos in cats.items()}
        else:  # list form
            inv_index[dim_name] = {pos: code for pos, code in enumerate(cats)}

    # Pre-compute strides for unraveling the flat index
    strides = [1] * len(sizes)
    for i in range(len(sizes) - 2, -1, -1):
        strides[i] = strides[i + 1] * sizes[i + 1]

    out = {}
    for flat_idx_str, val in values.items():
        flat_idx = int(flat_idx_str)
        coords = {}
        rem = flat_idx
        for i, dim_name in enumerate(dim_order):
            pos = rem // strides[i]
            rem = rem % strides[i]
            coords[dim_name] = inv_index[dim_name][pos]
        key = (coords["cofog99"], coords["geo"])
        out[key] = val
    return out


# =============================================================================
# Build output JSON
# =============================================================================

def build_payload(year: int) -> dict:
    cofog_codes = [c[0] for c in COFOG_FUNCTIONS] + [COFOG_TOTAL[0]]
    geo_codes = [g[0] for g in COUNTRIES]

    print(f"  Fetching gov_10a_exp for {year}, {len(cofog_codes)} functions, {len(geo_codes)} geos…")
    raw = fetch_eurostat(cofog_codes, geo_codes, year)
    points = parse_jsonstat(raw)
    print(f"  Got {len(points)} data points")

    eurostat_updated = raw.get("updated", "")

    functions_out = []
    for code, label_fr, label_en in COFOG_FUNCTIONS + [COFOG_TOTAL]:
        values = {}
        for geo, _ in COUNTRIES:
            v = points.get((code, geo))
            if v is not None:
                values[geo] = round(v, 2)
        functions_out.append({
            "code": code,
            "label_fr": label_fr,
            "label_en": label_en,
            "values_pct_gdp": values,
        })

    return {
        "perimeter": "APU consolidé",
        "perimeter_label_fr": "Administrations publiques (APU) — Eurostat",
        "perimeter_label_en": "General government (APU) — Eurostat",
        "source": "Eurostat — gov_10a_exp",
        "source_url": "https://ec.europa.eu/eurostat/databrowser/view/gov_10a_exp/default/table",
        "source_dataset_id": "gov_10a_exp",
        "unit": "% PIB",
        "unit_en": "% of GDP",
        "year": year,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "eurostat_updated": eurostat_updated,
        "countries": [{"code": c, "label_fr": n, "label_en": n} for c, n in COUNTRIES],
        "functions": functions_out,
        "notes_fr": (
            "Dépenses publiques consolidées (toutes administrations : État, Sécu, "
            "collectivités, opérateurs), exprimées en % du PIB, classées selon la "
            "nomenclature COFOG (Classification of the Functions of Government). "
            "Source unique Eurostat pour la comparabilité européenne."
        ),
        "notes_en": (
            "Consolidated general government expenditure (central + state + local + "
            "social security funds), as % of GDP, classified by COFOG (Classification "
            "of the Functions of Government). Single Eurostat source for EU comparability."
        ),
    }


# =============================================================================
# Main
# =============================================================================

def find_latest_year() -> int:
    """Try recent years, return the most recent one with data for FR."""
    for year in range(datetime.now().year - 1, 2018, -1):
        try:
            raw = fetch_eurostat(["GF07"], ["FR"], year)
            if raw.get("value"):
                return year
        except Exception as e:
            print(f"  {year}: {e}")
            continue
    raise RuntimeError("No recent year with data found")


def main():
    print("→ Eurostat COFOG sync")
    print(f"  Output dir: {OUTPUT_DIR}")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    year = find_latest_year()
    print(f"  Latest available year for FR: {year}")

    payload = build_payload(year)

    out_file = OUTPUT_DIR / f"eurostat_cofog_{year}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"  ✓ Wrote {out_file}")

    # Index file
    index = {
        "available_years": [year],
        "latest_year": year,
        "source": payload["source"],
        "source_url": payload["source_url"],
        "fetched_at": payload["fetched_at"],
    }
    index_file = OUTPUT_DIR / "eurostat_cofog_index.json"
    with open(index_file, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"  ✓ Wrote {index_file}")

    # Sanity-check
    fr_total = next(
        (fn["values_pct_gdp"].get("FR") for fn in payload["functions"] if fn["code"] == "TOTAL"),
        None,
    )
    fr_health = next(
        (fn["values_pct_gdp"].get("FR") for fn in payload["functions"] if fn["code"] == "GF07"),
        None,
    )
    fr_social = next(
        (fn["values_pct_gdp"].get("FR") for fn in payload["functions"] if fn["code"] == "GF10"),
        None,
    )
    print("\n  Sanity check (France, % PIB):")
    print(f"    Total:            {fr_total}  (expected ~55-58)")
    print(f"    Santé (GF07):     {fr_health} (expected ~8-9)")
    print(f"    Protection sociale (GF10): {fr_social} (expected ~24-26)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
