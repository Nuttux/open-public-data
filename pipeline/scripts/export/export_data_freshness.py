#!/usr/bin/env python3
"""
Export data_freshness.json — la fraîcheur de chaque source, en clair.

Pour chaque source Paris du catalogue Opendatasoft :
  - published_by_city_at : quand la Ville a publié / mis à jour le jeu de
    données sur opendata.paris.fr (`modified` du portail, via
    core_paris_source_catalog.rows_updated_at) ;
  - synced_at            : quand notre pipeline l'a relu (`_synced_at`) ;
  - years                : années complètes publiées, années partielles
    écartées (mart_source_year_status — même règle que les exports) ;
  - records_count, page du dataset, licence.

Et une date globale `updated_on_qipu_at` : l'instant de cet export, c'est-à-
dire du refresh qui a produit les JSON du site. Deux dates, deux acteurs :
« publié par la Ville le … · mis à jour sur Qipu le … » — jamais « repris »,
qui se lirait comme « corrigé ».

Consommé par : /methode (section Fraîcheur), le dialogue Provenance de chaque
page, le JSON-LD schema.org Dataset (dateModified, temporalCoverage).

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

# core_paris_source_catalog vit dans le dataset analytics (couche core).
CORE_DATASET = "dbt_paris_analytics"

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


def fetch_catalog(client) -> list[dict]:
    sql = f"""
    SELECT source_id, dataset_id, dataset_title, dataset_page_url, publisher,
           license_title, license_url, rows_updated_at, data_processed_at, records_count
    FROM `{PROJECT_ID}.{CORE_DATASET}.core_paris_source_catalog`
    ORDER BY source_id
    """
    return [dict(r) for r in client.query(sql).result()]


def fetch_synced_at(client) -> dict[str, datetime]:
    sql = f"""
    SELECT source_id, MAX(_synced_at) AS synced_at
    FROM `{PROJECT_ID}.dbt_paris_staging.stg_paris_catalog`
    GROUP BY source_id
    """
    return {r.source_id: r.synced_at for r in client.query(sql).result()}


def fetch_year_status(client, dataset: str) -> dict[str, list[dict]]:
    sql = f"""
    SELECT source_id, annee, n_rows, status, ratio_vs_prev3
    FROM `{PROJECT_ID}.{dataset}.mart_source_year_status`
    ORDER BY source_id, annee
    """
    out: dict[str, list[dict]] = {}
    for r in client.query(sql).result():
        out.setdefault(r.source_id, []).append({
            "annee": int(r.annee),
            "n_rows": int(r.n_rows),
            "status": r.status,
            "ratio": round(float(r.ratio_vs_prev3), 3) if r.ratio_vs_prev3 is not None else None,
        })
    return out


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
    catalog = fetch_catalog(client)
    synced = fetch_synced_at(client)
    years = fetch_year_status(client, marts_dataset(args.city))
    now = datetime.now(timezone.utc)

    # Ordre éditorial = ordre des sections du site, pas l'alphabet des ids.
    order = ["budget_principal", "budget_vote", "subventions", "associations",
             "marches_publics", "logements_sociaux", "dette_garantie", "ap_projets"]
    catalog.sort(key=lambda r: (order.index(r["source_id"]) if r["source_id"] in order else 99, r["source_id"]))

    sources = []
    for row in catalog:
        sid = row["source_id"]
        ys = years.get(sid, [])
        complete = [y["annee"] for y in ys if y["status"] in ("complete", "no_baseline")]
        partial = [y for y in ys if y["status"] == "partial"]
        label_fr, label_en = SOURCE_LABELS.get(sid, (row["dataset_title"], row["dataset_title"]))
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
            "published_by_city_at": _date(row["rows_updated_at"]),
            "synced_at": _date(synced.get(sid)),
            "years": {
                "min": min(complete) if complete else None,
                "max": max(complete) if complete else None,
                "complete": complete,
                "partial": [{"annee": p["annee"], "n_rows": p["n_rows"], "ratio": p["ratio"]} for p in partial],
            } if ys else None,
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
