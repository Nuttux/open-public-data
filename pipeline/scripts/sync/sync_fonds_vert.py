#!/usr/bin/env python3
"""
National ingest — Fonds vert (projets subventionnés par l'État, 2023-2025)
→ raw_national.fonds_vert (BigQuery).

Source : ministère de la Transition écologique, data.gouv.fr, licence ouverte.
Trois fichiers annuels aux colonnes différentes, ramenés à un même schéma :
  2023 : nom_beneficiaire_principal + siren, pas de résumé
  2024, 2025 : siret_beneficiaire, raison sociale, forme juridique, résumé
Les fichiers « p113 » (opérateurs, sans commune ni SIRET) ne sont pas chargés.

Usage :
    python scripts/sync/sync_fonds_vert.py
"""
from __future__ import annotations

import csv
import io
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

PROJECT_ID = "open-data-france-484717"
DATASET_ID = "raw_national"
TABLE = "fonds_vert"
DATASET_API = "https://www.data.gouv.fr/api/1/datasets/fonds-vert-liste-des-projets-subventionnes/"
COLS = ["annee", "nom_projet", "resume_projet", "montant_engage", "demarche", "siren_beneficiaire",
        "raison_sociale_beneficiaire", "forme_juridique_beneficiaire", "code_commune", "nom_commune",
        "code_departement", "nom_departement", "nom_region", "numero_dossier"]
BQ_SCHEMA = ",".join(f"{c}:{'INTEGER' if c == 'annee' else 'FLOAT' if c == 'montant_engage' else 'STRING'}" for c in COLS)
ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "cache" / "wip" / "national" / "fonds_vert"


def money(x: str | None) -> float | None:
    if not x:
        return None
    t = re.sub(r"[^\d,.-]", "", x).replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


def norm(row: dict, year: int) -> dict | None:
    g = lambda *ks: next(((row.get(k) or "").strip() for k in ks if row.get(k)), "")  # noqa: E731
    siren = g("siren") or g("siret_beneficiaire")[:9]
    code_commune = g("code_commune")
    if not (siren or code_commune):
        return None
    return {
        "annee": year,
        "nom_projet": g("nom_du_projet"),
        "resume_projet": g("resume_du_projet"),
        "montant_engage": money(g("montant_engage")),
        "demarche": g("demarche") or g("nom_demarche_ds"),
        "siren_beneficiaire": siren if re.fullmatch(r"\d{9}", siren) else "",
        "raison_sociale_beneficiaire": g("raison_sociale_beneficiaire") or g("nom_beneficiaire_principal"),
        "forme_juridique_beneficiaire": g("forme_juridique_beneficiaire", "forme juridique_beneficiaire"),
        "code_commune": code_commune,
        "nom_commune": g("nom_commune"),
        "code_departement": g("code_departement"),
        "nom_departement": g("nom_departement"),
        "nom_region": g("nom_region"),
        "numero_dossier": g("numero_dossier_ds"),
    }


def main() -> int:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(DATASET_API, timeout=60) as r:
        d = json.load(r)
    out = CACHE_DIR / "fonds_vert.csv"
    n = 0
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        for res in d["resources"]:
            title = res.get("title") or ""
            m = re.match(r"fonds-vert-(\d{4})-export\.csv$", title)
            if res.get("format") != "csv" or not m:
                continue  # p113 et xlsx ignorés
            year = int(m.group(1))
            raw = urllib.request.urlopen(res["url"], timeout=300).read().decode("utf-8-sig", errors="replace")
            dl = ";" if raw[:400].count(";") > raw[:400].count(",") else ","
            k = 0
            for row in csv.DictReader(io.StringIO(raw), delimiter=dl):
                r2 = norm(row, year)
                if r2:
                    w.writerow(r2)
                    k += 1
            print(f"  {title}: {k:,} projets")
            n += k
    print(f"  {n:,} projets → {out.name}")
    subprocess.run(
        ["bq", "load", "--replace", "--source_format=CSV", "--skip_leading_rows=1", "--allow_quoted_newlines",
         f"--project_id={PROJECT_ID}", f"{DATASET_ID}.{TABLE}", str(out), BQ_SCHEMA],
        check=True,
    )
    print(f"✓ {PROJECT_ID}.{DATASET_ID}.{TABLE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
