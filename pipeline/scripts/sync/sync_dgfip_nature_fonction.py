#!/usr/bin/env python3
"""
DGFiP « balances comptables … présentation croisée nature-fonction » → BigQuery
`raw_national.dgfip_balances_nature_fonction`. Chargement brut, rien d'autre.

Ce que la source est :
    Un ZIP par exercice, publié en pièce jointe d'un jeu data.economie.gouv.fr
    dont l'identifiant porte l'année (…-nature-fonction-2024, …-2025). Dedans,
    un CSV `;` en ISO-8859-1, décimales à virgule, 30 colonnes. Chaque ligne
    porte À LA FOIS une FONCTION (la politique publique) et un COMPTE (la
    nature), pour TOUTES les collectivités : communes, Paris, groupements à
    fiscalité propre, départements, régions, syndicats, EPL…

Ce que ce script fait :
    Il copie ces lignes telles quelles dans BigQuery — toutes les catégories,
    toutes les colonnes, en texte (« 96971,23 » reste « 96971,23 ») — avec
    trois colonnes de chargement :
      annee           l'exercice demandé (contrôlé contre EXER, ligne à ligne)
      ligne           le rang de la ligne dans le CSV (1 = première ligne de
                      données) : l'ordre de la source, que l'export rejoue
      source_fichier  le nom du CSV chargé (il date la republication)
    Le typage, les codes INSEE, les clés de fonction, le périmètre des
    communes : tout ça vit dans dbt (stg_dgfip_nature_fonction →
    core_dgfip_nature_fonction → mart_communes_fonctions), pas ici.

Idempotent : la table est partitionnée par `annee` ; recharger un exercice
remplace sa partition et ne touche pas aux autres. Le ZIP est gardé en cache
(pipeline/cache/dgfip/) et re-téléchargé seulement s'il manque ou si --force.
Le nombre de lignes est contrôlé contre le `total_count` de l'API du jeu : un
écart arrête tout avant le chargement.

Usage :
    python3 pipeline/scripts/sync/sync_dgfip_nature_fonction.py                # exercice 2024
    python3 pipeline/scripts/sync/sync_dgfip_nature_fonction.py --annee 2025
    python3 pipeline/scripts/sync/sync_dgfip_nature_fonction.py --derniere     # dernier exercice publié
    python3 pipeline/scripts/sync/sync_dgfip_nature_fonction.py --lister       # exercices publiés
    python3 pipeline/scripts/sync/sync_dgfip_nature_fonction.py --dry-run      # télécharger + convertir

Chaîne complète (fonctions.json par commune) :
    1. ce script
    2. cd pipeline && dbt run  --target prod --select stg_dgfip_nature_fonction core_dgfip_nature_fonction mart_communes_fonctions
       cd pipeline && dbt test --target prod --select stg_dgfip_nature_fonction core_dgfip_nature_fonction mart_communes_fonctions
    3. python3 pipeline/scripts/export/export_communes_fonctions.py
    4. gcloud storage rsync -r website/public/data/communes-fonctions gs://qipu-communes-budget/communes-fonctions

Source :
    https://data.economie.gouv.fr/explore/dataset/balances-comptables-des-
    collectivites-et-des-etablissements-publics-locaux-avec-la-presentation-
    croisee-nature-fonction-2024/
"""

from __future__ import annotations

import argparse
import csv
import gzip
import io
import json
import os
import re
import sys
import zipfile
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[3]
CACHE_DIR = ROOT / "pipeline" / "cache" / "dgfip"

PROJECT_ID = "open-data-france-484717"
DATASET_ID = "raw_national"
TABLE = "dgfip_balances_nature_fonction"

CATALOG = "https://data.economie.gouv.fr/api/explore/v2.1/catalog"
DATASET_PREFIX = (
    "balances-comptables-des-collectivites-et-des-etablissements-publics-"
    "locaux-avec-la-presentation-croisee-nature-fonction-"
)
ANNEE_PAR_DEFAUT = 2024

# L'en-tête exact du CSV. Une colonne ajoutée, retirée ou déplacée par la DGFiP
# arrête le chargement : on ne devine pas ce qu'est devenue une colonne.
COLONNES = [
    "EXER", "IDENT", "NDEPT", "LBUDG", "MODVTHEL", "INSEE", "CBUDG", "CTYPE",
    "CSTYP", "NOMEN", "siren", "CREGI", "CACTI", "SECTEUR", "FINESS", "CODBUD1",
    "CATEG", "BAL", "FONCTION", "COMPTE", "BEDEB", "BECRE", "OBNETDEB",
    "OBNETCRE", "ONBDEB", "ONBCRE", "OOBDEB", "OOBCRE", "SD", "SC",
]
# Tout en texte : les codes gardent leurs zéros de tête (NDEPT « 075 », compte
# « 60611 »), les montants leur écriture d'origine. dbt type.
SCHEMA = (
    [("annee", "INTEGER", "REQUIRED"), ("ligne", "INTEGER", "REQUIRED")]
    + [(c.lower(), "STRING", "NULLABLE") for c in COLONNES]
    + [("source_fichier", "STRING", "REQUIRED")]
)
PARTITION_RANGE = (2010, 2051, 1)


def _log(msg: str) -> None:
    print(msg, flush=True)


def _get_json(url: str) -> dict:
    req = Request(url, headers={"User-Agent": "qipu-pipeline/1.0"})
    with urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


# ---------------------------------------------------------------------------
# Catalogue

def dataset_id(annee: int) -> str:
    return f"{DATASET_PREFIX}{annee}"


def annees_publiees() -> list[int]:
    """Les exercices publiés, lus dans le catalogue : un jeu par année."""
    annees: list[int] = []
    offset = 0
    while True:
        q = urlencode({
            "where": f'startswith(dataset_id, "{DATASET_PREFIX}")',
            "select": "dataset_id",
            "limit": 100,
            "offset": offset,
        })
        page = _get_json(f"{CATALOG}/datasets?{q}")
        results = page.get("results", [])
        for r in results:
            m = re.fullmatch(re.escape(DATASET_PREFIX) + r"(\d{4})", r["dataset_id"])
            if m:
                annees.append(int(m.group(1)))
        offset += len(results)
        if not results or offset >= page.get("total_count", 0):
            break
    return sorted(set(annees))


def piece_jointe_zip(annee: int) -> tuple[str, str]:
    """(url, nom de fichier) du ZIP de l'exercice.

    L'identifiant de la pièce jointe change d'une publication à l'autre
    (« balancespl_fonction_2024_dec2025_zip », « balancespl_fonction_2025_juil2026zip ») :
    on le cherche, on ne le reconstruit pas.
    """
    data = _get_json(f"{CATALOG}/datasets/{dataset_id(annee)}/attachments")
    zips = [a["metas"] for a in data.get("attachments", [])
            if a.get("metas", {}).get("mimetype") == "application/zip"]
    balances = [m for m in zips if m["id"].startswith(f"balancespl_fonction_{annee}")]
    choix = balances or zips
    if len(choix) != 1:
        raise RuntimeError(f"{annee} : {len(choix)} ZIP candidats dans les pièces jointes — {[m['id'] for m in zips]}")
    return choix[0]["url"], choix[0]["title"]


def nombre_attendu(annee: int) -> int:
    return int(_get_json(f"{CATALOG}/datasets/{dataset_id(annee)}/records?limit=0")["total_count"])


# ---------------------------------------------------------------------------
# Téléchargement et conversion

def telecharger(url: str, nom: str, force: bool) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cible = CACHE_DIR / nom
    if cible.exists() and not force:
        _log(f"  = ZIP en cache : {cible.name} ({cible.stat().st_size / 1e6:.0f} Mo)")
        return cible
    _log(f"  ↓ {url}")
    partiel = cible.with_suffix(cible.suffix + ".part")
    req = Request(url, headers={"User-Agent": "qipu-pipeline/1.0"})
    with urlopen(req, timeout=600) as resp, open(partiel, "wb") as f:
        while chunk := resp.read(1 << 20):
            f.write(chunk)
    partiel.replace(cible)
    _log(f"  ✓ {cible.name} ({cible.stat().st_size / 1e6:.0f} Mo)")
    return cible


def convertir(zip_path: Path, annee: int) -> tuple[Path, int, str]:
    """ZIP → CSV UTF-8 gzippé prêt pour BigQuery. Renvoie (chemin, lignes, nom du CSV)."""
    with zipfile.ZipFile(zip_path) as zf:
        csvs = [n for n in zf.namelist() if n.lower().endswith(".csv")]
        if len(csvs) != 1:
            raise RuntimeError(f"{zip_path.name} : {len(csvs)} CSV dans le ZIP — {csvs}")
        nom_csv = csvs[0]
        dest = CACHE_DIR / f"{Path(nom_csv).stem}.bq.csv.gz"
        n = 0
        with zf.open(nom_csv) as raw, gzip.open(dest, "wt", encoding="utf-8", newline="") as out:
            texte = io.TextIOWrapper(raw, encoding="iso-8859-1", newline="")
            reader = csv.reader(texte, delimiter=";")
            entete = next(reader, None)
            if entete != COLONNES:
                raise RuntimeError(f"en-tête inattendu dans {nom_csv} :\n  reçu    {entete}\n  attendu {COLONNES}")
            writer = csv.writer(out, lineterminator="\n")
            writer.writerow([c for c, _, _ in SCHEMA])
            for row in reader:
                n += 1
                if len(row) != len(COLONNES):
                    raise RuntimeError(f"{nom_csv} ligne {n} : {len(row)} colonnes au lieu de {len(COLONNES)}")
                if row[0] != str(annee):
                    raise RuntimeError(f"{nom_csv} ligne {n} : EXER={row[0]!r}, exercice demandé {annee}")
                writer.writerow([annee, n, *row, nom_csv])
    _log(f"  ✓ {n:,} lignes converties → {dest.name} ({dest.stat().st_size / 1e6:.0f} Mo)")
    return dest, n, nom_csv


# ---------------------------------------------------------------------------
# BigQuery

def client_bq():
    from google.cloud import bigquery

    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        adc = Path.home() / ".config" / "gcloud" / "application_default_credentials.json"
        if adc.exists():
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(adc)
    return bigquery.Client(project=PROJECT_ID)


def assurer_table(client) -> None:
    from google.api_core.exceptions import NotFound
    from google.cloud import bigquery

    ref = f"{PROJECT_ID}.{DATASET_ID}.{TABLE}"
    try:
        client.get_table(ref)
        return
    except NotFound:
        pass
    table = bigquery.Table(ref, schema=[bigquery.SchemaField(n, t, mode=m) for n, t, m in SCHEMA])
    start, end, interval = PARTITION_RANGE
    table.range_partitioning = bigquery.RangePartitioning(
        field="annee", range_=bigquery.PartitionRange(start=start, end=end, interval=interval)
    )
    table.clustering_fields = ["categ", "cbudg"]
    table.description = (
        "DGFiP — balances comptables des collectivités et EPL, présentation croisée "
        "nature-fonction. Copie fidèle du CSV (toutes catégories, toutes colonnes, en texte), "
        "un exercice par partition. Chargé par pipeline/scripts/sync/sync_dgfip_nature_fonction.py."
    )
    client.create_table(table)
    _log(f"  + table créée : {ref} (partition annee, cluster categ, cbudg)")


def charger(client, gz_path: Path, annee: int, attendu: int) -> None:
    from google.cloud import bigquery

    assurer_table(client)
    cible = f"{PROJECT_ID}.{DATASET_ID}.{TABLE}${annee}"
    config = bigquery.LoadJobConfig(
        source_format=bigquery.SourceFormat.CSV,
        skip_leading_rows=1,
        schema=[bigquery.SchemaField(n, t, mode=m) for n, t, m in SCHEMA],
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    )
    _log(f"  → chargement de la partition {annee} (remplacée) …")
    with open(gz_path, "rb") as f:
        job = client.load_table_from_file(f, cible, job_config=config)
    job.result()
    if job.output_rows != attendu:
        raise RuntimeError(f"{annee} : {job.output_rows:,} lignes chargées, {attendu:,} attendues")
    _log(f"  ✓ {job.output_rows:,} lignes → {PROJECT_ID}.{DATASET_ID}.{TABLE} (annee={annee})")


# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--annee", type=int, default=ANNEE_PAR_DEFAUT, help=f"exercice à charger (défaut {ANNEE_PAR_DEFAUT})")
    ap.add_argument("--derniere", action="store_true", help="charger le dernier exercice publié au catalogue")
    ap.add_argument("--lister", action="store_true", help="afficher les exercices publiés et s'arrêter")
    ap.add_argument("--force", action="store_true", help="re-télécharger le ZIP")
    ap.add_argument("--dry-run", action="store_true", help="télécharger et convertir, sans charger")
    args = ap.parse_args()

    if args.lister or args.derniere:
        annees = annees_publiees()
        _log(f"  exercices publiés : {', '.join(map(str, annees)) or 'aucun'}")
        if args.lister:
            return 0
        if not annees:
            _log("✗ aucun exercice trouvé au catalogue")
            return 1
        args.annee = annees[-1]

    annee = args.annee
    _log(f"→ Balance DGFiP nature-fonction {annee} → {DATASET_ID}.{TABLE}")
    url, nom_zip = piece_jointe_zip(annee)
    attendu = nombre_attendu(annee)
    _log(f"  = {dataset_id(annee)} : {attendu:,} lignes annoncées par l'API")

    zip_path = telecharger(url, nom_zip, args.force)
    gz_path, n, _ = convertir(zip_path, annee)
    if n != attendu:
        _log(f"✗ {n:,} lignes dans le CSV, {attendu:,} annoncées par l'API — chargement annulé")
        return 1

    if args.dry_run:
        _log("  (dry-run — rien n'est chargé)")
        return 0
    charger(client_bq(), gz_path, annee, n)
    return 0


if __name__ == "__main__":
    sys.exit(main())
