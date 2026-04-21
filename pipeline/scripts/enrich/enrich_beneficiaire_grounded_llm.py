#!/usr/bin/env python3
"""
Enrich bénéficiaires de subventions via cascade SIRENE → Gemini grounded search.

Pour chaque bénéficiaire unique (clé : beneficiaire_normalise), on tente :

  1. SIRENE-first — si on a un SIRET et que le code APE/NAF du siège est
     spécifique (pas 9499Z / 9412Z / vide), on reprend directement le
     libellé d'activité INSEE. Confiance 0.9, pas d'appel LLM.

  2. Grounded search — sinon, on appelle Gemini 3 Flash avec l'outil
     `google_search` activé. Le prompt contraint la recherche aux
     domaines .fr / wikipedia / journal-officiel. Les citations
     (groundingChunks) servent de preuves ; on refuse d'inventer.

  3. Fallback — si rien de crédible, on marque fallback_none et on
     laisse activite_verifiee à null (le frontend ignorera).

Entrée : website/public/data/subventions/beneficiaires_*.json
Cache  : website/public/data/enrichment/beneficiaire_grounded.json

Usage :
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/enrich_beneficiaire_grounded_llm.py
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/enrich_beneficiaire_grounded_llm.py --limit 50 --verbose
    python pipeline/scripts/enrich/enrich_beneficiaire_grounded_llm.py --dry-run --year 2023
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
SUBVENTIONS_DIR = PROJECT_ROOT / "website" / "public" / "data" / "subventions"
SIRENE_CACHE = PROJECT_ROOT / "website" / "public" / "data" / "enrichment" / "sirene_companies.json"
CACHE_PATH = PROJECT_ROOT / "website" / "public" / "data" / "enrichment" / "beneficiaire_grounded.json"

GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY", "") or os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

REQ_TIMEOUT = 90
MAX_RETRIES = 3
RETRY_WAIT_429 = 30
CALL_DELAY = 0.3  # courtesy entre appels Gemini

# Codes APE génériques à rejeter (on les remplacera par grounded search)
GENERIC_APE_CODES = {"9499Z", "9412Z", "9499", "9412", ""}

SAVE_EVERY = 50


SYSTEM_PROMPT = """Tu es un documentaliste pour un site journalistique sur les finances publiques françaises.

Pour un bénéficiaire de subvention publique donné (association, fondation, entreprise, opérateur), tu dois identifier son activité réelle avec des sources vérifiables.

PROCÉDURE :
1. Utilise activement l'outil Google Search.
2. Cherche UNIQUEMENT sur ces domaines crédibles :
   - site:*.fr (sites officiels, associatifs, institutionnels)
   - site:wikipedia.org (articles encyclopédiques)
   - site:journal-officiel.gouv.fr (annonces d'associations, statuts)
3. Ne JAMAIS inventer. Si rien de crédible, retourne "activite_verifiee": null.
4. Pas de ton marketing. Neutre, factuel, 1 phrase courte.

CHAMPS ATTENDUS :
- activite_verifiee : 1 phrase neutre (max 160 caractères) décrivant l'activité réelle, ou null.
- perimetre_geographique : "Paris 13e" / "Paris" / "Île-de-France" / "national" / "international" / null.

RÈGLES :
- JSON uniquement, pas de commentaire hors JSON.
- Pas d'invention : si les sources ne sont pas claires, retourne null.

Format :
{
  "activite_verifiee": "Association d'aide alimentaire opérant dans le 13e arrondissement.",
  "perimetre_geographique": "Paris 13e"
}
"""


# --- SIRENE cache (étape 1) ---------------------------------------------------


def load_sirene_cache() -> dict[str, dict[str, Any]]:
    if not SIRENE_CACHE.exists():
        return {}
    try:
        with SIRENE_CACHE.open(encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return {}
    return data.get("items", {}) if isinstance(data, dict) else {}


def lookup_sirene(siret: str, sirene: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    """Retourne l'entrée SIRENE si le SIRET est valide, sinon None."""
    if not siret or not siret.isdigit() or len(siret) < 9:
        return None
    siren = siret[:9]
    return sirene.get(siren)


def sirene_to_activity(entry: dict[str, Any]) -> dict[str, Any] | None:
    """Extrait activite + code APE. Retourne None si APE générique ou vide."""
    ape = (entry.get("activite_principale") or "").strip().upper()
    libelle = (entry.get("libelle_activite") or "").strip()
    if not libelle:
        return None
    # On rejette les codes génériques (autres orgas associatives etc.)
    if ape in GENERIC_APE_CODES:
        return None
    return {"libelle": libelle, "ape": ape}


# --- Gemini grounded (étape 2) ------------------------------------------------


def fmt_eur(n: float) -> str:
    if n >= 1e6:
        return f"{n/1e6:.2f} M€".replace(".", ",")
    if n >= 1e3:
        return f"{round(n/1e3)} k€"
    return f"{round(n)} €"


def build_user_prompt(b: dict[str, Any]) -> str:
    name = b.get("beneficiaire") or ""
    nature = b.get("nature_juridique") or "—"
    direction = b.get("direction") or "—"
    theme = b.get("thematique") or "—"
    montant = float(b.get("montant_total") or 0)
    return (
        f"Bénéficiaire de subvention de la Ville de Paris :\n"
        f"- Nom : {name}\n"
        f"- Nature juridique : {nature}\n"
        f"- Direction instruite : {direction}\n"
        f"- Thématique : {theme}\n"
        f"- Montant total reçu : {fmt_eur(montant)}\n\n"
        f"Cherche uniquement sur site:*.fr, site:wikipedia.org, "
        f"site:journal-officiel.gouv.fr. Ne pas inventer. Si rien de "
        f"crédible, retourne 'activite_verifiee': null.\n"
        f"Retourne le JSON uniquement comme défini par le system prompt."
    )


def call_gemini_grounded(user_prompt: str) -> dict[str, Any]:
    """Appel Gemini 3 Flash avec google_search — renvoie le JSON + _citations."""
    if not GEMINI_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY / GEMINI_API_KEY non définie")

    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 2048},
    }

    for attempt in range(MAX_RETRIES):
        r = requests.post(f"{GEMINI_URL}?key={GEMINI_API_KEY}", json=payload, timeout=REQ_TIMEOUT)
        if r.status_code == 429:
            wait = RETRY_WAIT_429 * (attempt + 1)
            print(f"  ⚠ rate-limit, pause {wait}s", flush=True)
            time.sleep(wait)
            continue
        if r.status_code != 200:
            raise RuntimeError(f"Gemini HTTP {r.status_code}: {r.text[:300]}")
        data = r.json()
        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except (KeyError, IndexError) as e:
            raise RuntimeError(f"Gemini response mal formée : {e} / {str(data)[:300]}") from e

        # unwrap fences
        if text.startswith("```"):
            lines = text.split("\n")
            while lines and lines[0].startswith("```"):
                lines.pop(0)
            while lines and lines[-1].startswith("```"):
                lines.pop()
            text = "\n".join(lines)
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            text = m.group(0)
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"JSON decode error: {e} · raw: {text[:400]}") from e

        citations: list[dict[str, Any]] = []
        try:
            gm = data["candidates"][0].get("groundingMetadata") or {}
            for gc in gm.get("groundingChunks", []):
                web = gc.get("web") or {}
                if web.get("uri"):
                    citations.append({"url": web["uri"], "title": web.get("title", "")})
        except Exception:
            pass
        parsed["_citations"] = citations
        return parsed

    raise RuntimeError("Max retries exceeded")


def confiance_from_citations(n: int) -> float:
    """Heuristique simple : plus de citations = plus de confiance."""
    if n >= 3:
        return 0.8
    if n == 2:
        return 0.65
    if n == 1:
        return 0.5
    return 0.0


# --- Cache + iteration --------------------------------------------------------


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
        "model": GEMINI_MODEL,
        "count": len(items),
        "items": items,
    }
    with CACHE_PATH.open("w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)


def iter_beneficiaires(year: int | None) -> list[dict[str, Any]]:
    """Dédup par beneficiaire_normalise, toutes années confondues (sauf filtre)."""
    files = sorted(SUBVENTIONS_DIR.glob("beneficiaires_*.json"), reverse=True)
    if year:
        files = [f for f in files if f.stem.endswith(str(year))]
    seen: set[str] = set()
    items: list[dict[str, Any]] = []
    for f in files:
        try:
            with f.open(encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception:
            continue
        for b in data.get("data", []):
            key = (b.get("beneficiaire_normalise") or "").strip()
            if not key or key in seen:
                continue
            seen.add(key)
            items.append(b)
    return items


# --- Orchestration par item ---------------------------------------------------


def process_beneficiaire(
    b: dict[str, Any],
    sirene: dict[str, dict[str, Any]],
    verbose: bool = False,
) -> dict[str, Any]:
    name = b.get("beneficiaire") or ""
    key = b.get("beneficiaire_normalise") or ""
    siret = (b.get("siret") or "").strip()

    base = {
        "beneficiaire": name,
        "beneficiaire_normalise": key,
        "siret": siret,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "model": GEMINI_MODEL,
    }

    # Étape 1 : SIRENE-first
    sirene_entry = lookup_sirene(siret, sirene)
    if sirene_entry:
        activity = sirene_to_activity(sirene_entry)
        if activity:
            if verbose:
                print(f"  ✓ SIRENE APE {activity['ape']} → {activity['libelle'][:70]}")
            commune = (sirene_entry.get("commune") or "").strip()
            perimetre = commune or None
            return {
                **base,
                "activite_verifiee": activity["libelle"],
                "perimetre_geographique": perimetre,
                "sources": [],
                "confiance": 0.9,
                "source_type": "sirene_ape",
            }

    # Étape 2 : Gemini grounded
    try:
        result = call_gemini_grounded(build_user_prompt(b))
    except Exception as e:
        if verbose:
            print(f"  ⚠ grounded error: {e}")
        return {
            **base,
            "activite_verifiee": None,
            "perimetre_geographique": None,
            "sources": [],
            "confiance": 0.0,
            "source_type": "fallback_none",
            "_error": str(e)[:200],
        }

    activite = result.get("activite_verifiee")
    if isinstance(activite, str):
        activite = activite.strip() or None
    perimetre = result.get("perimetre_geographique")
    if isinstance(perimetre, str):
        perimetre = perimetre.strip() or None
    citations = result.get("_citations") or []

    # Si Gemini a rien trouvé de crédible → fallback_none
    if not activite or not citations:
        if verbose:
            print("  ↩ fallback_none (aucune citation ou activite null)")
        return {
            **base,
            "activite_verifiee": None,
            "perimetre_geographique": None,
            "sources": [],
            "confiance": 0.0,
            "source_type": "fallback_none",
        }

    if verbose:
        print(f"  ✓ grounded ({len(citations)} citations) → {activite[:70]}")

    return {
        **base,
        "activite_verifiee": activite,
        "perimetre_geographique": perimetre,
        "sources": citations[:5],
        "confiance": confiance_from_citations(len(citations)),
        "source_type": "grounded_search",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Enrichit les bénéficiaires via cascade SIRENE → Gemini grounded")
    parser.add_argument("--year", type=int)
    parser.add_argument("--limit", type=int, help="Limite le nombre de bénéficiaires")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    if not GEMINI_API_KEY and not args.dry_run:
        print("❌ GOOGLE_API_KEY / GEMINI_API_KEY non définie.", file=sys.stderr)
        return 1

    cache = load_cache()
    sirene = load_sirene_cache()
    print(f"📦 Cache bénéficiaires : {len(cache)} entrées")
    print(f"📦 Cache SIRENE : {len(sirene)} entreprises")

    bens = iter_beneficiaires(args.year)
    pending = [b for b in bens if (b.get("beneficiaire_normalise") or "") not in cache]
    print(f"📋 Bénéficiaires uniques : {len(bens)} · à traiter : {len(pending)}")

    if args.limit:
        pending = pending[: args.limit]
        print(f"🔒 Limite : {len(pending)}")

    if not pending:
        print("✅ Cache à jour.")
        return 0

    stats = {"sirene_ape": 0, "grounded_search": 0, "fallback_none": 0, "errors": 0}
    processed = 0
    total = len(pending)
    t_start = time.time()

    for b in pending:
        key = b.get("beneficiaire_normalise") or ""
        name = (b.get("beneficiaire") or "")[:70]
        if args.verbose:
            print(f"[{processed + 1}/{total}] {name}")

        if args.dry_run:
            cache[key] = {
                "beneficiaire": b.get("beneficiaire", ""),
                "beneficiaire_normalise": key,
                "siret": b.get("siret") or "",
                "activite_verifiee": "(dry-run stub)",
                "perimetre_geographique": None,
                "sources": [],
                "confiance": 0.0,
                "source_type": "fallback_none",
                "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "model": "dry-run",
            }
        else:
            try:
                result = process_beneficiaire(b, sirene, verbose=args.verbose)
            except Exception as e:
                stats["errors"] += 1
                print(f"  ⚠ {name}: {e}", flush=True)
                processed += 1
                continue
            cache[key] = result
            stats[result.get("source_type", "fallback_none")] = (
                stats.get(result.get("source_type", "fallback_none"), 0) + 1
            )
            # Rate-limit seulement si on a effectivement appelé Gemini
            if result.get("source_type") == "grounded_search" or result.get("source_type") == "fallback_none":
                if "_error" not in result and result.get("source_type") != "sirene_ape":
                    time.sleep(CALL_DELAY)

        processed += 1
        if processed % 10 == 0 or processed == total:
            elapsed = time.time() - t_start
            rate = processed / elapsed if elapsed > 0 else 0
            eta = int((total - processed) / rate) if rate > 0 else 0
            pct = 100 * processed / total
            print(
                f"  [{processed:>4}/{total}] {pct:5.1f}%  ·  {rate:4.1f} items/s  ·  "
                f"ETA {eta//60:02d}m{eta%60:02d}s  ·  "
                f"APE={stats['sirene_ape']} grounded={stats['grounded_search']} "
                f"none={stats['fallback_none']} err={stats['errors']}",
                flush=True,
            )
        if processed % SAVE_EVERY == 0:
            save_cache(cache)

    save_cache(cache)
    print(f"💾 Cache écrit : {CACHE_PATH.relative_to(PROJECT_ROOT)} ({len(cache)} entrées)")
    print(
        f"📊 Résumé : SIRENE-APE={stats['sirene_ape']}  ·  "
        f"grounded={stats['grounded_search']}  ·  "
        f"fallback={stats['fallback_none']}  ·  erreurs={stats['errors']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
