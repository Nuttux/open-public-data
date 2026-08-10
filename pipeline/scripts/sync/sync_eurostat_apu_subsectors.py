#!/usr/bin/env python3
"""
Fetch Eurostat APU sub-sector breakdown (gov_10a_main) → JSON for /daily-bread.

Source: Eurostat — gov_10a_main (Main aggregates of general government)
Endpoint: https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10a_main

Filters:
    - unit=PC_GDP        (% of GDP)
    - sector=S13, S1311, S1312, S1313, S1314
    - na_item=TE         (total expenditure)
    - geo=FR
    - time=latest available

Sub-sectors:
    S13     General government (consolidated)
    S1311   Central government (État + ODAC)
    S1312   State government (NA in France, fédéral)
    S1313   Local government (APUL = communes/EPCI/départements/régions)
    S1314   Social security funds (ASSO)

Note: Sub-sector shares do NOT sum to 100% of S13 in Eurostat because
gov_10a_main does NOT consolidate intra-government transfers at the
sub-sector level. We compute:
    share_subsector = TE_subsector / (TE_S1311 + TE_S1313 + TE_S1314)
This is the right denominator for "share of public spending by who pays".

Output:
    website/public/data/national/eurostat_apu_subsectors.json
    + website/public/data/national/eurostat_apu_subsectors_index.json

Why no BigQuery/dbt here:
    Eurostat publishes already-harmonized aggregates with no need for
    transformation. Direct-to-JSON is the right tool, consistent with
    sync_eurostat_cofog.py and sync_eurostat_fiscalite.py.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

EUROSTAT_API = (
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10a_main"
)
# nama_10_gdp publie le PIB français à prix courants (B1GQ, CP_MEUR = millions €).
# On l'utilise pour convertir les `value_pct_gdp` en `annual_eur` par sous-secteur,
# de sorte que les drawers Sécu/Local/État puissent afficher un national absolu
# sans devoir hardcoder le PIB côté UI.
EUROSTAT_GDP_API = (
    "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nama_10_gdp"
)

SUBSECTORS = [
    ("S13", "APU consolidé (toutes administrations)", "General government (consolidated)"),
    ("S1311", "État central et ODAC", "Central government + ODAC"),
    ("S1313", "Administrations publiques locales (APUL)", "Local government (APUL)"),
    ("S1314", "Administrations de sécurité sociale (ASSO)", "Social security funds (ASSO)"),
]

OUTPUT_DIR = (
    Path(__file__).parent.parent.parent.parent / "pipeline" / "cache" / "wip" / "national"
)


def fetch_eurostat(sectors: list[str], year: int) -> dict:
    """Fetch one slice of gov_10a_main from Eurostat JSON-stat 2.0 API."""
    params = [
        ("format", "JSON"),
        ("unit", "PC_GDP"),
        ("na_item", "TE"),
        ("geo", "FR"),
        ("time", str(year)),
    ]
    for s in sectors:
        params.append(("sector", s))

    url = f"{EUROSTAT_API}?{urlencode(params)}"
    req = Request(url, headers={"User-Agent": "Qipu/1.0"})
    with urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_gdp_meur(year: int) -> float | None:
    """Fetch French GDP at current prices for the requested year (million €)."""
    params = [
        ("format", "JSON"),
        ("unit", "CP_MEUR"),
        ("na_item", "B1GQ"),
        ("geo", "FR"),
        ("time", str(year)),
    ]
    url = f"{EUROSTAT_GDP_API}?{urlencode(params)}"
    req = Request(url, headers={"User-Agent": "Qipu/1.0"})
    try:
        with urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        print(f"  ⚠ nama_10_gdp fetch failed: {exc}")
        return None
    values = data.get("value") or {}
    if not values:
        return None
    # Single-cell response : keys are positional indices, but with one geo/year/unit/na_item
    # there's exactly one value to read out.
    return next(iter(values.values()))


def parse_jsonstat(data: dict) -> dict[str, float]:
    """Parse JSON-stat 2.0 response into a flat {sector: value} dict (FR only)."""
    dim_order = data["id"]
    sizes = data["size"]
    dimension = data["dimension"]
    values = data["value"]

    inv_index = {}
    for dim_name in dim_order:
        cats = dimension[dim_name]["category"]["index"]
        if isinstance(cats, dict):
            inv_index[dim_name] = {pos: code for code, pos in cats.items()}
        else:
            inv_index[dim_name] = {pos: code for pos, code in enumerate(cats)}

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
        out[coords["sector"]] = val
    return out


def find_latest_year() -> int:
    """Latest year with data for FR S1311."""
    for year in range(datetime.now().year - 1, 2018, -1):
        try:
            raw = fetch_eurostat(["S1311"], year)
            if raw.get("value"):
                return year
        except Exception:
            continue
    raise RuntimeError("No recent year found")


def build_payload(year: int) -> dict:
    sector_codes = [s[0] for s in SUBSECTORS]
    print(f"  Fetching gov_10a_main for FR, {year}, {len(sector_codes)} sectors…")
    raw = fetch_eurostat(sector_codes, year)
    points = parse_jsonstat(raw)
    print(f"  Got {len(points)} data points: {points}")

    eurostat_updated = raw.get("updated", "")

    # Total = sum of S1311 + S1313 + S1314 (at non-consolidated TE level).
    # This is the denominator for "who spends what share" — different from S13
    # which removes intra-gov transfers.
    s1311 = points.get("S1311", 0)
    s1313 = points.get("S1313", 0)
    s1314 = points.get("S1314", 0)
    s13 = points.get("S13", 0)

    total_unconsolidated = s1311 + s1313 + s1314

    # PIB France année courante (Md€) → permet d'exposer `annual_eur` par
    # sous-secteur sans hardcode côté UI. Si l'API échoue, on continue à
    # publier le %PIB seul (les drawers feront sans le national absolu).
    print(f"  Fetching nama_10_gdp B1GQ CP_MEUR for FR, {year}…")
    gdp_meur = fetch_gdp_meur(year)
    gdp_md_eur = round(gdp_meur / 1000, 1) if gdp_meur else None
    if gdp_md_eur:
        print(f"  PIB FR {year}: {gdp_md_eur} Md€")
    else:
        print(f"  ⚠ PIB FR {year} not available — annual_eur fields will be null")

    sectors_out = []
    for code, label_fr, label_en in SUBSECTORS:
        v = points.get(code)
        share = None
        if code != "S13" and total_unconsolidated > 0 and v is not None:
            share = round(v / total_unconsolidated, 4)
        # `annual_eur` = value_pct_gdp / 100 × PIB (en €). Calculé pour S13
        # consolidé ET pour chaque sous-secteur (S1311/S1313/S1314), à partir
        # des % bruts Eurostat — donc pas besoin d'inférer le PIB côté UI.
        annual_eur = None
        if v is not None and gdp_meur:
            annual_eur = int(round(v / 100 * gdp_meur * 1e6))
        sectors_out.append({
            "code": code,
            "label_fr": label_fr,
            "label_en": label_en,
            "value_pct_gdp": round(v, 2) if v is not None else None,
            "share_of_unconsolidated": share,
            "annual_eur": annual_eur,
        })

    return {
        "perimeter": "APU France — décomposition par sous-secteur",
        "perimeter_label_fr": "APU décomposé par sous-secteur — Eurostat",
        "perimeter_label_en": "General government by sub-sector — Eurostat",
        "source": "Eurostat — gov_10a_main",
        "source_url": "https://ec.europa.eu/eurostat/databrowser/view/gov_10a_main/default/table",
        "source_dataset_id": "gov_10a_main",
        "unit": "% PIB",
        "unit_en": "% of GDP",
        "year": year,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "eurostat_updated": eurostat_updated,
        "sectors": sectors_out,
        "totals": {
            "s13_consolidated_pct_gdp": round(s13, 2) if s13 else None,
            "sum_subsectors_unconsolidated_pct_gdp": round(total_unconsolidated, 2),
            "intra_gov_transfers_pct_gdp": (
                round(total_unconsolidated - s13, 2) if s13 else None
            ),
            "gdp_total_md_eur": gdp_md_eur,
            "gdp_source": "Eurostat — nama_10_gdp (B1GQ, CP_MEUR)",
            "gdp_source_url": (
                "https://ec.europa.eu/eurostat/databrowser/view/nama_10_gdp/default/table"
            ),
        },
        "notes_fr": (
            "Décomposition de la dépense publique française par sous-secteur "
            "(S1311 État central + ODAC, S1313 collectivités locales APUL, "
            "S1314 administrations de sécurité sociale ASSO). Les totaux "
            "S1311+S1313+S1314 ne consolident pas les transferts intra-administrations "
            "(ex : dotations État → collectivités, transferts État → Sécu) ; ils "
            "sont donc supérieurs au total S13 consolidé. Pour répondre à la question "
            "« qui dépense quoi ? » dans le calculateur Daily Bread, on utilise les "
            "ratios S1311 / S1313 / S1314 sur leur somme non consolidée — c'est la "
            "lecture pertinente pour ventiler une contribution personnelle."
        ),
        "notes_en": (
            "French public spending broken down by sub-sector (S1311 central + ODAC, "
            "S1313 local government APUL, S1314 social security ASSO). Sub-sector "
            "totals do NOT consolidate intra-government transfers — they sum higher "
            "than the consolidated S13 total. For the Daily Bread calculator, we use "
            "the unconsolidated denominator: it answers « who spends what share » "
            "before transfers."
        ),
    }


def main() -> int:
    print("→ Eurostat APU sub-sectors sync (gov_10a_main)")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    year = find_latest_year()
    print(f"  Latest year for FR: {year}")

    payload = build_payload(year)

    out_file = OUTPUT_DIR / "eurostat_apu_subsectors.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"  ✓ Wrote {out_file.name}")

    index = {
        "available_years": [year],
        "latest_year": year,
        "source": payload["source"],
        "source_url": payload["source_url"],
        "fetched_at": payload["fetched_at"],
    }
    with open(OUTPUT_DIR / "eurostat_apu_subsectors_index.json", "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    # Sanity-check
    print(f"\n  Sanity check ({year}, FR):")
    for s in payload["sectors"]:
        share_str = (
            f"{s['share_of_unconsolidated'] * 100:.1f}%"
            if s["share_of_unconsolidated"] is not None
            else "—"
        )
        annual_str = (
            f"{s['annual_eur'] / 1e9:,.0f} Md€"
            if s.get("annual_eur") is not None
            else "—"
        )
        print(
            f"    {s['code']:6} {s['label_fr']:50} "
            f"{s['value_pct_gdp']}% PIB · share={share_str} · {annual_str}/an"
        )
    print(
        f"  Sum unconsolidated: {payload['totals']['sum_subsectors_unconsolidated_pct_gdp']}% PIB · "
        f"S13 consolidated: {payload['totals']['s13_consolidated_pct_gdp']}% PIB · "
        f"intra-gov transfers: {payload['totals']['intra_gov_transfers_pct_gdp']}% PIB "
        "(expected ~10-15)"
    )
    if payload["totals"].get("gdp_total_md_eur"):
        print(f"  PIB FR {year}: {payload['totals']['gdp_total_md_eur']} Md€")
    return 0


if __name__ == "__main__":
    sys.exit(main())
