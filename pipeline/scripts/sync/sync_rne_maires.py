#!/usr/bin/env python3
"""
National ingest — Répertoire national des élus (conseillers municipaux)
→ raw_national.rne_conseillers_municipaux (BigQuery).

Source : ministère de l'Intérieur, data.gouv.fr, licence ouverte, à jour du
renouvellement de mars 2026.

Vie privée (règle du site, 2026-09-09) : on ne garde QUE ce qui sert à dire
« Maire : Prénom Nom, depuis mars 2026 · 49 conseillers » — commune, nom,
prénom, fonction, dates de mandat et de fonction. La date de naissance, la
catégorie socioprofessionnelle, la nationalité et le sexe ne sont jamais
chargés, même en privé.

Usage :
    python scripts/sync/sync_rne_maires.py
"""
from __future__ import annotations

import csv
import io
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

PROJECT_ID = "open-data-france-484717"
DATASET_ID = "raw_national"
TABLE = "rne_conseillers_municipaux"
DATASET_API = "https://www.data.gouv.fr/api/1/datasets/repertoire-national-des-elus-1/"

KEEP = {
    "Code du département": "dep_code",
    "Libellé du département": "dep_name",
    "Code de la commune": "com_code",
    "Libellé de la commune": "com_name",
    "Nom de l'élu": "nom",
    "Prénom de l'élu": "prenom",
    "Date de début du mandat": "date_debut_mandat",
    "Libellé de la fonction": "fonction",
    "Date de début de la fonction": "date_debut_fonction",
}
BQ_SCHEMA = "dep_code:STRING,dep_name:STRING,com_code:STRING,com_name:STRING,nom:STRING,prenom:STRING,date_debut_mandat:STRING,fonction:STRING,date_debut_fonction:STRING"

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "cache" / "wip" / "national" / "rne"


def resource_url() -> str:
    with urllib.request.urlopen(DATASET_API, timeout=60) as r:
        d = json.load(r)
    for res in d["resources"]:
        if "conseillers-municipaux" in (res.get("title") or "").lower() or "conseiller-municipal" in (res.get("url") or ""):
            return res["url"]
    raise SystemExit("fichier des conseillers municipaux introuvable")


def main() -> int:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    url = resource_url()
    print(f"  téléchargement {url}")
    raw = urllib.request.urlopen(url, timeout=600).read().decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(raw), delimiter=";")
    missing = [k for k in KEEP if k not in (reader.fieldnames or [])]
    if missing:
        raise SystemExit(f"colonnes attendues absentes : {missing}")
    out = CACHE_DIR / "rne_conseillers_municipaux.csv"
    n = 0
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(list(KEEP.values()))
        for row in reader:
            w.writerow([(row.get(k) or "").strip() for k in KEEP])
            n += 1
    print(f"  {n:,} élus, {len(KEEP)} colonnes (aucune donnée sensible) → {out.name}")
    subprocess.run(
        ["bq", "load", "--replace", "--source_format=CSV", "--skip_leading_rows=1", "--allow_quoted_newlines",
         f"--project_id={PROJECT_ID}", f"{DATASET_ID}.{TABLE}", str(out), BQ_SCHEMA],
        check=True,
    )
    print(f"✓ {PROJECT_ID}.{DATASET_ID}.{TABLE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
