#!/usr/bin/env python3
"""
Fetch national-level open data for Qipu.

Sources:
    - budget.gouv.fr / data.gouv.fr → Budget État LFI (mission/programme/action)
    - INSEE BDM → Dette publique, comptes nationaux APU/APUC/APUL/ASSO
    - AFT → Dette négociable État (OAT/BTF)
    - Eurostat gov_10a_exp → Comparaison UE par COFOG
    - DGFiP impots.gouv → Recettes fiscales

Produces JSON consumed by the Qipu national section.
Output: website/public/data/national/

Usage:
    python scripts/fetch_national_data.py
    python scripts/fetch_national_data.py --source etat_budget
    python scripts/fetch_national_data.py --dry-run
"""

import argparse
import json
from pathlib import Path

import requests

ROOT = Path(__file__).parent.parent
OUTPUT_DIR = ROOT / "website" / "public" / "data" / "national"

INSEE_BDM = "https://api.insee.fr/series/BDM/V1"
EUROSTAT_API = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
DATA_GOUV_API = "https://www.data.gouv.fr/api/1"


# =============================================================================
# Helpers
# =============================================================================

def save_json(data, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    size_kb = path.stat().st_size / 1024
    print(f"    → {path.relative_to(ROOT)} ({size_kb:.1f} KB)")


# =============================================================================
# 1. Budget État LFI — mission / programme / action
# =============================================================================

def fetch_etat_budget(dry_run: bool = False):
    """
    Source candidate: 'Plan de comptabilité de l'État' + 'Budget général de l'État'
    on data.gouv.fr and budget.gouv.fr.

    Target shape:
    {
        "year": 2024,
        "totals": {"recettes": 428.0e9, "depenses": 486.0e9, "solde": -58.0e9},
        "missions": [
            {
                "code": "150",
                "name": "Enseignement scolaire",
                "amount": 81.2e9,
                "programmes": [
                    {"code": "140", "name": "Enseignement scolaire public du 1er degré", "amount": 26.1e9}
                ]
            }
        ]
    }
    """
    print("\n" + "=" * 60)
    print("  BUDGET ÉTAT — Mission / Programme / Action")
    print("=" * 60)
    print("  [TODO] Source: Jeu de données budgétaires LFI sur data.gouv.fr")
    print("  [TODO] URL: https://www.data.gouv.fr/fr/datasets/plf-budget-general-missions-programmes-actions/")
    print("  [TODO] Implement CSV → hierarchical JSON")


# =============================================================================
# 2. Dette publique (AFT + INSEE)
# =============================================================================

def fetch_dette(dry_run: bool = False):
    """
    INSEE BDM series for Maastricht debt:
      - APU (all): 001694023
      - APUC (État + ODAC): 001694024
      - APUL (collectivités): 001694025
      - ASSO (sécu): 001694026

    Target shape:
    {
        "latest_quarter": "2025Q3",
        "series": [
            {"periode": "1995Q1", "APU": 545.0, "APUC": 415.0, ...},
            ...
        ],
        "ratios_pib": [...],
    }
    """
    print("\n" + "=" * 60)
    print("  DETTE PUBLIQUE — INSEE + AFT")
    print("=" * 60)
    print("  [TODO] INSEE BDM API: series 001694023-026")
    print("  [TODO] AFT encours OAT/BTF: https://www.aft.gouv.fr/")


# =============================================================================
# 3. Comparaison UE (Eurostat COFOG)
# =============================================================================

def fetch_eurostat_cofog(dry_run: bool = False):
    """
    Eurostat gov_10a_exp — dépenses APU par fonction COFOG.
    Allows FR vs DE/IT/ES/NL/EU27 comparison.

    API example:
      https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10a_exp
      ?na_item=TE&sector=S13&cofog99=GF01&geo=FR&unit=MIO_EUR

    Target shape:
    {
        "year": 2024,
        "countries": ["FR", "DE", "IT", "ES", "NL", "EU27"],
        "cofog": [
            {"code": "GF07", "name": "Santé", "values": {"FR": 11.5, "DE": 16.2, ...}},
            ...
        ]
    }
    """
    print("\n" + "=" * 60)
    print("  COMPARAISON UE — Eurostat COFOG")
    print("=" * 60)
    print("  [TODO] Eurostat gov_10a_exp, COFOG level 1 (10 fonctions)")


# =============================================================================
# 4. Vue consolidée APU (État + Sécu + Collectivités + Opérateurs)
# =============================================================================

def fetch_apu_consolide(dry_run: bool = False):
    """
    Construire la vue ~1500 Md€ de dépense publique totale, ventilée par:
      - Sous-secteur APU (APUC / APUL / ASSO / ODAC)
      - Fonction COFOG

    Sources:
      - INSEE comptes nationaux annuels T_3201 / T_3202
      - Eurostat gov_10a_main

    C'est LE différenciant clé. À construire en second après budget État seul.
    """
    print("\n" + "=" * 60)
    print("  VUE CONSOLIDÉE APU")
    print("=" * 60)
    print("  [TODO] INSEE + Eurostat → treemap unifié ~1500 Md€")


# =============================================================================
# 5. Daily Bread — calcul de ventilation personnelle
# =============================================================================

def build_daily_bread_base(dry_run: bool = False):
    """
    Pré-calcule les coefficients de ventilation pour le calculateur 'Daily Bread':
      - Poids de chaque poste de dépense publique dans le total APU
      - Taux moyens de prélèvements par décile de revenu (INSEE ERFS)
      - Estimation TVA moyenne par profil de conso

    Le calcul final se fait côté client (input: revenu + foyer).

    Target shape: static coefficients + breakdown keys.
    """
    print("\n" + "=" * 60)
    print("  DAILY BREAD — coefficients de ventilation")
    print("=" * 60)
    print("  [TODO] Extraire poids des postes APU + taux ERFS")


# =============================================================================
# Main
# =============================================================================

SOURCES = ["etat_budget", "dette", "eurostat", "apu_consolide", "daily_bread"]


def main():
    parser = argparse.ArgumentParser(description="Fetch national-level data for Qipu")
    parser.add_argument("--source", choices=SOURCES, help="Fetch a single source")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()

    print("\n" + "=" * 60)
    print("  FETCH NATIONAL DATA → JSON")
    print(f"  Output: {OUTPUT_DIR.relative_to(ROOT)}")
    print("=" * 60)

    handlers = {
        "etat_budget": fetch_etat_budget,
        "dette": fetch_dette,
        "eurostat": fetch_eurostat_cofog,
        "apu_consolide": fetch_apu_consolide,
        "daily_bread": build_daily_bread_base,
    }

    if args.source:
        handlers[args.source](dry_run=args.dry_run)
    else:
        for name, fn in handlers.items():
            fn(dry_run=args.dry_run)

    print(f"\n  Scaffold ready. Fill in TODOs to produce real JSON.\n")


if __name__ == "__main__":
    main()
