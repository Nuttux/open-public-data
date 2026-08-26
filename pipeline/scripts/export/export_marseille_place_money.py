#!/usr/bin/env python3
"""
Export mart_marseille_place_money → website/public/data/fr/marseille/places/_money.json

The place ↔ money crosswalk for Marseille civic places (operator = the place
is itself the beneficiary; residents = other orgs whose grant objet names the
place). The matching rules live in seed_marseille_place_subventions_rules.csv,
the matching in core_marseille_place_subventions, the selection (dominant
operator above threshold, capped residents) in mart_marseille_place_money —
this script only shapes the JSON consumed by scripts/poc/generate_marseille_places.py.

Output shape (unchanged from the former build_marseille_place_money.py):
  { slug: { operator: {beneficiaire, montant_total, nb_subventions, rows[{annee, montant}], annees[first,last]} | null,
            residents: [ {beneficiaire, montant_total, nb, preuve} ] } }

Usage:
    python pipeline/scripts/export/export_marseille_place_money.py
    python pipeline/scripts/export/export_marseille_place_money.py --marts-dataset dbt_paris_dev_local_marts --out /tmp/_money.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from google.cloud import bigquery

ROOT = Path(__file__).resolve().parents[3]
PROJECT_ID = "open-data-france-484717"
MARTS_DATASET = "dbt_paris_marts"
OUT = ROOT / "website" / "public" / "data" / "fr" / "marseille" / "places" / "_money.json"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--marts-dataset", default=MARTS_DATASET)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    client = bigquery.Client(project=PROJECT_ID)
    rows = [dict(r) for r in client.query(f"""
        SELECT place_slug, relation, beneficiaire, montant_total, nb_subventions,
               rows_par_annee, preuve, rang
        FROM `{PROJECT_ID}.{args.marts_dataset}.mart_marseille_place_money`
        ORDER BY place_slug, relation, rang
    """).result()]

    out: dict[str, dict] = {}
    for r in rows:
        entry = out.setdefault(r["place_slug"], {"operator": None, "residents": []})
        if r["relation"] == "operator":
            yr_rows = [{"annee": int(x["annee"]), "montant": float(x["montant"])}
                       for x in (r["rows_par_annee"] or [])]
            entry["operator"] = {
                "beneficiaire": r["beneficiaire"],
                "montant_total": round(float(r["montant_total"]), 2),
                "nb_subventions": int(r["nb_subventions"]),
                "rows": yr_rows,
                "annees": [yr_rows[0]["annee"], yr_rows[-1]["annee"]] if yr_rows else [],
            }
        else:
            preuve = " ".join((r.get("preuve") or "").split())
            if len(preuve) > 180:
                preuve = preuve[:180].rstrip() + "…"
            entry["residents"].append({
                "beneficiaire": r["beneficiaire"],
                "montant_total": float(r["montant_total"]),
                "nb": int(r["nb_subventions"]),
                "preuve": preuve,
            })
    for slug, e in out.items():
        print(f"  {slug}: operator={'✓' if e['operator'] else '—'} residents={len(e['residents'])}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print(f"wrote {len(out)} place-money records → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
