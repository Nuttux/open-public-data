#!/usr/bin/env python3
"""
Export National Marchés Publics (DECP) → per-commune JSON.

Reads mart_marches_national (row-level, all commune buyers) and produces, for
each commune with procurement, a JSON aggregate (total, by year, by CPV theme,
top titulaires, biggest marchés + coverage note). Deterministic — no enrichment.

  website/public/data/communes-marches/{slug}/marches.json   (→ private bucket)
  website/src/data/communes-marches-manifest.json            (committed, slug→years)

Coverage: DECP publishes marchés ≥ 40 k€ HT (~50-70% national). Shown, not hidden.

Usage:
    python scripts/export/export_marches_national.py --slugs pantin albi
    python scripts/export/export_marches_national.py --all
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import bigquery

PIPELINE_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ID = "open-data-france-484717"
_MARTS = os.environ.get("PARIS_MARTS_DATASET", "dbt_paris_marts")
MART = f"{PROJECT_ID}.{_MARTS}.mart_marches_national"

WEBSITE_DATA = PIPELINE_ROOT.parent / "website" / "public" / "data"
INDEX_FILE = WEBSITE_DATA / "communes-all" / "index.json"
OUT_ROOT = WEBSITE_DATA / "communes-marches"
MANIFEST_FILE = PIPELINE_ROOT.parent / "website" / "src" / "data" / "communes-marches-manifest.json"

SOURCE_LABEL = "Marchés publics (DECP consolidé, data.gouv.fr)"
SOURCE_URL = "https://www.data.gouv.fr/fr/datasets/donnees-essentielles-de-la-commande-publique-consolidees-format-tabulaire/"
SOURCE_PIPELINE = "DECP parquet → dbt national (mart_marches_national) → export_marches_national.py"
COVERAGE_NOTE = "DECP : marchés ≥ 40 000 € HT (obligation de publication). Couverture partielle (~50-70 %) — les petits marchés ne sont pas publiés."
BUCKET_BASE = "https://storage.googleapis.com/qipu-communes-budget/communes-marches"


def load_slug_index() -> dict:
    return json.load(open(INDEX_FILE, encoding="utf-8"))["communes"]


def get_client() -> bigquery.Client:
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        p = Path.home() / ".config" / "gcloud" / "application_default_credentials.json"
        if p.exists():
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(p)
    return bigquery.Client(project=PROJECT_ID)


def fetch(client, insees):
    where = "WHERE code_insee IN UNNEST(@insees)" if insees else ""
    params = [bigquery.ArrayQueryParameter("insees", "STRING", insees)] if insees else []
    sql = f"""
        SELECT code_insee, commune_nom, population, annee, montant, categorie_cpv,
               type_procedure, objet, titulaire_nom
        FROM `{MART}` {where}
    """
    job = client.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=params))
    by_insee = defaultdict(list)
    for r in job.result():
        by_insee[r["code_insee"]].append(dict(r))
    return by_insee


def build(insee: str, meta: dict, rows: list[dict], now: str) -> dict | None:
    if not rows:
        return None
    total_m = sum(r["montant"] or 0 for r in rows)
    by_year = defaultdict(lambda: {"montant": 0.0, "nb": 0})
    by_cat = defaultdict(lambda: {"montant": 0.0, "nb": 0})
    by_titu = defaultdict(lambda: {"montant": 0.0, "nb": 0})
    for r in rows:
        m = r["montant"] or 0
        y = r["annee"]
        if y:
            by_year[int(y)]["montant"] += m
            by_year[int(y)]["nb"] += 1
        cat = r["categorie_cpv"] or "Autres"
        by_cat[cat]["montant"] += m
        by_cat[cat]["nb"] += 1
        t = (r["titulaire_nom"] or "").strip()
        if t:
            by_titu[t]["montant"] += m
            by_titu[t]["nb"] += 1
    top_marches = sorted(rows, key=lambda r: -(r["montant"] or 0))[:15]
    return {
        "generated_at": now,
        "source": SOURCE_LABEL,
        "source_url": SOURCE_URL,
        "source_pipeline": SOURCE_PIPELINE,
        "coverage_note": COVERAGE_NOTE,
        "commune": {"insee": insee, "slug": meta["slug"], "nom": meta["nom"]},
        "total": {"montant": total_m, "nb_marches": len(rows), "nb_titulaires": len(by_titu)},
        "by_year": [{"year": y, **v} for y, v in sorted(by_year.items())],
        "by_category": sorted(
            ({"categorie": k, **v} for k, v in by_cat.items()), key=lambda x: -x["montant"]
        ),
        "top_titulaires": sorted(
            ({"nom": k, **v} for k, v in by_titu.items()), key=lambda x: -x["montant"]
        )[:15],
        "top_marches": [
            {
                "objet": (r["objet"] or "")[:200],
                "montant": r["montant"],
                "titulaire": r["titulaire_nom"],
                "annee": r["annee"],
                "procedure": r["type_procedure"],
                "categorie": r["categorie_cpv"],
            }
            for r in top_marches
        ],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", nargs="*", default=[])
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()

    idx = load_slug_index()
    slug_to_insee = {v["slug"]: k for k, v in idx.items()}
    insees = None if args.all else [slug_to_insee[s] for s in args.slugs if s in slug_to_insee]
    if not args.all and not insees:
        print("Nothing to export.")
        return 1

    client = get_client()
    by_insee = fetch(client, insees)
    print(f"→ marchés for {len(by_insee)} commune(s)")
    now = datetime.now(timezone.utc).isoformat()

    keys = list(by_insee.keys())[: args.limit] if args.limit else list(by_insee.keys())
    manifest = {}
    for insee in keys:
        meta = idx.get(insee)
        if not meta:
            continue
        payload = build(insee, meta, by_insee[insee], now)
        if not payload:
            continue
        out = OUT_ROOT / meta["slug"]
        out.mkdir(parents=True, exist_ok=True)
        json.dump(payload, open(out / "marches.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        manifest[meta["slug"]] = {
            "years": [y["year"] for y in payload["by_year"]],
            "montant": round(payload["total"]["montant"]),
            "nb": payload["total"]["nb_marches"],
        }
    print(f"  ✓ wrote {len(manifest)} commune files → {OUT_ROOT}")

    if args.all:
        MANIFEST_FILE.parent.mkdir(parents=True, exist_ok=True)
        json.dump(
            {"source": SOURCE_LABEL, "bucket": BUCKET_BASE, "n_communes": len(manifest), "communes": manifest},
            open(MANIFEST_FILE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"),
        )
        print(f"  ✓ manifest → {MANIFEST_FILE} ({len(manifest)} communes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
