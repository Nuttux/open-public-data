#!/usr/bin/env python3
"""
Export subventions_delibs/session_{session_id}.json — délibérations Paris.

Source: mart_deliberations (BigQuery), alimenté par
  raw.deliberations_*_paris ← sync_deliberations.py

Reconstruit les fichiers session_*.json (avec sessions metadata, delibs[],
articles[]) à partir du grain row-level du mart.

Output:
    website/public/data/subventions_delibs/session_{session_id}.json

Usage:
    python pipeline/scripts/export/export_deliberations.py
    python pipeline/scripts/export/export_deliberations.py --session 147
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent))
from utils.logger import Logger
from _export_common import get_bigquery_client, data_dir, marts_dataset

PROJECT_ID = "open-data-france-484717"
MARTS_DATASET = marts_dataset()
OUTPUT_DIR = data_dir() / "subventions_delibs"


def fetch_rows(client: bigquery.Client) -> list[dict]:
    query = f"""
    SELECT * FROM `{PROJECT_ID}.{MARTS_DATASET}.mart_deliberations`
    """
    return [dict(r) for r in client.query(query).result()]


def build_session_payload(session_id: int, rows: list[dict]) -> dict:
    rows = [r for r in rows if r["session_id"] == session_id]
    if not rows:
        return None
    sample = rows[0]

    # Reconstruct delibs (one per delib_id)
    delibs_by_id: dict[str, dict] = {}
    articles: list[dict] = []
    for r in rows:
        if r["delib_id"] and r["delib_id"] not in delibs_by_id:
            delibs_by_id[r["delib_id"]] = {
                "delib_id": r["delib_id"],
                "id_entite": r["delib_id_entite"],
                "title": r["delib_title"],
                "direction_id": r["direction_id"],
                "direction_name": r["direction_name"],
                "session_id": session_id,
            }
        article_num = r["article_num"]
        if article_num is not None:
            try:
                article_num = int(article_num)
            except (TypeError, ValueError):
                pass
        articles.append({
            "delib_id": r["delib_id"],
            "direction_id": r["direction_id"],
            "direction_name": r["direction_name"],
            "session_id": session_id,
            "article_num": article_num,
            "beneficiary": r["beneficiary"],
            "siret": r["siret"],
            "amount_eur": r["amount_eur"],
            "amount_raw": r["amount_raw"],
            "motif": r["motif"],
            "dossier": r["dossier"],
        })

    delibs = sorted(delibs_by_id.values(), key=lambda d: d["delib_id"])
    return {
        "session_id": session_id,
        "generated_at": sample["session_generated_at"],
        "source": sample["session_source"],
        "nb_delibs": sample["session_nb_delibs"],
        "nb_articles": sample["session_nb_articles"],
        "delibs": delibs,
        "articles": articles,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--session", type=int)
    parser.add_argument("--city", default="paris")
    args = parser.parse_args()

    global OUTPUT_DIR, MARTS_DATASET
    OUTPUT_DIR = data_dir(args.city) / "subventions_delibs"
    MARTS_DATASET = marts_dataset(args.city)

    logger = Logger("export_deliberations")
    logger.header("Export Conseil de Paris deliberations")

    client = get_bigquery_client()
    rows = fetch_rows(client)
    by_session: dict[int, list[dict]] = defaultdict(list)
    for r in rows:
        by_session[r["session_id"]].append(r)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    target_sessions = (
        [args.session] if args.session else sorted(by_session.keys())
    )
    for sid in target_sessions:
        payload = build_session_payload(sid, rows)
        if payload is None:
            logger.warning(f"Session {sid} sans donnée, ignorée")
            continue
        out = OUTPUT_DIR / f"session_{sid}.json"
        out.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
        logger.success(
            f"  session_{sid}: {len(payload['delibs'])} delibs / "
            f"{len(payload['articles'])} articles"
        )
    logger.success(f"Terminé · {len(target_sessions)} session(s)")


if __name__ == "__main__":
    main()
