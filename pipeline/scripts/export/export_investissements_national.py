#!/usr/bin/env python3
"""
Export National Investissements → per-commune JSON.

Reads mart_investissements_national (le volet investissement du budget par
nature, DGFiP balances) and produces per commune: dépenses d'équipement vs
financement, ventilation par groupe, série par année. Déterministe, no enrichment.

  website/public/data/communes-investissements/{slug}/investissements.json → bucket
  website/src/data/communes-investissements-manifest.json (committed)
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
MART = f"{PROJECT_ID}.{_MARTS}.mart_investissements_national"

WEBSITE_DATA = PIPELINE_ROOT.parent / "website" / "public" / "data"
INDEX_FILE = WEBSITE_DATA / "communes-all" / "index.json"
OUT_ROOT = WEBSITE_DATA / "communes-investissements"
MANIFEST_FILE = PIPELINE_ROOT.parent / "website" / "src" / "data" / "communes-investissements-manifest.json"

SOURCE_LABEL = "Balances comptables DGFiP — section investissement (axe nature)"
SOURCE_URL = "https://data.economie.gouv.fr/explore/dataset/balances-comptables-des-communes-en-2024/"
SOURCE_PIPELINE = "dbt national (mart_investissements_national) → export_investissements_national.py"
BUCKET_BASE = "https://storage.googleapis.com/qipu-communes-budget/communes-investissements"


def get_client() -> bigquery.Client:
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        p = Path.home() / ".config" / "gcloud" / "application_default_credentials.json"
        if p.exists():
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(p)
    return bigquery.Client(project=PROJECT_ID)


def fetch(client, insees):
    where = "WHERE code_insee IN UNNEST(@insees)" if insees else ""
    params = [bigquery.ArrayQueryParameter("insees", "STRING", insees)] if insees else []
    sql = f"""SELECT code_insee, commune_nom, population, annee, sens_flux,
                     sankey_group_fr, montant
              FROM `{MART}` {where}"""
    job = client.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=params))
    by_insee = defaultdict(list)
    for r in job.result():
        by_insee[r["code_insee"]].append(dict(r))
    return by_insee


def build(insee, meta, rows, now):
    if not rows:
        return None
    latest = max(int(r["annee"]) for r in rows)
    pop = next((r["population"] for r in rows if r["population"]), 0) or 0
    dep = defaultdict(float)
    rec = defaultdict(float)
    by_year = defaultdict(lambda: {"depenses": 0.0, "recettes": 0.0})
    for r in rows:
        m = r["montant"] or 0
        g = r["sankey_group_fr"] or "Autre"
        y = int(r["annee"])
        if r["sens_flux"] == "Depense":
            by_year[y]["depenses"] += m
            if y == latest:
                dep[g] += m
        else:
            by_year[y]["recettes"] += m
            if y == latest:
                rec[g] += m
    tot_dep = sum(dep.values())
    tot_rec = sum(rec.values())
    return {
        "generated_at": now, "source": SOURCE_LABEL, "source_url": SOURCE_URL,
        "source_pipeline": SOURCE_PIPELINE,
        "commune": {"insee": insee, "slug": meta["slug"], "nom": meta["nom"]},
        "year": latest,
        "total": {
            "depenses": tot_dep, "recettes": tot_rec,
            "depenses_eur_hab": round(tot_dep / pop) if pop else None,
        },
        "depenses_par_groupe": sorted(
            ({"groupe": k, "montant": v} for k, v in dep.items()), key=lambda x: -x["montant"]
        ),
        "financement_par_groupe": sorted(
            ({"groupe": k, "montant": v} for k, v in rec.items()), key=lambda x: -x["montant"]
        ),
        "by_year": [{"year": y, **v} for y, v in sorted(by_year.items())],
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
    print(f"→ investissements for {len(by_insee)} commune(s)")
    now = datetime.now(timezone.utc).isoformat()
    keys = list(by_insee.keys())[: args.limit] if args.limit else list(by_insee.keys())
    manifest = {}
    for insee in keys:
        meta = idx.get(insee)
        if not meta:
            continue
        p = build(insee, meta, by_insee[insee], now)
        if not p or p["total"]["depenses"] <= 0:
            continue
        out = OUT_ROOT / meta["slug"]
        out.mkdir(parents=True, exist_ok=True)
        json.dump(p, open(out / "investissements.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        manifest[meta["slug"]] = {"year": p["year"], "depenses": round(p["total"]["depenses"])}
    print(f"  ✓ wrote {len(manifest)} files → {OUT_ROOT}")
    if args.all:
        MANIFEST_FILE.parent.mkdir(parents=True, exist_ok=True)
        json.dump({"source": SOURCE_LABEL, "bucket": BUCKET_BASE, "n_communes": len(manifest), "communes": manifest},
                  open(MANIFEST_FILE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print(f"  ✓ manifest → {MANIFEST_FILE} ({len(manifest)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
