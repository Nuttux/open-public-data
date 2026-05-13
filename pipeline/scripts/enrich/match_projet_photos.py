#!/usr/bin/env python3
"""
Match projet photos — pipeline de PRODUCTION pour tous les projets d'investissement.

Pour chaque projet éligible (montant >= seuil), enchaîne :

  1. FETCH   : Gemini grounded search → pages web → og:image scraping
  2. JUDGE   : Gemini 3 Flash multimodal juge les candidats

Et produit un verdict par projet :

  {
    "decision": "photo_dediee" | "generique_typologique" | "pictogramme",
    "photo_url": str | null,        # présent si photo_dediee
    "source_page": str | null,
    "source_label": str | null,
    "credit": str | null,
    "score": int,
    "reason": str,
    "typologie": str | null         # pour le fallback générique côté front
  }

Seuils (par défaut, configurables) :
  - montant < 50 k€     → pictogramme direct (pas d'appel LLM)
  - score ≥ 7            → photo_dediee
  - 4 ≤ score < 7        → generique_typologique
  - score < 4            → pictogramme

Entrée  : website/public/data/map/investissements_complet_*.json
          website/public/data/enrichment/vulgarization_projets.json (typologie)
Sortie  : website/public/data/enrichment/projet_photos.json (cache idempotent)

Usage :
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/match_projet_photos.py
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/match_projet_photos.py --year 2024 --limit 20
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/match_projet_photos.py --min-montant 100000
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/match_projet_photos.py --dry-run
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import time
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = PROJECT_ROOT / "website" / "public" / "data" / "map"
ENRICH_DIR = PROJECT_ROOT / "pipeline" / "cache" / "enrichment"
ENRICH_DIR.mkdir(parents=True, exist_ok=True)

CACHE_PATH = ENRICH_DIR / "projet_photos.json"
VULG_PATH = ENRICH_DIR / "vulgarization_projets.json"

MIN_MONTANT_DEFAULT = 100_000.0

# Seuils de décision sur le score (0-10) retourné par le judge
SCORE_PHOTO_DEDIEE = 7
SCORE_GENERIQUE_MIN = 4


# ─── Import des modules fetch + judge ────────────────────────────────────────


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


fetch_mod = _load_module("_fetch", SCRIPT_DIR / "fetch_photos_grounded_llm.py")
judge_mod = _load_module("_judge", SCRIPT_DIR / "judge_photos_llm.py")


# ─── Load projets + vulgarization ────────────────────────────────────────────


def load_all_projets(years: list[int]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for y in years:
        f = DATA_DIR / f"investissements_complet_{y}.json"
        if not f.exists():
            continue
        with f.open(encoding="utf-8") as fh:
            data = json.load(fh).get("data", [])
        for r in data:
            r["_year"] = y
            out.append(r)
    return out


def load_vulg() -> dict[str, dict[str, Any]]:
    if not VULG_PATH.exists():
        return {}
    with VULG_PATH.open(encoding="utf-8") as fh:
        data = json.load(fh)
    return data.get("items") or {}


def load_cache() -> dict[str, Any]:
    if not CACHE_PATH.exists():
        return {"items": {}, "generated_at": None}
    with CACHE_PATH.open(encoding="utf-8") as fh:
        data = json.load(fh)
    if "items" not in data:
        data["items"] = {}
    return data


def save_cache(cache: dict[str, Any]) -> None:
    cache["generated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    with CACHE_PATH.open("w", encoding="utf-8") as fh:
        json.dump(cache, fh, ensure_ascii=False, indent=2)


# ─── Décision par projet ─────────────────────────────────────────────────────


def make_item_for_fetch(r: dict[str, Any]) -> dict[str, Any]:
    """Adapte une ligne projet au format attendu par fetch_photos_grounded_llm."""
    return {
        "id": r.get("id"),
        "nom": r.get("nom_projet") or "",
        "chapitre": r.get("chapitre_libelle") or "",
        "arrondissement": int(r.get("arrondissement") or 0),
        "montant_eur": float(r.get("montant") or 0),
    }


def make_item_for_judge(r: dict[str, Any], typologie: str | None, enriched_result: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": r.get("id"),
        "nom": r.get("nom_projet") or "",
        "tier": "prod",
        "typologie_guess": typologie or "équipement public paris",
        "arrondissement": int(r.get("arrondissement") or 0),
        "chapitre": r.get("chapitre_libelle") or "",
        "montant_eur": float(r.get("montant") or 0),
        "grounded_search": enriched_result,
    }


def pick_best_photo(candidates: list[dict[str, Any]], best_index: int | None) -> dict[str, Any] | None:
    if best_index is None or best_index < 0 or best_index >= len(candidates):
        return None
    return candidates[best_index]


def decide(score: int | None) -> str:
    if score is None:
        return "pictogramme"
    if score >= SCORE_PHOTO_DEDIEE:
        return "photo_dediee"
    if score >= SCORE_GENERIQUE_MIN:
        return "generique_typologique"
    return "pictogramme"


def process_projet(
    r: dict[str, Any],
    typologie: str | None,
    verbose: bool = False,
) -> dict[str, Any]:
    item_fetch = make_item_for_fetch(r)

    # Étape 1 : fetch grounded + og:image
    fetch_result = fetch_mod.process_item(item_fetch, validate=True, verbose=verbose)
    valid_photos = fetch_result.get("photos_valid") or []

    if not valid_photos:
        return {
            "decision": "pictogramme",
            "photo_url": None,
            "source_page": None,
            "source_label": None,
            "credit": None,
            "score": 0,
            "reason": "Aucune photo trouvée en ligne",
            "typologie": typologie,
        }

    # Étape 2 : judge sur les photos trouvées
    item_judge = make_item_for_judge(r, typologie, fetch_result)
    candidates = judge_mod.build_candidates(item_judge)
    if not candidates:
        return {
            "decision": "pictogramme",
            "photo_url": None,
            "source_page": None,
            "source_label": None,
            "credit": None,
            "score": 0,
            "reason": "Aucun candidat exploitable",
            "typologie": typologie,
        }

    # Download images as base64 for multimodal eval
    images: list[tuple[bytes, str]] = []
    usable_candidates: list[dict[str, Any]] = []
    for c in candidates:
        thumb_url = c.get("thumb") or c.get("url")
        data, info = judge_mod.fetch_image_base64(thumb_url)
        if data is None:
            continue
        images.append((data, info))
        usable_candidates.append(c)
        if len(usable_candidates) >= judge_mod.MAX_CANDIDATES:
            break

    if not images:
        return {
            "decision": "pictogramme",
            "photo_url": None,
            "source_page": None,
            "source_label": None,
            "credit": None,
            "score": 0,
            "reason": "Candidates non téléchargeables",
            "typologie": typologie,
        }

    ctx = judge_mod.build_context(item_judge, usable_candidates)
    try:
        verdict = judge_mod.call_gemini_multimodal(ctx, images)
    except Exception as e:
        return {
            "decision": "pictogramme",
            "photo_url": None,
            "source_page": None,
            "source_label": None,
            "credit": None,
            "score": 0,
            "reason": f"Judge error: {e}",
            "typologie": typologie,
        }

    score = verdict.get("score")
    best = pick_best_photo(usable_candidates, verdict.get("best_index"))
    decision = decide(score if isinstance(score, int) else None)

    # Si le judge dit photo_dediee/generique, il faut une best photo
    if decision in ("photo_dediee", "generique_typologique") and best is None:
        decision = "pictogramme"

    if decision == "pictogramme":
        return {
            "decision": "pictogramme",
            "photo_url": None,
            "source_page": None,
            "source_label": None,
            "credit": None,
            "score": score if isinstance(score, int) else 0,
            "reason": verdict.get("reason") or "Score trop bas",
            "typologie": typologie,
        }

    return {
        "decision": decision,
        "photo_url": best.get("url"),
        "source_page": best.get("source_page"),
        "source_label": best.get("source"),
        "credit": best.get("author") or best.get("license") or "",
        "score": score if isinstance(score, int) else 0,
        "reason": verdict.get("reason") or "",
        "typologie": typologie,
    }


# ─── Main ────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, help="Traite un seul exercice")
    parser.add_argument("--years", default="2018,2019,2020,2021,2022,2023,2024", help="Exercices (CSV)")
    parser.add_argument("--min-montant", type=float, default=MIN_MONTANT_DEFAULT)
    parser.add_argument("--limit", type=int, help="Limite le nombre de projets")
    parser.add_argument("--dry-run", action="store_true", help="N'appelle pas l'API, résume juste ce qui serait traité")
    parser.add_argument("--force", action="store_true", help="Ignorer le cache")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    if not fetch_mod.GEMINI_API_KEY and not args.dry_run:
        print("❌ GOOGLE_API_KEY / GEMINI_API_KEY non définie.", file=sys.stderr)
        return 1

    years = [args.year] if args.year else [int(y) for y in args.years.split(",")]
    projets = load_all_projets(years)
    vulg = load_vulg()

    # Pré-filtre
    eligible: list[tuple[dict[str, Any], str | None]] = []
    skipped_montant = 0
    skipped_no_name = 0
    auto_pictogramme: list[tuple[str, str | None]] = []

    for r in projets:
        pid = r.get("id")
        if not pid:
            continue
        nom = r.get("nom_projet") or ""
        if not nom.strip():
            skipped_no_name += 1
            continue
        montant = float(r.get("montant") or 0)
        typologie = (vulg.get(pid) or {}).get("typologie_normalisee")

        if montant < args.min_montant:
            skipped_montant += 1
            # décision directe sans appel LLM
            auto_pictogramme.append((pid, typologie))
            continue
        eligible.append((r, typologie))

    # Trie par montant décroissant quand --limit est set (pour viser les gros d'abord)
    if args.limit:
        eligible.sort(key=lambda t: float(t[0].get("montant") or 0), reverse=True)
        eligible = eligible[: args.limit]

    print(f"📊 Total projets scannés       : {len(projets)}")
    print(f"   Sans nom (skip)             : {skipped_no_name}")
    print(f"   Pictogramme auto (<{args.min_montant:.0f}€) : {skipped_montant}")
    print(f"   Éligibles pipeline LLM      : {len(eligible)}")

    cache = load_cache()
    cache_items: dict[str, Any] = cache["items"]

    # On écrit d'abord les pictogrammes auto (instantané, pas d'appel)
    for pid, typologie in auto_pictogramme:
        if not args.force and pid in cache_items:
            continue
        cache_items[pid] = {
            "decision": "pictogramme",
            "photo_url": None,
            "source_page": None,
            "source_label": None,
            "credit": None,
            "score": 0,
            "reason": "montant < seuil",
            "typologie": typologie,
        }

    if args.dry_run:
        save_cache(cache)
        print("   (dry-run : pictogrammes auto écrits, rien de plus)")
        return 0

    # Filtre les projets déjà en cache (sauf --force).
    # IMPORTANT : on préserve TOUJOURS les entrées avec `manual_override: True`
    # — même sous --force — pour ne pas écraser les photos corrigées à la main.
    def _is_manual(pid: str) -> bool:
        return bool(cache_items.get(pid, {}).get("manual_override"))

    todo = [
        (r, typo) for (r, typo) in eligible
        if not _is_manual(r.get("id", ""))
        and (args.force or r.get("id") not in cache_items)
    ]
    n_manual = sum(1 for (r, _) in eligible if _is_manual(r.get("id", "")))
    print(f"   Déjà en cache               : {len(eligible) - len(todo) - n_manual}")
    print(f"   Overrides manuels préservés : {n_manual}")
    print(f"   À traiter maintenant        : {len(todo)}")

    if not todo:
        save_cache(cache)
        return 0

    t0 = time.time()
    n_dediee = n_generique = n_picto = n_error = 0
    for i, (r, typologie) in enumerate(todo, 1):
        pid = r["id"]
        nom = (r.get("nom_projet") or "")[:70]
        tier = "?"
        m = float(r.get("montant") or 0)
        if m >= 10e6: tier = "XL"
        elif m >= 1e6: tier = "L"
        elif m >= 100e3: tier = "M"
        else: tier = "S"
        print(f"[{i}/{len(todo)}] {tier} · {nom}")
        try:
            verdict = process_projet(r, typologie, verbose=args.verbose)
        except Exception as e:
            print(f"  ❌ {e}")
            verdict = {
                "decision": "pictogramme",
                "photo_url": None,
                "source_page": None,
                "source_label": None,
                "credit": None,
                "score": 0,
                "reason": f"pipeline error: {e}",
                "typologie": typologie,
            }
            n_error += 1
        cache_items[pid] = verdict
        d = verdict["decision"]
        if d == "photo_dediee":
            n_dediee += 1
        elif d == "generique_typologique":
            n_generique += 1
        else:
            n_picto += 1
        print(f"  → {d} · score {verdict.get('score', 0)}/10")

        # Sauvegarde après chaque projet (idempotence en cas d'interruption)
        if i % 5 == 0 or i == len(todo):
            save_cache(cache)

    save_cache(cache)
    elapsed = time.time() - t0
    print(f"\n✅ {CACHE_PATH.relative_to(PROJECT_ROOT)}")
    print(f"⏱  {elapsed:.0f}s")
    print(f"📸 photo_dediee : {n_dediee}  ·  generique : {n_generique}  ·  pictogramme : {n_picto}  ·  errors : {n_error}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
