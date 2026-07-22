#!/usr/bin/env python3
"""
Export National Évolution (OFGL 7 ans) → per-commune JSON.

Per-commune financial trajectory (dépenses/recettes de fonctionnement, épargne,
dette — totals + €/hab, per year). Deterministic (OFGL), no enrichment.

  website/public/data/communes-evolution/{slug}/evolution.json → bucket
  website/src/data/communes-evolution-manifest.json (committed)
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
MART = f"{PROJECT_ID}.{_MARTS}.mart_evolution_national"
WEBSITE_DATA = PIPELINE_ROOT.parent / "website" / "public" / "data"
INDEX_FILE = WEBSITE_DATA / "communes-all" / "index.json"
OUT_ROOT = WEBSITE_DATA / "communes-evolution"
MANIFEST_FILE = PIPELINE_ROOT.parent / "website" / "src" / "data" / "communes-evolution-manifest.json"

SOURCE_LABEL = "OFGL — base communes consolidée"
SOURCE_URL = "https://data.ofgl.fr/explore/dataset/ofgl-base-communes-consolidee/"
BUCKET_BASE = "https://storage.googleapis.com/qipu-communes-budget/communes-evolution"


def get_client():
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        p = Path.home() / ".config" / "gcloud" / "application_default_credentials.json"
        if p.exists():
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(p)
    return bigquery.Client(project=PROJECT_ID)


def fetch(client, insees):
    where = "WHERE code_insee IN UNNEST(@insees)" if insees else ""
    params = [bigquery.ArrayQueryParameter("insees", "STRING", insees)] if insees else []
    sql = f"""SELECT code_insee, commune_nom, annee, population,
                     depenses_fonctionnement, recettes_fonctionnement, epargne_brute,
                     encours_dette, depenses_equipement,
                     depenses_fonctionnement_hab, recettes_fonctionnement_hab,
                     encours_dette_hab, capacite_desendettement
              FROM `{MART}` {where}"""
    job = client.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=params))
    by_insee = defaultdict(list)
    for r in job.result():
        by_insee[r["code_insee"]].append(dict(r))
    return by_insee


def num(x):
    return round(x, 2) if x is not None else None


def build(insee, meta, rows, now):
    rows = sorted(rows, key=lambda r: r["annee"])
    if len(rows) < 2:
        return None
    series = [
        {
            "year": int(r["annee"]),
            "depenses": num(r["depenses_fonctionnement"]),
            "recettes": num(r["recettes_fonctionnement"]),
            "epargne": num(r["epargne_brute"]),
            "dette": num(r["encours_dette"]),
            "equipement": num(r["depenses_equipement"]),
            "depenses_hab": num(r["depenses_fonctionnement_hab"]),
            "recettes_hab": num(r["recettes_fonctionnement_hab"]),
            "dette_hab": num(r["encours_dette_hab"]),
            "capacite_desendettement": num(r["capacite_desendettement"]),
        }
        for r in rows
    ]
    return {
        "generated_at": now, "source": SOURCE_LABEL, "source_url": SOURCE_URL,
        "commune": {"insee": insee, "slug": meta["slug"], "nom": meta["nom"]},
        "years": [s["year"] for s in series],
        "series": series,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", nargs="*", default=[])
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()
    idx = json.load(open(INDEX_FILE, encoding="utf-8"))["communes"]
    slug_to_insee = {v["slug"]: k for k, v in idx.items()}
    insees = None if args.all else [slug_to_insee[s] for s in args.slugs if s in slug_to_insee]
    if not args.all and not insees:
        print("Nothing to export."); return 1
    client = get_client()
    by_insee = fetch(client, insees)
    print(f"→ évolution for {len(by_insee)} commune(s)")
    now = datetime.now(timezone.utc).isoformat()
    keys = list(by_insee.keys())[: args.limit] if args.limit else list(by_insee.keys())
    manifest = {}
    for insee in keys:
        meta = idx.get(insee)
        if not meta:
            continue
        p = build(insee, meta, by_insee[insee], now)
        if not p:
            continue
        out = OUT_ROOT / meta["slug"]
        out.mkdir(parents=True, exist_ok=True)
        json.dump(p, open(out / "evolution.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        manifest[meta["slug"]] = {"years": p["years"]}
    print(f"  ✓ wrote {len(manifest)} files → {OUT_ROOT}")
    if args.all:
        MANIFEST_FILE.parent.mkdir(parents=True, exist_ok=True)
        json.dump({"source": SOURCE_LABEL, "bucket": BUCKET_BASE, "n_communes": len(manifest), "communes": manifest},
                  open(MANIFEST_FILE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print(f"  ✓ manifest → {MANIFEST_FILE} ({len(manifest)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
