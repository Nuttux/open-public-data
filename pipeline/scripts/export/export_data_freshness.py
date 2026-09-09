#!/usr/bin/env python3
"""
Export data_freshness.json — la fraîcheur de chaque source, en clair.

Lit UN mart, mart_source_freshness (layering E4 : un export ne lit que des
marts), qui réunit pour chaque source Paris du catalogue Opendatasoft :
  - published_by_city_at : quand la Ville a publié / mis à jour le jeu de
    données sur opendata.paris.fr (`modified` du portail) ;
  - synced_at            : quand notre pipeline l'a relu ;
  - years                : années complètes publiées, années partielles
    écartées (mart_source_year_status — même règle que les exports) ;
  - records_count, page du dataset, licence.

Et une date globale `updated_on_qipu_at` : l'instant de cet export, c'est-à-
dire du refresh qui a produit les JSON du site. Deux dates, deux acteurs :
« publié par la Ville le … · mis à jour sur Qipu le … » — jamais « repris »,
qui se lirait comme « corrigé ».

Consommé par : /methode (section Fraîcheur), le dialogue Provenance, les
légendes ChartSource, le JSON-LD schema.org Dataset (dateModified).

Usage:
    python pipeline/scripts/export/export_data_freshness.py [--city paris]
Output:
    website/public/data/data_freshness.json
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _export_common import PROJECT_ID, data_dir, get_bigquery_client, marts_dataset, write_json

# Libellés grand public par source. Éditorial, pas de la donnée : il vit dans
# l'export (comme DATASET_META de data_availability).
SOURCE_LABELS = {
    "budget_principal": ("Budget exécuté (compte administratif)", "Executed budget (administrative account)"),
    "budget_vote":      ("Budget voté (budget primitif)", "Voted budget"),
    "ap_projets":       ("Investissements — autorisations de programme", "Investments — programme authorisations"),
    "subventions":      ("Subventions versées (annexe du compte administratif)", "Grants paid (administrative-account annex)"),
    "associations":     ("Subventions aux associations votées", "Grants to associations, as voted"),
    "logements_sociaux": ("Logements sociaux financés", "Funded social housing"),
    "marches_publics":  ("Marchés publics de la collectivité", "City public contracts"),
    "dette_garantie":   ("Dette garantie (emprunts garantis)", "Guaranteed debt (guaranteed loans)"),
}

# Ce que chaque source alimente sur le site (chemins), pour que la ligne
# « mis à jour le » d'une page retrouve sa source.
SOURCE_PAGES = {
    "budget_principal": ["/budget", "/dette-patrimoine"],
    "budget_vote":      ["/budget"],
    "ap_projets":       ["/investissements"],
    "subventions":      ["/qui-recoit"],
    "associations":     ["/qui-recoit"],
    "logements_sociaux": ["/logement-social", "/investissements"],
    "marches_publics":  ["/marches-publics"],
    "dette_garantie":   ["/dette-patrimoine", "/logement-social"],
}

# Ordre éditorial = ordre des sections du site, pas l'alphabet des ids.
ORDER = ["budget_principal", "budget_vote", "subventions", "associations",
         "marches_publics", "logements_sociaux", "dette_garantie", "ap_projets"]


def fetch(client, dataset: str) -> list[dict]:
    sql = f"""
    SELECT source_id, dataset_id, dataset_title, dataset_page_url, publisher,
           license_title, license_url, records_count, published_by_city_at, synced_at,
           year_min, year_max, complete_years, partial_years, has_year_status
    FROM `{PROJECT_ID}.{dataset}.mart_source_freshness`
    """
    return [dict(r) for r in client.query(sql).result()]


def _date(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    return str(v)[:10]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", default="paris")
    args = ap.parse_args()
    if args.city != "paris":
        print(f"  ⊘ data_freshness : pas de catalogue ODS pour {args.city}, rien à exporter.")
        return 0

    client = get_bigquery_client()
    rows = fetch(client, marts_dataset(args.city))
    rows.sort(key=lambda r: (ORDER.index(r["source_id"]) if r["source_id"] in ORDER else 99, r["source_id"]))
    now = datetime.now(timezone.utc)

    sources = []
    for row in rows:
        sid = row["source_id"]
        label_fr, label_en = SOURCE_LABELS.get(sid, (row["dataset_title"], row["dataset_title"]))
        partial = [
            {"annee": int(p["annee"]), "n_rows": int(p["n_rows"]),
             "ratio": round(float(p["ratio"]), 3) if p.get("ratio") is not None else None}
            for p in (row["partial_years"] or [])
        ]
        sources.append({
            "source_id": sid,
            "label_fr": label_fr,
            "label_en": label_en,
            "dataset_title": row["dataset_title"],
            "dataset_page_url": row["dataset_page_url"],
            "publisher": row["publisher"],
            "license_title": row["license_title"],
            "license_url": row["license_url"],
            "records_count": int(row["records_count"]) if row["records_count"] is not None else None,
            "published_by_city_at": _date(row["published_by_city_at"]),
            "synced_at": _date(row["synced_at"]),
            "years": {
                "min": int(row["year_min"]) if row["year_min"] is not None else None,
                "max": int(row["year_max"]) if row["year_max"] is not None else None,
                "complete": [int(y) for y in (row["complete_years"] or [])],
                "partial": partial,
            } if row["has_year_status"] else None,
            "pages": SOURCE_PAGES.get(sid, []),
        })

    payload = {
        "generated_at": now.isoformat(),
        "updated_on_qipu_at": now.date().isoformat(),
        "description": "Fraîcheur de chaque source : publié par la Ville le (portail), mis à jour sur Qipu le (ce refresh), années complètes / partielles.",
        "sources": sources,
    }
    out = data_dir(args.city) / "data_freshness.json"
    write_json(out, payload)
    print(f"✅ {out.relative_to(out.parents[3])} — {len(sources)} sources")
    for s in sources:
        yr = s["years"]
        span = f"{yr['min']}–{yr['max']}" if yr and yr["min"] else "—"
        part = f" · partielle : {', '.join(str(p['annee']) for p in yr['partial'])}" if yr and yr["partial"] else ""
        print(f"  {s['source_id']:18} Ville {s['published_by_city_at']} · sync {s['synced_at']} · {span}{part}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
