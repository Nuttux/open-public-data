"""
BQ table snapshots — capture l'état complet des sources raw qui n'ont pas
de clé stable (line items budgétaires), à intervalle régulier.

Complète les `dbt snapshot` (qui couvrent les sources ID-keyed) en
sauvegardant les autres sources via BigQuery Table Snapshots natifs.

Run manuel :
    python pipeline/scripts/snapshot/bq_table_snapshots.py
    python pipeline/scripts/snapshot/bq_table_snapshots.py --dry-run
    python pipeline/scripts/snapshot/bq_table_snapshots.py --table bilan_comptable

Run automatique : .github/workflows/snapshots.yml (cron hebdo).

Coût BQ : les snapshots BigQuery sont gratuits pendant 7 jours, puis
$0.02/GB/mois. Avec les tables couvertes ici (~50 MB total), c'est <1€/an.

Docs source officielle :
  https://cloud.google.com/bigquery/docs/table-snapshots-intro
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone
from typing import Iterable

from google.cloud import bigquery
from google.api_core import exceptions as gcp_exc

PROJECT_ID = "open-data-france-484717"
SOURCE_DATASET = "raw"
SNAPSHOT_DATASET = "dbt_paris_snapshots"
LOCATION = "EU"

# Tables raw à snapshotter (celles SANS clé stable, donc non couvertes par
# les dbt snapshots dans pipeline/snapshots/).
#
# Pourquoi ces tables et pas les autres :
#   - comptes_administratifs_budgets_principaux_* : line items budgétaires,
#     pas d'ID stable par ligne (combinaison exercice × chapitre × nature
#     × fonction × sens peut se répéter)
#   - budgets_votes_principaux_* : idem, ligne à ligne
#   - subventions_versees_annexe_* : annexe CSV brute, pas de numero_dossier
#   - bilan_comptable : ~500 lignes, état patrimonial annuel
#   - dette_garantie_paris : composite key complexe, plus simple en whole-table
SNAPSHOT_TABLES: list[str] = [
    "comptes_administratifs_budgets_principaux_a_partir_de_2019_m57_ville_departement",
    "budgets_votes_principaux_a_partir_de_2019_m57_ville_departement",
    "subventions_versees_annexe_compte_administratif_a_partir_de_2018",
    "bilan_comptable",
    "dette_garantie_paris",
]


def setup_logger() -> logging.Logger:
    logger = logging.getLogger("bq-snapshots")
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger


def ensure_dataset(client: bigquery.Client, dataset_id: str, log: logging.Logger) -> None:
    full_id = f"{PROJECT_ID}.{dataset_id}"
    try:
        client.get_dataset(full_id)
    except gcp_exc.NotFound:
        log.info("Création du dataset %s (location=%s)", full_id, LOCATION)
        ds = bigquery.Dataset(full_id)
        ds.location = LOCATION
        ds.description = "Snapshots historisés des sources raw — pour reproductibilité des chiffres publiés"
        client.create_dataset(ds)


def snapshot_table(
    client: bigquery.Client,
    table: str,
    datestamp: str,
    dry_run: bool,
    log: logging.Logger,
) -> tuple[str, bool, str]:
    source_id = f"{PROJECT_ID}.{SOURCE_DATASET}.{table}"
    target_id = f"{PROJECT_ID}.{SNAPSHOT_DATASET}.{table}__{datestamp}"

    try:
        client.get_table(source_id)
    except gcp_exc.NotFound:
        return table, False, f"source absente : {source_id}"

    try:
        client.get_table(target_id)
        return table, True, "snapshot déjà présent (skip)"
    except gcp_exc.NotFound:
        pass

    if dry_run:
        log.info("[dry-run] créerait snapshot %s", target_id)
        return table, True, "dry-run (no-op)"

    job_config = bigquery.CopyJobConfig(
        operation_type=bigquery.OperationType.SNAPSHOT,
        write_disposition="WRITE_EMPTY",
    )
    job = client.copy_table(source_id, target_id, job_config=job_config)
    job.result()

    return table, True, f"snapshot créé : {target_id}"


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--table",
        help="Cible une table spécifique (utile pour debug ou backfill).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="N'exécute rien, log ce qui serait fait.",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)

    log = setup_logger()
    log.info("Démarrage BQ table snapshots — project=%s", PROJECT_ID)

    client = bigquery.Client(project=PROJECT_ID, location=LOCATION)
    ensure_dataset(client, SNAPSHOT_DATASET, log)

    datestamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    log.info("Datestamp: %s", datestamp)

    tables = [args.table] if args.table else SNAPSHOT_TABLES
    if args.table and args.table not in SNAPSHOT_TABLES:
        log.warning("Table %s non listée dans SNAPSHOT_TABLES — j'exécute quand même.", args.table)

    summary: list[tuple[str, bool, str]] = []
    for tbl in tables:
        log.info("→ %s", tbl)
        try:
            result = snapshot_table(client, tbl, datestamp, args.dry_run, log)
        except gcp_exc.GoogleAPIError as e:
            result = (tbl, False, f"erreur GCP : {e}")
        log.info("  %s : %s", "✓" if result[1] else "✗", result[2])
        summary.append(result)

    log.info("──────────────────────────────")
    log.info("Récap : %d OK / %d KO sur %d tables", sum(1 for _, ok, _ in summary if ok), sum(1 for _, ok, _ in summary if not ok), len(summary))

    failed = [t for t, ok, _ in summary if not ok]
    if failed:
        log.error("Échecs : %s", ", ".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
