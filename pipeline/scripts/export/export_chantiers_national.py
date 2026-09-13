#!/usr/bin/env python3
"""
Export national — chantiers financés par l'État (Fonds vert) → un JSON par
commune bénéficiaire, dans le bucket privé, + manifeste commité (slug → n).

  website/public/data/communes-chantiers/{slug}/chantiers.json
  website/src/data/communes-chantiers-manifest.json

Usage :
    python scripts/export/export_chantiers_national.py --all
    python scripts/export/export_chantiers_national.py --slugs pantin
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
_MARTS = os.environ.get("NATIONAL_MARTS_DATASET", "dbt_paris_national_marts")
MART = f"{PROJECT_ID}.{_MARTS}.mart_chantiers_etat_national"
WEBSITE_DATA = PIPELINE_ROOT.parent / "website" / "public" / "data"
INDEX_FILE = WEBSITE_DATA / "communes-all" / "index.json"
OUT_ROOT = WEBSITE_DATA / "communes-chantiers"
MANIFEST_FILE = PIPELINE_ROOT.parent / "website" / "src" / "data" / "communes-chantiers-manifest.json"
SOURCE_LABEL = "Fonds vert — projets subventionnés (ministère de la Transition écologique)"
SOURCE_URL = "https://www.data.gouv.fr/datasets/fonds-vert-liste-des-projets-subventionnes"
BUCKET_BASE = "https://storage.googleapis.com/qipu-communes-budget/communes-chantiers"


def get_client() -> bigquery.Client:
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        p = Path.home() / ".config" / "gcloud" / "application_default_credentials.json"
        if p.exists():
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(p)
    return bigquery.Client(project=PROJECT_ID)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", nargs="*", default=[])
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    idx = json.load(open(INDEX_FILE, encoding="utf-8"))["communes"]
    slug_to_insee = {v["slug"]: k for k, v in idx.items()}
    insees = None if args.all else [slug_to_insee[s] for s in args.slugs if s in slug_to_insee]
    if not args.all and not insees:
        print("Nothing to export.")
        return 1
    client = get_client()
    where = "WHERE code_insee IN UNNEST(@insees)" if insees else ""
    params = [bigquery.ArrayQueryParameter("insees", "STRING", insees)] if insees else []
    sql = f"SELECT code_insee, annee, nom_projet, resume_projet, montant_engage, demarche, numero_dossier FROM `{MART}` {where}"
    by_insee: dict[str, list[dict]] = defaultdict(list)
    for r in client.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=params)).result():
        by_insee[r["code_insee"]].append(dict(r))
    now = datetime.now(timezone.utc).isoformat()
    manifest = {}
    for insee, rows in by_insee.items():
        meta = idx.get(insee)
        if not meta:
            continue
        rows.sort(key=lambda r: (-(r["annee"] or 0), -(r["montant_engage"] or 0)))
        out = OUT_ROOT / meta["slug"]
        out.mkdir(parents=True, exist_ok=True)
        json.dump(
            {
                "generated_at": now, "source": SOURCE_LABEL, "source_url": SOURCE_URL,
                "commune": {"insee": insee, "slug": meta["slug"], "nom": meta["nom"]},
                "total": {"montant": sum(r["montant_engage"] or 0 for r in rows), "nb": len(rows),
                          "years": sorted({r["annee"] for r in rows if r["annee"]})},
                "chantiers": [
                    {"annee": r["annee"], "nom": r["nom_projet"], "resume": r["resume_projet"],
                     "montant": r["montant_engage"], "demarche": r["demarche"], "dossier": r["numero_dossier"]}
                    for r in rows
                ],
            },
            open(out / "chantiers.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"),
        )
        manifest[meta["slug"]] = {"nb": len(rows), "montant": round(sum(r["montant_engage"] or 0 for r in rows))}
    print(f"  ✓ wrote {len(manifest)} commune files → {OUT_ROOT}")
    if args.all:
        MANIFEST_FILE.parent.mkdir(parents=True, exist_ok=True)
        json.dump({"source": SOURCE_LABEL, "bucket": BUCKET_BASE, "n_communes": len(manifest), "communes": manifest},
                  open(MANIFEST_FILE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        print(f"  ✓ manifest → {MANIFEST_FILE} ({len(manifest)} communes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
