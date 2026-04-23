#!/usr/bin/env python3
"""
Télécharge les fichiers annuels DECP (Données Essentielles de la Commande Publique)
depuis data.gouv.fr, filtre les marchés Ville de Paris (SIRET 21750001600019),
aplatit les champs imbriqués et charge dans BigQuery.

Pourquoi ce script plutôt que sync_national.py existant :
    - La DECP nationale contient ~10 champs utiles absents de la source Paris
      opendata (lieuExecution, ccag, codeCPV, offresRecues, sousTraitanceDeclaree,
      considerationsSociales/Environnementales, procedure, montant notifié).
    - La jointure avec la table Paris se fait par `num_marche[4:] = decp.id`
      (ex: `20242024T05699` ↔ `2024T05699`).
    - ~60% des marchés Ville (2024) sont présents dans DECP, avec ~30% en plus
      qui ne sont QUE dans DECP → upsert dans core_marches_publics permet
      d'augmenter la couverture globale.

Usage:
    # Toutes les années disponibles (2019, 2022, 2024, 2025, 2026)
    python fetch_decp_paris.py

    # Années spécifiques
    python fetch_decp_paris.py --year 2024 --year 2025

    # Dry run (filtre + schéma, pas d'upload)
    python fetch_decp_paris.py --dry-run

Output:
    BigQuery : raw.decp_marches_paris
    Cache    : pipeline/cache/decp/decp_AAAA_paris.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "pipeline" / "cache" / "decp"
CACHE.mkdir(parents=True, exist_ok=True)

# Reuse helpers from sibling sync script.
sys.path.insert(0, str(Path(__file__).parent))
from sync_opendata import upload_to_bigquery  # noqa: E402

PROJECT_ID = "open-data-france-484717"
DATASET_ID = "raw"
TABLE_NAME = "decp_marches_paris"

# Paris Ville de Paris SIRET (mairie principale). Département = 21750005700035
# mais quasi-zéro marchés distincts. On garde ouvert sur le préfixe 217500.
PARIS_SIRET_PREFIX = "217500"

DATAGOUV_DATASET = "5cd57bf68b4c4179299eb0e9"
DATAGOUV_API = f"https://www.data.gouv.fr/api/1/datasets/{DATAGOUV_DATASET}/"


def list_annual_resources() -> dict[int, dict]:
    """Discover per-year consolidated JSON resources on data.gouv."""
    r = requests.get(DATAGOUV_API, timeout=30)
    r.raise_for_status()
    out: dict[int, dict] = {}
    for res in r.json().get("resources", []):
        title = res.get("title", "")
        # Match titles like "decp-2024.json" (no month suffix)
        if title.startswith("decp-20") and title.endswith(".json"):
            stem = title[len("decp-"):-len(".json")]
            # Skip monthly files like "decp-2024-05"
            if "-" in stem:
                continue
            try:
                year = int(stem)
            except ValueError:
                continue
            out[year] = res
    return out


def download_annual(year: int, resource: dict) -> Path:
    path = CACHE / f"decp_{year}_raw.json"
    if path.exists() and path.stat().st_size > 1_000_000:
        print(f"  ↺ cache hit: {path.name} ({path.stat().st_size / 1e6:.0f} MB)")
        return path
    url = resource["url"]
    size_mb = (resource.get("filesize") or 0) / 1e6
    print(f"  ↓ downloading {url} ({size_mb:.0f} MB)...")
    with requests.get(url, stream=True, timeout=600) as r:
        r.raise_for_status()
        with open(path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 256):
                f.write(chunk)
    print(f"    saved {path.stat().st_size / 1e6:.0f} MB")
    return path


def filter_paris(raw_path: Path, year: int) -> list[dict]:
    """Load annual file, filter Paris buyer. Cached per-year."""
    out_path = CACHE / f"decp_{year}_paris.json"
    if out_path.exists() and out_path.stat().st_size > 0:
        return json.loads(out_path.read_text())
    print(f"  parsing {raw_path.name}...")
    d = json.loads(raw_path.read_text())
    marches = d.get("marches", {})
    if isinstance(marches, dict):
        items = marches.get("marche", [])
    else:
        items = marches
    paris = [
        m for m in items
        if str(m.get("acheteur", {}).get("id", "")).startswith(PARIS_SIRET_PREFIX)
    ]
    out_path.write_text(json.dumps(paris, ensure_ascii=False))
    print(f"    {len(items):,} marchés total → {len(paris):,} Paris")
    return paris


def _as_int(v: Any) -> int | None:
    """DECP numeric fields sometimes contain 'NC' (Not Communicated) strings."""
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


def _as_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def flatten_record(m: dict, source_year: int) -> dict:
    """Flatten a DECP marché record for BQ loading.

    Rules:
    - Scalar fields kept as-is.
    - Nested dicts flattened to snake_case (`lieuExecution.code` → `lieu_execution_code`).
    - `titulaires` (list) → first titulaire SIRET + nom + all SIRETs joined.
    - `considerations*` (dict with list) → pipe-joined string; `has_*` bool flag.
    - `modifications` (list of avenants) → count + total modified montant.
    """
    acheteur = m.get("acheteur") or {}
    lieu = m.get("lieuExecution") or {}
    considerations_soc = m.get("considerationsSociales") or {}
    considerations_env = m.get("considerationsEnvironnementales") or {}
    modalites = m.get("modalitesExecution") or {}
    techniques = m.get("techniques") or {}
    types_prix = m.get("typesPrix") or {}

    titulaires_raw = m.get("titulaires") or []
    # In the JSON format each element is {"titulaire": {...}} OR {...} directly.
    t_items = []
    for t in titulaires_raw:
        if isinstance(t, dict):
            t_items.append(t.get("titulaire") or t)
    t_sirets = [str(t.get("id")) for t in t_items if t.get("id")]
    t_nom_first = next((str(t.get("denominationSociale") or "") for t in t_items if t.get("denominationSociale")), None)

    modifications = m.get("modifications") or []
    nb_mods = len(modifications) if isinstance(modifications, list) else 0

    def join_inner(container: Any) -> str | None:
        if not isinstance(container, dict):
            return None
        inner = next(iter(container.values()), None)
        if isinstance(inner, list):
            return "|".join(str(x) for x in inner)
        return None

    considerations_soc_str = join_inner(considerations_soc)
    considerations_env_str = join_inner(considerations_env)

    return {
        "source_year": source_year,
        "id": m.get("id"),
        "uid": m.get("uid"),
        "nature": m.get("nature"),
        "objet": m.get("objet"),
        "procedure": m.get("procedure"),
        "code_cpv": m.get("codeCPV"),
        "montant": _as_float(m.get("montant")),
        "forme_prix": m.get("formePrix"),
        "date_notification": m.get("dateNotification"),
        "date_publication_donnees": m.get("datePublicationDonnees"),
        "duree_mois": _as_int(m.get("dureeMois")),
        "ccag": m.get("ccag"),
        "offres_recues": _as_int(m.get("offresRecues")),
        "type_groupement_operateurs": m.get("typeGroupementOperateurs"),
        "marche_innovant": m.get("marcheInnovant"),
        "sous_traitance_declaree": m.get("sousTraitanceDeclaree"),
        "origine_ue": _as_float(m.get("origineUE")),
        "origine_france": _as_float(m.get("origineFrance")),
        "taux_avance": _as_float(m.get("tauxAvance")),
        "attribution_avance": m.get("attributionAvance"),
        "source": m.get("source"),
        # Acheteur
        "acheteur_id": acheteur.get("id"),
        "acheteur_nom": acheteur.get("nom"),
        # Lieu d'exécution
        "lieu_execution_code": lieu.get("code"),
        "lieu_execution_type_code": lieu.get("typeCode"),
        "lieu_execution_nom": lieu.get("nom"),
        # Titulaires (premier + liste)
        "titulaire_siret": t_sirets[0] if t_sirets else None,
        "titulaire_nom": t_nom_first,
        "titulaires_sirets": "|".join(t_sirets) if t_sirets else None,
        "titulaires_count": len(t_sirets) if t_sirets else 0,
        # Considerations & modalités (joined strings)
        "considerations_sociales": considerations_soc_str,
        "considerations_environnementales": considerations_env_str,
        "modalites_execution": join_inner(modalites),
        "techniques": join_inner(techniques),
        "types_prix": join_inner(types_prix),
        "has_consideration_sociale": bool(
            considerations_soc_str
            and "pas de consideration" not in considerations_soc_str.lower().replace("é", "e")
            and "sans objet" not in considerations_soc_str.lower()
        ),
        "has_consideration_environnementale": bool(
            considerations_env_str
            and "pas de consideration" not in considerations_env_str.lower().replace("é", "e")
            and "sans objet" not in considerations_env_str.lower()
        ),
        # Avenants / modifications
        "nb_modifications": nb_mods,
    }


def run(years: list[int] | None, dry_run: bool = False) -> None:
    print(f"{'='*60}")
    print(f"  DECP PARIS — ingestion depuis data.gouv")
    print(f"{'='*60}")
    resources = list_annual_resources()
    available = sorted(resources.keys())
    print(f"\n  Années disponibles sur data.gouv: {available}")

    target_years = years or available
    missing = [y for y in target_years if y not in resources]
    if missing:
        print(f"  ⚠️ manquantes: {missing} — ignorées")
    target_years = [y for y in target_years if y in resources]

    all_flat: list[dict] = []
    for y in target_years:
        print(f"\n─── {y} ───")
        raw = download_annual(y, resources[y])
        paris = filter_paris(raw, y)
        flat = [flatten_record(m, y) for m in paris]
        all_flat.extend(flat)
        print(f"  {len(flat):,} lignes flattened")

    if not all_flat:
        print("\n  Aucune ligne à charger.")
        return

    df = pd.DataFrame(all_flat)
    print(f"\n{'='*60}")
    print(f"  Total: {len(df):,} marchés Paris sur {len(target_years)} années")
    print(f"  Colonnes: {len(df.columns)}")
    print(f"{'='*60}")
    print(df[["source_year", "id", "objet"]].head(3).to_string(index=False))

    if dry_run:
        print("\n  DRY RUN — pas d'upload BQ.")
        out = CACHE / "decp_paris_all_flat.json"
        df.to_json(out, orient="records", force_ascii=False)
        print(f"  → dump local: {out.relative_to(ROOT)}")
        return

    print("\n  Upload BQ...")
    rows = upload_to_bigquery(
        df, TABLE_NAME, project_id=PROJECT_ID, dataset_id=DATASET_ID,
    )
    print(f"\n  ✓ {rows:,} lignes chargées → {PROJECT_ID}:{DATASET_ID}.{TABLE_NAME}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, action="append", help="Year(s) to sync. Default: all.")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    run(years=args.year, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
