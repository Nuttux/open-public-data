#!/usr/bin/env python3
"""
Fetch Eurostat tax revenue (gov_10a_taxag) → JSON for /fiscalite page.

Three slices fetched:
1. FR latest-year breakdown by category (6 buckets), in % GDP and MIO_EUR.
2. FR series 2010 → latest, by 4 top-level categories (D2, D5, D91, D61), % GDP.
3. Latest-year peer compare: total prélèvements obligatoires for FR vs DE/IT/ES/NL/EU27.

Sector S13 (general government / APU consolidé) — total taxes & social contribs
collected by all administrations, not just central state.

Categories (level 1, sum to total):
    D2      Taxes on production and imports     (incl. VAT, excise, payroll)
    D5      Current taxes on income/wealth      (incl. IR, IS, CSG)
    D61     Net social contributions
    D91     Capital taxes

Categories (level 2, public-discourse buckets):
    D211    VAT                                 (subset of D2)
    D2_minus_D211  = D2 − D211                  (other indirect taxes)
    D51A    Taxes on household income (≈ IR)    (subset of D5)
    D51B    Corporate income tax (IS)           (subset of D5)
    D5_minus_D51AB = D5 − D51A − D51B           (other direct taxes)
    D61     Cotisations sociales
    D91     Impôts capital

Output:
    website/public/data/national/eurostat_fiscalite.json
    website/public/data/national/eurostat_fiscalite_index.json
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

EUROSTAT_API = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10a_taxag"

# Total des prélèvements obligatoires (taxes + cotisations, après ajustements)
TOTAL_PO = "D2_D5_D91_D61_M_D612_M_D614_M_D995"

# Categories used to build the breakdown view (granular)
GRANULAR_CODES = [
    ("D211", "TVA", "VAT"),
    ("D2", "Total impôts production", "Total taxes on production"),
    ("D51A", "Impôt sur le revenu (ménages)", "Personal income tax"),
    ("D51B", "Impôt sur les sociétés", "Corporate income tax"),
    ("D5", "Total impôts directs (revenus, patrimoine)", "Total direct taxes (income, wealth)"),
    ("D61", "Cotisations sociales", "Social contributions"),
    ("D91", "Impôts sur le capital", "Capital taxes"),
]

# Top-level categories for evolution chart (sum to ~total)
TOP_LEVEL = [
    ("D61", "Cotisations sociales", "Social contributions"),
    ("D2", "Impôts sur la production", "Taxes on production"),
    ("D5", "Impôts sur le revenu / patrimoine", "Taxes on income / wealth"),
    ("D91", "Impôts sur le capital", "Capital taxes"),
]

PEERS = [
    ("FR", "France"),
    ("DE", "Allemagne"),
    ("IT", "Italie"),
    ("ES", "Espagne"),
    ("NL", "Pays-Bas"),
    ("EU27_2020", "Moyenne UE27"),
]

OUTPUT_DIR = (
    Path(__file__).parent.parent.parent.parent / "pipeline" / "cache" / "wip" / "national"
)


def fetch_eurostat(params: list[tuple[str, str]]) -> dict:
    url = f"{EUROSTAT_API}?{urlencode(params)}"
    req = Request(url, headers={"User-Agent": "FranceOpenData/1.0"})
    with urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def parse_jsonstat(data: dict) -> dict[tuple, float]:
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
        key = (
            coords.get("na_item"),
            coords.get("geo"),
            coords.get("time"),
            coords.get("unit"),
        )
        out[key] = val
    return out


# =============================================================================
# Builders
# =============================================================================

def find_latest_year() -> int:
    """Latest year with data for FR D211 (TVA — proxy for full coverage)."""
    for year in range(datetime.now().year - 1, 2018, -1):
        params = [
            ("format", "JSON"),
            ("geo", "FR"),
            ("sector", "S13"),
            ("unit", "PC_GDP"),
            ("na_item", "D211"),
            ("time", str(year)),
        ]
        try:
            raw = fetch_eurostat(params)
            if raw.get("value"):
                return year
        except Exception:
            continue
    raise RuntimeError("No recent year found")


def build_fr_breakdown(year: int) -> tuple[list[dict], dict]:
    """Granular breakdown for the latest year, in PC_GDP and MIO_EUR."""
    codes = [c[0] for c in GRANULAR_CODES] + [TOTAL_PO]
    params: list[tuple[str, str]] = [
        ("format", "JSON"),
        ("geo", "FR"),
        ("sector", "S13"),
        ("time", str(year)),
    ]
    for u in ("PC_GDP", "MIO_EUR"):
        params.append(("unit", u))
    for c in codes:
        params.append(("na_item", c))

    print(f"  Fetching FR breakdown for {year}…")
    raw = fetch_eurostat(params)
    points = parse_jsonstat(raw)

    out = []
    for code, label_fr, label_en in GRANULAR_CODES:
        out.append({
            "code": code,
            "label_fr": label_fr,
            "label_en": label_en,
            "pc_gdp": points.get((code, "FR", str(year), "PC_GDP")),
            "mio_eur": points.get((code, "FR", str(year), "MIO_EUR")),
        })

    total = {
        "code": TOTAL_PO,
        "label_fr": "Total prélèvements obligatoires",
        "label_en": "Total compulsory levies",
        "pc_gdp": points.get((TOTAL_PO, "FR", str(year), "PC_GDP")),
        "mio_eur": points.get((TOTAL_PO, "FR", str(year), "MIO_EUR")),
    }
    return out, total


def build_fr_evolution(latest_year: int) -> tuple[list[dict], list[int]]:
    """FR top-level evolution, % GDP, 2010 → latest_year."""
    codes = [c[0] for c in TOP_LEVEL]
    params: list[tuple[str, str]] = [
        ("format", "JSON"),
        ("geo", "FR"),
        ("sector", "S13"),
        ("unit", "PC_GDP"),
    ]
    for c in codes:
        params.append(("na_item", c))
    for y in range(2010, latest_year + 1):
        params.append(("time", str(y)))

    print(f"  Fetching FR evolution 2010→{latest_year}…")
    raw = fetch_eurostat(params)
    points = parse_jsonstat(raw)

    # Years actually present
    years = sorted({int(t) for (_, _, t, _) in points.keys() if t})

    series = []
    for code, label_fr, label_en in TOP_LEVEL:
        pts = []
        for y in years:
            v = points.get((code, "FR", str(y), "PC_GDP"))
            pts.append({"t": str(y), "v": v})
        series.append({
            "code": code,
            "label_fr": label_fr,
            "label_en": label_en,
            "pc_gdp": pts,
        })
    return series, years


def build_peer_compare(latest_year: int) -> tuple[list[dict], int]:
    """Peer compare on total compulsory levies (% GDP)."""
    for try_year in range(latest_year, latest_year - 4, -1):
        params: list[tuple[str, str]] = [
            ("format", "JSON"),
            ("sector", "S13"),
            ("unit", "PC_GDP"),
            ("na_item", TOTAL_PO),
            ("time", str(try_year)),
        ]
        for g, _ in PEERS:
            params.append(("geo", g))
        raw = fetch_eurostat(params)
        points = parse_jsonstat(raw)
        peer_values = {}
        for g, _ in PEERS:
            v = points.get((TOTAL_PO, g, str(try_year), "PC_GDP"))
            if v is not None:
                peer_values[g] = v
        if len(peer_values) == len(PEERS):
            print(f"  Peer compare uses year {try_year} (full coverage)")
            return [
                {"geo": g, "label_fr": label, "label_en": label, "value_pct_gdp": peer_values[g]}
                for g, label in PEERS
            ], try_year

    print(f"  ⚠ peer compare incomplete at {latest_year}, returning partial")
    return [], latest_year


# =============================================================================
# Main
# =============================================================================

def main() -> int:
    print("→ Eurostat fiscalité sync")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    latest_year = find_latest_year()
    print(f"  Latest year for FR: {latest_year}")

    breakdown, total = build_fr_breakdown(latest_year)
    evolution, years = build_fr_evolution(latest_year)
    peers, peer_year = build_peer_compare(latest_year)

    payload = {
        "perimeter": "APU consolidé",
        "perimeter_label_fr": "Administrations publiques (APU) — Eurostat",
        "perimeter_label_en": "General government (APU) — Eurostat",
        "source": "Eurostat — gov_10a_taxag",
        "source_url": "https://ec.europa.eu/eurostat/databrowser/view/gov_10a_taxag/default/table",
        "source_dataset_id": "gov_10a_taxag",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "latest_year": latest_year,
        "fr_total_po": total,
        "fr_breakdown": breakdown,
        "fr_evolution": evolution,
        "evolution_years": [str(y) for y in years],
        "peer_compare": {
            "year": peer_year,
            "values": peers,
        },
        "notes_fr": (
            "Total des prélèvements obligatoires : taxes (D2 production + D5 revenus + D91 capital) "
            "et cotisations sociales nettes (D61). Ratio rapporté au PIB nominal (pas au revenu disponible). "
            "Périmètre APU consolidé — État + Sécurité sociale + collectivités + opérateurs."
        ),
        "notes_en": (
            "Total compulsory levies: taxes (D2 production + D5 income + D91 capital) "
            "and net social contributions (D61). Ratio relative to nominal GDP (not disposable income). "
            "Consolidated general government scope — central + social security + local + operators."
        ),
    }

    out_file = OUTPUT_DIR / "eurostat_fiscalite.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"  ✓ Wrote {out_file}")

    with open(OUTPUT_DIR / "eurostat_fiscalite_index.json", "w", encoding="utf-8") as f:
        json.dump({
            "latest_year": latest_year,
            "source": payload["source"],
            "source_url": payload["source_url"],
            "fetched_at": payload["fetched_at"],
        }, f, ensure_ascii=False, indent=2)

    # Sanity-check
    print(f"\n  Sanity check ({latest_year}, FR, % PIB):")
    print(f"    Total prélèvements obligatoires: {total['pc_gdp']}  (expected ~43-46)")
    for row in breakdown:
        if row["code"] in ("D211", "D51A", "D51B", "D61"):
            print(f"    {row['label_fr']:45} {row['pc_gdp']}  ", end="")
            print({
                "D211": "(expected ~7-8 — TVA)",
                "D51A": "(expected ~9-10 — IR/CSG)",
                "D51B": "(expected ~2.5-3.5 — IS)",
                "D61":  "(expected ~16-18 — cotisations)",
            }[row["code"]])
    return 0


if __name__ == "__main__":
    sys.exit(main())
