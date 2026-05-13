#!/usr/bin/env python3
"""
Fetch Eurostat quarterly government debt (gov_10q_ggdebt) → JSON for /dette page.

Two slices fetched:
1. FR by sub-sector (S13 / S1311 / S1313 / S1314), full series 2000-Q1 → latest,
   in PC_GDP and MIO_EUR units.
2. Latest quarter S13 comparison: FR vs DE, IT, ES, NL, EU27_2020 in PC_GDP.

Sectors:
    S13   = General government (consolidated)        APU
    S1311 = Central government                       APUC
    S1313 = Local government                         APUL
    S1314 = Social security funds                    ASSO

⚠️  S13 ≠ S1311 + S1313 + S1314 because of intra-government consolidation
    effects. Do NOT stack the series in the chart.

na_item = GD = Government consolidated gross debt (Maastricht definition).

Output:
    website/public/data/national/eurostat_dette.json
    website/public/data/national/eurostat_dette_index.json
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

EUROSTAT_API = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10q_ggdebt"

SECTORS = [
    ("S13", "APU consolidé", "General government (consolidated)"),
    ("S1311", "État central (APUC)", "Central government"),
    ("S1313", "Collectivités locales (APUL)", "Local government"),
    ("S1314", "Sécurité sociale (ASSO)", "Social security funds"),
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


# =============================================================================
# Eurostat helpers
# =============================================================================

def fetch_eurostat(params: list[tuple[str, str]]) -> dict:
    url = f"{EUROSTAT_API}?{urlencode(params)}"
    req = Request(url, headers={"User-Agent": "FranceOpenData/1.0"})
    with urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def parse_jsonstat(data: dict) -> dict[tuple, float]:
    """Flatten JSON-stat values into a dict keyed by (sector, geo, time, unit)."""
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
        # Keep all dims we might want to slice later
        key = (
            coords.get("sector"),
            coords.get("geo"),
            coords.get("time"),
            coords.get("unit"),
        )
        out[key] = val
    return out


# =============================================================================
# Builders
# =============================================================================

def build_fr_series() -> tuple[list[dict], str, str]:
    """FR series by sector, in both PC_GDP and MIO_EUR."""
    params = [
        ("format", "JSON"),
        ("na_item", "GD"),
        ("geo", "FR"),
    ]
    for u in ("PC_GDP", "MIO_EUR"):
        params.append(("unit", u))
    for s, _, _ in SECTORS:
        params.append(("sector", s))

    print("  Fetching FR series (4 sectors × 2 units × all quarters)…")
    raw = fetch_eurostat(params)
    points = parse_jsonstat(raw)

    # Collect all quarters present
    quarters = sorted({t for (_, _, t, _) in points.keys() if t})
    print(f"  {len(quarters)} quarters from {quarters[0]} to {quarters[-1]}")

    series = []
    for code, label_fr, label_en in SECTORS:
        pc_gdp = []
        mio_eur = []
        for q in quarters:
            v_pct = points.get((code, "FR", q, "PC_GDP"))
            v_eur = points.get((code, "FR", q, "MIO_EUR"))
            if v_pct is not None or v_eur is not None:
                pc_gdp.append({"t": q, "v": v_pct})
                mio_eur.append({"t": q, "v": v_eur})
        series.append({
            "code": code,
            "label_fr": label_fr,
            "label_en": label_en,
            "pc_gdp": pc_gdp,
            "mio_eur": mio_eur,
        })

    eurostat_updated = raw.get("updated", "")
    return series, quarters[-1], eurostat_updated


def build_peer_compare(latest_quarter: str) -> tuple[list[dict], str]:
    """Latest-quarter S13 PC_GDP for FR vs DE/IT/ES/NL/EU27."""
    # Eurostat sometimes lags some countries; fall back quarter by quarter.
    # We try up to 4 quarters back to get a peer-complete snapshot.
    for try_q in _quarters_back(latest_quarter, 4):
        params = [
            ("format", "JSON"),
            ("na_item", "GD"),
            ("sector", "S13"),
            ("unit", "PC_GDP"),
            ("time", try_q),
        ]
        for g, _ in PEERS:
            params.append(("geo", g))

        raw = fetch_eurostat(params)
        points = parse_jsonstat(raw)
        peer_values = {}
        for g, _ in PEERS:
            v = points.get(("S13", g, try_q, "PC_GDP"))
            if v is not None:
                peer_values[g] = v
        if len(peer_values) == len(PEERS):
            print(f"  Peer compare uses quarter {try_q} (full coverage)")
            return [
                {"geo": g, "label_fr": label, "label_en": label, "value_pct_gdp": peer_values[g]}
                for g, label in PEERS
            ], try_q

    # Best effort with whatever we got at latest_quarter
    print(f"  ⚠ peer compare incomplete at {latest_quarter}, returning partial")
    params = [
        ("format", "JSON"),
        ("na_item", "GD"),
        ("sector", "S13"),
        ("unit", "PC_GDP"),
        ("time", latest_quarter),
    ]
    for g, _ in PEERS:
        params.append(("geo", g))
    raw = fetch_eurostat(params)
    points = parse_jsonstat(raw)
    return [
        {
            "geo": g,
            "label_fr": label,
            "label_en": label,
            "value_pct_gdp": points.get(("S13", g, latest_quarter, "PC_GDP")),
        }
        for g, label in PEERS
    ], latest_quarter


def _quarters_back(q: str, n: int) -> list[str]:
    """['2025-Q3', '2025-Q2', '2025-Q1', '2024-Q4'] from '2025-Q3' with n=4."""
    out = []
    year, qn = int(q[:4]), int(q[-1])
    for _ in range(n):
        out.append(f"{year}-Q{qn}")
        qn -= 1
        if qn == 0:
            qn = 4
            year -= 1
    return out


# =============================================================================
# Main
# =============================================================================

def main() -> int:
    print("→ Eurostat quarterly debt sync")
    print(f"  Output dir: {OUTPUT_DIR}")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    series, latest_quarter, eurostat_updated = build_fr_series()
    peers, peer_quarter = build_peer_compare(latest_quarter)

    payload = {
        "perimeter": "APU consolidé",
        "perimeter_label_fr": "Administrations publiques (APU) — Eurostat trimestrielle",
        "perimeter_label_en": "General government (APU) — Eurostat quarterly",
        "source": "Eurostat — gov_10q_ggdebt",
        "source_url": "https://ec.europa.eu/eurostat/databrowser/view/gov_10q_ggdebt/default/table",
        "source_dataset_id": "gov_10q_ggdebt",
        "na_item": "GD (Government consolidated gross debt — Maastricht)",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "eurostat_updated": eurostat_updated,
        "latest_quarter": latest_quarter,
        "fr_series": series,
        "peer_compare": {
            "quarter": peer_quarter,
            "values": peers,
        },
        "notes_fr": (
            "Dette publique au sens de Maastricht (consolidée brute). "
            "S13 ≠ S1311 + S1313 + S1314 : la consolidation élimine les détentions "
            "croisées entre administrations publiques."
        ),
        "notes_en": (
            "Maastricht government debt (consolidated, gross). "
            "S13 ≠ S1311 + S1313 + S1314 because consolidation removes cross-holdings "
            "between government sub-sectors."
        ),
    }

    out_file = OUTPUT_DIR / "eurostat_dette.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"  ✓ Wrote {out_file}")

    index = {
        "latest_quarter": latest_quarter,
        "source": payload["source"],
        "source_url": payload["source_url"],
        "fetched_at": payload["fetched_at"],
    }
    with open(OUTPUT_DIR / "eurostat_dette_index.json", "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"  ✓ Wrote eurostat_dette_index.json")

    # Sanity-check
    s13 = next(s for s in series if s["code"] == "S13")
    s1311 = next(s for s in series if s["code"] == "S1311")
    s1313 = next(s for s in series if s["code"] == "S1313")
    s1314 = next(s for s in series if s["code"] == "S1314")
    print("\n  Sanity check (latest quarter, FR, % PIB):")
    print(f"    APU consolidé (S13):     {s13['pc_gdp'][-1]['v']}  (expected ~115-118)")
    print(f"    État central (S1311):    {s1311['pc_gdp'][-1]['v']}  (expected ~100-103)")
    print(f"    Collectivités (S1313):   {s1313['pc_gdp'][-1]['v']}  (expected ~9-10)")
    print(f"    Sécurité sociale (S1314):{s1314['pc_gdp'][-1]['v']}  (expected ~9-11)")
    fr_eur = s13["mio_eur"][-1]["v"]
    print(f"    APU en Mds €:            {fr_eur/1000 if fr_eur else '?':.0f}  (expected ~3 200-3 400)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
