#!/usr/bin/env python3
"""
Validation externe : notre ratio demandes/attributions SLS Paris matche-t-il
le chiffre publié par DRIHL dans son infographie ?

- Notre ratio : core_logement_attente_arr où scope='paris_total'
- Référence publique : DRIHL publie "1 attribution pour N demandes" sur son
  site, rubrique infographie annuelle.

Usage:
    python scripts/audit/check_drihl_ratio.py

Exit 1 si divergence > 1 unité (5%) ou impossible d'extraire le ref.
"""

from __future__ import annotations

import re
import sys
import urllib.request
from google.cloud import bigquery

PROJECT_ID = "open-data-france-484717"
DATASET = "dbt_paris_analytics"
INFOGRAPHIE_URL = (
    "https://www.drihl.ile-de-france.developpement-durable.gouv.fr/"
    "infographie-les-attributions-de-logement-social-en-a1415.html"
)
TOLERANCE_UNITS = 1  # ratio en "demandes pour 1 attribution"


def fetch_our_ratio() -> float | None:
    c = bigquery.Client(project=PROJECT_ID)
    q = f"""
        SELECT ratio_dem_attrib
        FROM `{PROJECT_ID}.{DATASET}.core_logement_attente_arr`
        WHERE scope = 'paris_total'
        LIMIT 1
    """
    for r in c.query(q).result():
        return float(r.ratio_dem_attrib)
    return None


def fetch_drihl_ratio() -> tuple[int | None, str | None]:
    """Extrait le 'N demandes pour 1 attribution' de la page DRIHL."""
    req = urllib.request.Request(INFOGRAPHIE_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        html = resp.read().decode("utf-8", errors="replace")

    # DRIHL phrasing: "1 attribution pour 21 demandes" ou "21 demandes pour 1"
    patterns = [
        r"1\s*attribution\s*pour\s*(\d{1,3})\s*demandes",
        r"(\d{1,3})\s*demandes\s*pour\s*1\s*attribution",
    ]
    for pat in patterns:
        m = re.search(pat, html, re.IGNORECASE)
        if m:
            return int(m.group(1)), pat
    return None, None


def main() -> int:
    our = fetch_our_ratio()
    if our is None:
        print("❌ Ratio Paris introuvable dans core_logement_attente_arr")
        return 1
    print(f"  Notre ratio (core_logement_attente_arr) : {our:.1f}")

    try:
        drihl, pat = fetch_drihl_ratio()
    except Exception as e:
        print(f"⚠️  Impossible d'interroger DRIHL: {e}")
        return 0

    if drihl is None:
        print("⚠️  Impossible d'extraire le ratio depuis la page infographie DRIHL.")
        print(f"    URL : {INFOGRAPHIE_URL}")
        return 0

    print(f"  DRIHL infographie : {drihl} (via pattern {pat!r})")
    diff = abs(our - drihl)
    print(f"  Diff : {diff:.1f}")

    if diff > TOLERANCE_UNITS:
        print(
            f"\n❌ Divergence > {TOLERANCE_UNITS} unité — vérifier la méthodo. "
            "Possible : DRIHL a changé le périmètre (choix 1 vs tous choix, "
            "ou filtre de la file active).\n"
            f"   Source : {INFOGRAPHIE_URL}"
        )
        return 1

    print("\n✓ Ratio Paris cohérent avec l'infographie DRIHL.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
