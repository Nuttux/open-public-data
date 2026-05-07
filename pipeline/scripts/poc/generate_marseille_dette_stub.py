#!/usr/bin/env python3
"""
POC stub: build Marseille dette / patrimoine JSON files directly from the
already-published OFGL aggregate exposed at
``website/public/data/communes/marseille.json`` (national sync, code INSEE 13055).

Reproduces the schemas that the Paris ``loadPatrimoineData`` /
``loadCitiesDebtSnapshot`` loaders consume, scoped under
``website/public/data/marseille/`` (cf. ``cityJsonPath`` helper in
``website/src/lib/fusion-data.ts``).

Outputs:
  website/public/data/marseille/bilan_index.json
  website/public/data/marseille/bilan_sankey_<year>.json
    (one per OFGL year — the Marseille POC has dettes_financieres only,
     no detailed actif/passif breakdown — we therefore emit a *minimal*
     bilan that the front renders as "structure unavailable" via the
     existing loadPatrimoineStructure null-fallback.)

Limitations (P3.2 option a — section disparait silencieusement) :
  - Pas de bilan détaillé Actif/Passif Marseille (CA M57 row-level pas
    encore intégré au pipeline) → ``masses_actif`` / ``masses_passif``
    indisponibles → BilanBoard / PatrimoineDrillList absents.
  - Pas de structure dette (split obligataire / bancaire / divers) →
    DetteStructurePanel absent.
  - Pas de hors-bilan (RPLS national pas encore croisé pour Marseille) →
    section hors-bilan absente.
  - Pas de série CRC (Marseille n'a qu'un rapport ponctuel "Marseille en
    Grand" 2024, pas de stress-test annuel comme Paris) → snapshot CRC
    absent (cf. ``crcDebtYearsFor()`` qui retourne null).

⚠ This is a POC fixture wired in front of the canonical pipeline. Once the
Marseille CA M57 is row-level + the dette / hors-bilan models are
multi-city, this script can be deleted.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent.parent
WEBSITE_DATA = REPO_ROOT / "website" / "public" / "data"
SOURCE_FILE = WEBSITE_DATA / "communes" / "marseille.json"
OUT_DIR = WEBSITE_DATA / "marseille"

CITY = "marseille"
CITY_LABEL = "Marseille"
CENTRAL_NODE = f"Patrimoine {CITY_LABEL}"


def _series_by_year(series: list[dict]) -> dict[int, float]:
    """Convert OFGL series (list of {year, montant, eur_hab}) → {year: montant}."""
    return {int(p["year"]): float(p["montant"]) for p in series if p.get("montant") is not None}


def build_bilan_sankey(
    year: int,
    encours_dette: float,
    epargne_brute: float,
) -> dict:
    """Build a minimal Sankey for Marseille — only debt is reliably known
    via OFGL aggregates. Actif / Passif details are not available in the
    POC, so the Sankey is skeletal: it carries the totals the front needs
    (dette_totale, dettes_financieres, fonds_propres=0 placeholder) plus a
    minimal nodes/links list so the file is self-consistent.

    The actif side is **not synthesized** (no fake numbers). Instead we set
    ``actif_net = passif_net = encours_dette`` (a tautological equilibrium)
    and rely on the fact that ``loadPatrimoineStructure`` will return null
    for Marseille (no patrimoine_structure_<year>.json file) which makes
    BilanBoard / PatrimoineDrillList disappear silently (P3.2 option a).
    """
    # OFGL only exposes dettes_financieres at the aggregate level. We do not
    # know the split fonds_propres / dettes_non_financieres / provisions, so
    # we emit zeros and flag the front to skip those sections.
    totals = {
        "actif_net": encours_dette,  # placeholder = passif (tautology)
        "passif_net": encours_dette,
        "ecart_equilibre": 0.0,
        "fonds_propres": 0.0,
        "dette_totale": encours_dette,
        "dettes_financieres": encours_dette,
        "dettes_non_financieres": 0.0,
        "provisions": 0.0,
    }
    nodes = [
        {"name": "Encours OFGL", "category": "actif"},
        {"name": CENTRAL_NODE, "category": "central"},
        {"name": "Dettes financières", "category": "passif"},
    ]
    links = [
        {"source": "Encours OFGL", "target": CENTRAL_NODE, "value": encours_dette},
        {"source": CENTRAL_NODE, "target": "Dettes financières", "value": encours_dette},
    ]
    return {
        "year": year,
        "city": CITY,
        "city_label": CITY_LABEL,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "totals": totals,
        "kpis": {
            "ratio_endettement": None,  # not derivable from OFGL alone
            "pct_fonds_propres": None,
            "pct_dette_financiere": 100.0,
        },
        "nodes": nodes,
        "links": links,
        "drilldown": {"actif": {}, "passif": {}},
        "source": {
            "label": "OFGL — ofgl-base-communes-consolidee",
            "url": "https://data.ofgl.fr/explore/dataset/ofgl-base-communes-consolidee/",
            "perimeter": "Comptes consolidés OFGL (M14 + M57 harmonisés)",
            "epargne_brute": epargne_brute,  # exposed for downstream capacite_desendettement
        },
    }


def build_index(years_with_data: list[int], totals_by_year: dict[int, dict]) -> dict:
    return {
        "city": CITY,
        "city_label": CITY_LABEL,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "OFGL — ofgl-base-communes-consolidee (POC stub)",
        "description": (
            "Patrimoine / dette de la Ville de Marseille — POC v1. Encours de "
            "dette et épargne brute issus de l'agrégat OFGL national. Pas de "
            "ventilation Actif/Passif détaillée (CA M57 row-level pas encore "
            "intégré au pipeline)."
        ),
        "availableYears": sorted(years_with_data, reverse=True),
        "latestYear": max(years_with_data) if years_with_data else None,
        "totalsByYear": {
            str(y): {
                "actif_net": totals_by_year[y]["actif_net"],
                "passif_net": totals_by_year[y]["passif_net"],
            }
            for y in years_with_data
        },
    }


def main() -> int:
    if not SOURCE_FILE.exists():
        print(f"ERROR: source file missing: {SOURCE_FILE}", file=sys.stderr)
        return 1
    with SOURCE_FILE.open("r", encoding="utf-8") as f:
        ofgl = json.load(f)

    series = ofgl["city"]["series"]
    encours = _series_by_year(series.get("encours_dette", []))
    epargne = _series_by_year(series.get("epargne_brute", []))
    if not encours:
        print("ERROR: no encours_dette series in OFGL marseille.json", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    years = sorted(encours.keys())
    totals_by_year: dict[int, dict] = {}
    for year in years:
        sankey = build_bilan_sankey(
            year=year,
            encours_dette=encours[year],
            epargne_brute=epargne.get(year, 0.0),
        )
        out_path = OUT_DIR / f"bilan_sankey_{year}.json"
        with out_path.open("w", encoding="utf-8") as f:
            json.dump(sankey, f, ensure_ascii=False, indent=2)
        totals_by_year[year] = {
            "actif_net": sankey["totals"]["actif_net"],
            "passif_net": sankey["totals"]["passif_net"],
        }
        print(
            f"  → {out_path.relative_to(WEBSITE_DATA)} "
            f"(dette {encours[year]/1e9:.2f} Md€, "
            f"épargne {epargne.get(year, 0)/1e6:.0f} M€)"
        )

    index = build_index(years, totals_by_year)
    out_index = OUT_DIR / "bilan_index.json"
    with out_index.open("w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"\n=== index → {out_index.relative_to(WEBSITE_DATA)} ({len(years)} years, latest {index['latestYear']}) ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
