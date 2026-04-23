#!/usr/bin/env python3
"""
Applique le cache SIRENE aux JSON marchés :
remplit `fournisseur_nom` quand il est vide/null ET que `fournisseur_siret`
(14 chiffres) est présent ET que le SIREN est dans sirene_companies.json.

Ne touche JAMAIS :
- un `fournisseur_nom` déjà renseigné
- les autres champs (montants, dates, SIRET, objet)

Optionnellement : appelle l'API publique `recherche-entreprises.api.gouv.fr`
pour résoudre les SIRENs manquants (rate-limit 0.2s, retry exponentiel).

Fichiers patchés :
- website/public/data/marches-publics/marches_*.json
- website/public/data/map/projet_marches.json

Usage :
    python apply_sirene_to_marches.py                  # cache only
    python apply_sirene_to_marches.py --fetch-missing  # + API pour les manquants
    python apply_sirene_to_marches.py --dry-run
"""
from __future__ import annotations

import argparse
import glob
import json
import re
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[3]
DATA_MARCHES = ROOT / "website" / "public" / "data" / "marches-publics"
DATA_MAP = ROOT / "website" / "public" / "data" / "map"
SIRENE_CACHE = ROOT / "website" / "public" / "data" / "enrichment" / "sirene_companies.json"

API_URL = "https://recherche-entreprises.api.gouv.fr/search"
USER_AGENT = "FranceOpenData/0.1 (+contact@franceopendata.org)"
SIREN_RE = re.compile(r"^\d{9}$")


def load_cache() -> tuple[dict, dict]:
    raw = json.loads(SIRENE_CACHE.read_text(encoding="utf-8"))
    items = raw.get("items", {}) or {}
    return raw, items


def save_cache(raw: dict) -> None:
    SIRENE_CACHE.write_text(
        json.dumps(raw, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def fetch_siren(siren: str, session: requests.Session) -> dict | None:
    """Return a cache-shaped dict or None."""
    for attempt, backoff in enumerate([0, 2, 5, 15]):
        if backoff:
            time.sleep(backoff)
        try:
            r = session.get(API_URL, params={"q": siren, "page": 1, "per_page": 1}, timeout=15)
            if r.status_code in (429, 500, 502, 503, 504):
                continue
            r.raise_for_status()
            data = r.json()
            results = data.get("results") or []
            if not results:
                return None
            it = results[0]
            nom = (it.get("nom_raison_sociale") or it.get("nom_complet") or "").strip()
            if not nom:
                return None
            adr = it.get("siege") or {}
            return {
                "siren": siren,
                "nom": nom,
                "forme_juridique": adr.get("forme_juridique") or "",
                "nombre_etablissements": it.get("nombre_etablissements") or 0,
                "nombre_etablissements_ouverts": it.get("nombre_etablissements_ouverts") or 0,
                "activite_principale": it.get("activite_principale") or "",
                "libelle_activite": it.get("libelle_activite_principale") or "",
                "commune": (adr.get("libelle_commune") or "").upper(),
                "code_postal": adr.get("code_postal") or "",
                "adresse": adr.get("adresse") or "",
                "tranche_effectifs": it.get("tranche_effectif_salarie") or "",
                "date_creation": it.get("date_creation") or "",
                "etat": it.get("etat_administratif") or "A",
            }
        except Exception as e:
            if attempt == 3:
                print(f"    ⚠️ fetch failed for {siren}: {e}", file=sys.stderr)
                return None
    return None


def patch_row(row: dict, cache_items: dict) -> str | None:
    """Return the name it was patched with, or None if no patch."""
    nom = (row.get("fournisseur_nom") or "").strip()
    if nom:
        return None
    siret = (row.get("fournisseur_siret") or "").strip()
    if len(siret) != 14 or not siret.isdigit():
        return None
    siren = siret[:9]
    entry = cache_items.get(siren)
    if not entry:
        return None
    name = (entry.get("nom") or "").strip()
    if not name:
        return None
    row["fournisseur_nom"] = name
    return name


def process_marches_files(cache_items: dict, dry_run: bool) -> tuple[int, list[str]]:
    """Patch website/public/data/marches-publics/marches_*.json."""
    total_patched = 0
    files_touched: list[str] = []
    for path in sorted(glob.glob(str(DATA_MARCHES / "marches_*.json"))):
        d = json.loads(Path(path).read_text(encoding="utf-8"))
        n_before = 0
        for row in d.get("data", []):
            name = patch_row(row, cache_items)
            if name:
                n_before += 1
        if n_before:
            if not dry_run:
                Path(path).write_text(
                    json.dumps(d, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
            files_touched.append(f"{Path(path).name}: {n_before}")
            total_patched += n_before
    return total_patched, files_touched


def process_projet_marches(cache_items: dict, dry_run: bool) -> int:
    """Patch projet_marches.json (nested structure)."""
    path = DATA_MAP / "projet_marches.json"
    d = json.loads(path.read_text(encoding="utf-8"))
    total = 0
    for pid, matches in (d.get("projets") or {}).items():
        for m in matches:
            if patch_row(m, cache_items):
                total += 1
    if total and not dry_run:
        path.write_text(
            # Same compact format as export script (no indent to keep file <5MB)
            json.dumps(d, ensure_ascii=False),
            encoding="utf-8",
        )
    return total


def collect_missing_sirens() -> set[str]:
    """Scan les JSONs à patcher, récupère les SIRENs pas encore dans le cache."""
    raw, cache_items = load_cache()
    missing: set[str] = set()
    for path in glob.glob(str(DATA_MARCHES / "marches_*.json")):
        d = json.loads(Path(path).read_text(encoding="utf-8"))
        for row in d.get("data", []):
            if (row.get("fournisseur_nom") or "").strip():
                continue
            siret = (row.get("fournisseur_siret") or "").strip()
            if len(siret) != 14 or not siret.isdigit():
                continue
            siren = siret[:9]
            if siren not in cache_items:
                missing.add(siren)
    d = json.loads((DATA_MAP / "projet_marches.json").read_text(encoding="utf-8"))
    for matches in (d.get("projets") or {}).values():
        for m in matches:
            if (m.get("fournisseur_nom") or "").strip():
                continue
            siret = (m.get("fournisseur_siret") or "").strip()
            if len(siret) == 14 and siret.isdigit() and siret[:9] not in cache_items:
                missing.add(siret[:9])
    return missing


def fetch_missing_to_cache(sirens: list[str]) -> int:
    """Fetch les SIRENs manquants via l'API publique et sauve le cache."""
    raw, cache_items = load_cache()
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    fetched = 0
    failed = 0
    total = len(sirens)
    print(f"Fetching {total} SIRENs from recherche-entreprises.api.gouv.fr …")
    for i, siren in enumerate(sorted(sirens), 1):
        if not SIREN_RE.match(siren):
            continue
        entry = fetch_siren(siren, session)
        if entry:
            cache_items[siren] = entry
            fetched += 1
            if fetched % 25 == 0:
                # Save incrementally
                raw["items"] = cache_items
                raw["count"] = len(cache_items)
                save_cache(raw)
        else:
            failed += 1
        if i % 20 == 0 or i == total:
            print(f"  [{i:4d}/{total}] fetched={fetched} failed={failed}")
        time.sleep(0.2)
    raw["items"] = cache_items
    raw["count"] = len(cache_items)
    save_cache(raw)
    return fetched


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fetch-missing", action="store_true",
                    help="Fetch les SIRENs manquants via l'API publique avant de patcher")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.fetch_missing:
        missing = collect_missing_sirens()
        print(f"Missing from cache: {len(missing)} SIRENs")
        if missing and not args.dry_run:
            fetched = fetch_missing_to_cache(list(missing))
            print(f"  → cache updated with {fetched} new entries")
        elif args.dry_run:
            print(f"  (dry-run, skipping API fetch)")

    _, cache_items = load_cache()
    print(f"\nSIRENE cache loaded: {len(cache_items)} entries")

    print("Patching marches_*.json …")
    total_m, files = process_marches_files(cache_items, args.dry_run)
    for f in files:
        print(f"  {f}")
    print(f"  TOTAL rows patched: {total_m}")

    print("Patching projet_marches.json …")
    total_pm = process_projet_marches(cache_items, args.dry_run)
    print(f"  rows patched: {total_pm}")

    print(f"\n{'DRY-RUN' if args.dry_run else 'DONE'}: "
          f"{total_m + total_pm} rows total enriched")


if __name__ == "__main__":
    main()
