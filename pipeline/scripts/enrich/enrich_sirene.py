#!/usr/bin/env python3
"""
Enrich SIRENE — pour chaque SIRET unique présent dans nos datasets
marchés publics ET subventions (bénéficiaires avec SIRET), récupère les
infos INSEE :

- nom légal
- forme juridique
- adresse, commune, code postal
- code NAF / libellé activité principale
- tranche d'effectifs
- date de création
- état (actif / cessé)

API utilisée : recherche d'entreprises (`recherche-entreprises.api.gouv.fr`)
qui est gratuite, sans clé, rate-limited à 7 req/s.

Cache écrit dans `website/public/data/enrichment/sirene_companies.json`
— relu côté frontend par le loader `loadFournisseur`.

Usage :
    python pipeline/scripts/enrich/enrich_sirene.py
    python pipeline/scripts/enrich/enrich_sirene.py --limit 50 --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
MARCHES_DIR = PROJECT_ROOT / "website" / "public" / "data" / "marches-publics"
SUBVENTIONS_DIR = PROJECT_ROOT / "pipeline" / "cache" / "subventions_pre_enrichment"
CACHE_PATH = PROJECT_ROOT / "pipeline" / "cache" / "enrichment" / "sirene_companies.json"

# API publique (pas de clé), 7 req/s max
API_URL = "https://recherche-entreprises.api.gouv.fr/search"
REQUEST_DELAY = 0.15  # 150ms entre appels → ~6.7 req/s, marge rate-limit
MAX_RETRIES = 3


def collect_sirens() -> list[tuple[str, str]]:
    """Liste tous les (siren, nom) distincts dans les JSON marchés + subventions.

    Les SIRETs viennent soit de `fournisseur_siret` (marchés) soit de
    `siret` (bénéficiaires subventions). On conserve un seul SIREN unique
    par entité — la boucle garde le premier nom rencontré, pas grave
    puisque l'API renvoie le nom officiel INSEE qui remplacera le nôtre.
    """
    seen: dict[str, str] = {}

    # Source 1 : marchés publics
    for f in sorted(MARCHES_DIR.glob("marches_*.json")):
        try:
            with f.open(encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception:
            continue
        for row in data.get("data", []):
            siret = (row.get("fournisseur_siret") or "").strip()
            name = (row.get("fournisseur_nom") or "").strip()
            if not siret or siret in {"#", ""} or not siret.isdigit() or len(siret) < 9:
                continue
            siren = siret[:9]
            if siren not in seen:
                seen[siren] = name

    # Source 2 : bénéficiaires de subventions (top 500/année)
    if SUBVENTIONS_DIR.exists():
        for f in sorted(SUBVENTIONS_DIR.glob("beneficiaires_*.json")):
            try:
                with f.open(encoding="utf-8") as fh:
                    data = json.load(fh)
            except Exception:
                continue
            for row in data.get("data", []):
                siret = (row.get("siret") or "").strip()
                name = (row.get("beneficiaire") or "").strip()
                if not siret or not siret.isdigit() or len(siret) < 9:
                    continue
                siren = siret[:9]
                if siren not in seen:
                    seen[siren] = name

    return [(s, n) for s, n in seen.items()]


def fetch_sirene(siren: str) -> dict[str, Any] | None:
    """Requête recherche-entreprises.api.gouv.fr — retourne un dict normalisé."""
    params = {"q": siren, "per_page": 1}
    for attempt in range(MAX_RETRIES):
        try:
            r = requests.get(API_URL, params=params, timeout=20)
        except requests.RequestException as e:
            print(f"  ⚠ {siren}: {e}")
            time.sleep(1 + attempt)
            continue
        if r.status_code == 429:
            print("  ⚠ rate-limit, pause 5s")
            time.sleep(5)
            continue
        if r.status_code != 200:
            return None
        data = r.json()
        results = data.get("results", [])
        if not results:
            return None
        e = results[0]
        siege = e.get("siege", {}) or {}
        return {
            "siren": siren,
            "nom": e.get("nom_complete") or e.get("nom_raison_sociale") or "",
            "forme_juridique": e.get("nature_juridique") or "",
            "nombre_etablissements": e.get("nombre_etablissements"),
            "nombre_etablissements_ouverts": e.get("nombre_etablissements_ouverts"),
            "activite_principale": siege.get("activite_principale"),
            "libelle_activite": siege.get("libelle_activite_principale") or "",
            "commune": siege.get("libelle_commune") or "",
            "code_postal": siege.get("code_postal") or "",
            "adresse": siege.get("adresse") or "",
            "tranche_effectifs": e.get("tranche_effectif_salarie_description")
            or e.get("tranche_effectif_salarie")
            or "",
            "date_creation": e.get("date_creation") or "",
            "etat": e.get("etat_administratif") or "",
            "dirigeants": [
                {
                    "nom": d.get("nom", ""),
                    "prenom": d.get("prenom", ""),
                    "qualite": d.get("qualite", ""),
                }
                for d in (e.get("dirigeants") or [])[:3]
            ],
        }
    return None


def load_cache() -> dict[str, dict[str, Any]]:
    if not CACHE_PATH.exists():
        return {}
    with CACHE_PATH.open(encoding="utf-8") as f:
        data = json.load(f)
    return data.get("items", {}) if isinstance(data, dict) else {}


def save_cache(items: dict[str, dict[str, Any]]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    out = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "source": "recherche-entreprises.api.gouv.fr",
        "count": len(items),
        "items": items,
    }
    with CACHE_PATH.open("w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)


def main() -> int:
    parser = argparse.ArgumentParser(description="Enrichit les SIREN via recherche-entreprises.api.gouv.fr")
    parser.add_argument("--limit", type=int, help="Limite nombre de SIREN à traiter")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    cache = load_cache()
    print(f"📦 Cache : {len(cache)} entreprises")

    all_sirens = collect_sirens()
    pending = [(s, n) for s, n in all_sirens if s not in cache]
    print(f"📋 SIREN uniques : {len(all_sirens)} · à traiter : {len(pending)}")

    if args.limit:
        pending = pending[: args.limit]

    if not pending:
        print("✅ Cache à jour.")
        return 0

    processed = 0
    errors = 0
    total = len(pending)
    t_start = time.time()
    for siren, name in pending:
        if args.dry_run:
            cache[siren] = {"siren": siren, "nom": name, "dry_run": True}
        else:
            result = fetch_sirene(siren)
            if result:
                cache[siren] = result
            else:
                errors += 1
            time.sleep(REQUEST_DELAY)

        processed += 1
        if processed % 10 == 0 or processed == total:
            elapsed = time.time() - t_start
            rate = processed / elapsed if elapsed > 0 else 0
            eta = int((total - processed) / rate) if rate > 0 else 0
            pct = 100 * processed / total
            print(
                f"  [{processed:>4}/{total}] {pct:5.1f}%  ·  {rate:4.1f} req/s  ·  ETA {eta//60:02d}m{eta%60:02d}s  ·  {errors} erreurs",
                flush=True,
            )
        if processed % 50 == 0:
            save_cache(cache)

    save_cache(cache)
    print(f"💾 Cache : {len(cache)} entreprises ({errors} erreurs)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
