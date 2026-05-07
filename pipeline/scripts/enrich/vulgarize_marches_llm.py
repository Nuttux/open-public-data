#!/usr/bin/env python3
"""
Vulgarize marches publics — génère, pour chaque marché, trois champs
rédigés en français simple à destination du grand public :

- objet_clair        : reformulation en une ligne de l'objet brut M57/CPV
- quoi_concretement  : 2-3 phrases sur ce que fait le marché
- pourquoi_ca_compte : 1 phrase sur l'impact citoyen (optionnel)

Lit les fichiers marchés (`website/public/data/marches-publics/marches_*.json`),
appelle Gemini 3 Flash par batches, et écrit un cache JSON lisible depuis
le frontend (`vulgarization_marches.json`).

Idempotent : les contrats déjà en cache ne sont PAS réappelés.

Usage :
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/vulgarize_marches_llm.py
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/vulgarize_marches_llm.py --year 2024 --limit 100
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/vulgarize_marches_llm.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import requests

# =============================================================================
# Configuration
# =============================================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = PROJECT_ROOT / "website" / "public" / "data" / "marches-publics"
CACHE_PATH = PROJECT_ROOT / "pipeline" / "cache" / "enrichment" / "vulgarization_marches.json"

GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY", "") or os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

BATCH_SIZE = 8  # 8 contrats par appel — au-delà, risque de JSON tronqué
PROGRESS_INTERVAL = 5
MAX_RETRIES = 3
RETRY_WAIT_429 = 30  # secondes

# =============================================================================
# Prompts
# =============================================================================

SYSTEM_PROMPT = """Tu es un journaliste data qui vulgarise les marchés publics de la Ville de Paris à destination du grand public.

Pour chaque marché reçu, tu produis trois champs en français simple, sans jargon technique :

- objet_clair : reformulation en UNE phrase claire et courte (max 120 caractères). Remplace les acronymes (MOA, MAPA, CPV, etc.) et les libellés techniques par des termes compréhensibles. Évite les majuscules accidentelles.

- quoi_concretement : 2 ou 3 phrases (max 280 caractères total) qui expliquent CE QUE FAIT CE MARCHÉ concrètement. Qui intervient ? Où ? Pour quel résultat ? Le lecteur doit comprendre sans être expert.

- pourquoi_ca_compte : UNE phrase (max 140 caractères) sur l'impact pour les habitants. Pourquoi on devrait s'y intéresser ? Quel bénéfice ou risque concret ? Si l'impact est purement interne (administration, maintenance), laisse la chaîne vide.

RÈGLES STRICTES :
1. Pas d'invention. Si tu ne sais pas, utilise "—" ou laisse vide.
2. Pas de jargon. Pas de "prestations de services d'optimisation des flux" — dis "nettoyage des rues" ou "collecte des ordures".
3. Pas de phrases pompeuses. Style direct, journal, phrases courtes.
4. Garde une objectivité neutre. Ni promotion ("un beau projet"), ni critique ("dépense inutile").
5. Tu réponds UNIQUEMENT avec un tableau JSON valide, format :
[
  {"numero": "...", "objet_clair": "...", "quoi_concretement": "...", "pourquoi_ca_compte": "..."},
  ...
]
"""


def build_batch_prompt(batch: list[dict[str, Any]]) -> str:
    """Prépare le prompt user avec la liste des marchés à traiter."""
    lines = [
        "Voici les marchés publics à vulgariser. Pour chacun, génère les trois champs demandés.",
        "",
    ]
    for m in batch:
        objet = (m.get("objet") or "").strip()
        nature = (m.get("nature") or "").strip()
        cat = (m.get("categorie_libelle") or "").strip()
        fournisseur = (m.get("fournisseur_nom") or "").strip()
        montant = m.get("montant_max") or 0
        lines.append(
            f"- numero={m['numero_marche']} · nature={nature} · catégorie={cat} · "
            f"enveloppe={montant:,} € · titulaire={fournisseur}"
        )
        lines.append(f"  objet brut : {objet}")
    return "\n".join(lines)


# =============================================================================
# Gemini call
# =============================================================================


def call_gemini(user_prompt: str) -> list[dict[str, Any]]:
    """Appelle Gemini et parse la réponse JSON."""
    if not GEMINI_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY / GEMINI_API_KEY non définie")

    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
            "maxOutputTokens": 8192,
        },
    }

    for attempt in range(MAX_RETRIES):
        response = requests.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            json=payload,
            timeout=60,
        )
        if response.status_code == 429:
            wait = RETRY_WAIT_429 * (attempt + 1)
            print(f"  ⚠ rate-limit, pause {wait}s")
            time.sleep(wait)
            continue
        if response.status_code != 200:
            raise RuntimeError(f"Gemini HTTP {response.status_code}: {response.text[:200]}")

        data = response.json()
        try:
            text = data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError) as e:
            raise RuntimeError(f"Gemini response mal formée : {e} / {data}") from e

        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1]
            text = text.rsplit("```", 1)[0]

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Response truncated mid-string (hit output token budget). Recover
            # the completed objects by trimming back to the last valid `},` or
            # `}` and closing the array. Good enough — the caller maps by name
            # so missing items are just skipped.
            last = max(text.rfind("},"), text.rfind("}"))
            if last > 0:
                salvaged = text[: last + 1].rstrip(",") + "]"
                try:
                    return json.loads(salvaged)
                except json.JSONDecodeError:
                    pass
            raise

    raise RuntimeError("Max retries exceeded")


# =============================================================================
# Cache I/O
# =============================================================================


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


# =============================================================================
# Main
# =============================================================================


def iter_marches(year: int | None) -> list[dict[str, Any]]:
    """Collecte les marchés à traiter depuis les fichiers année par année."""
    files = sorted(DATA_DIR.glob("marches_*.json"))
    if year:
        files = [f for f in files if f.stem.endswith(str(year))]
    items: list[dict[str, Any]] = []
    for f in files:
        try:
            with f.open(encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception as e:
            print(f"  ⚠ skip {f.name}: {e}")
            continue
        year_num = data.get("year")
        for row in data.get("data", data.get("marches", [])):
            if not row.get("numero_marche"):
                continue
            row["_year"] = year_num
            items.append(row)
    return items


def main() -> int:
    parser = argparse.ArgumentParser(description="Vulgarize marchés publics via Gemini 3 Flash")
    parser.add_argument("--year", type=int, help="Filtrer à une année")
    parser.add_argument("--limit", type=int, help="Limite nombre de marchés à traiter")
    parser.add_argument("--dry-run", action="store_true", help="N'appelle pas Gemini, simule")
    args = parser.parse_args()

    if not GEMINI_API_KEY and not args.dry_run:
        print("❌ GOOGLE_API_KEY / GEMINI_API_KEY non définie. Exporte-la ou utilise --dry-run.")
        return 1

    cache = load_cache()
    print(f"📦 Cache existant : {len(cache)} entrées")

    marches = iter_marches(args.year)
    pending = [m for m in marches if m["numero_marche"] not in cache]
    print(f"📋 Total marchés : {len(marches)} · à traiter : {len(pending)}")

    if args.limit:
        pending = pending[: args.limit]
        print(f"🔒 Limite appliquée : {len(pending)}")

    if not pending:
        print("✅ Rien à faire, cache déjà à jour.")
        return 0

    processed = 0
    total = len(pending)
    t_start = time.time()
    for i in range(0, total, BATCH_SIZE):
        batch = pending[i : i + BATCH_SIZE]
        if args.dry_run:
            for m in batch:
                cache[m["numero_marche"]] = {
                    "objet_clair": "(dry-run stub)",
                    "quoi_concretement": "(dry-run stub)",
                    "pourquoi_ca_compte": "",
                    "year": m.get("_year"),
                    "model": "dry-run",
                }
            processed += len(batch)
        else:
            try:
                user_prompt = build_batch_prompt(batch)
                results = call_gemini(user_prompt)
            except Exception as e:
                print(f"  ⚠ erreur batch {i // BATCH_SIZE + 1}: {e}", flush=True)
                continue

            by_numero = {r.get("numero"): r for r in results if r.get("numero")}
            for m in batch:
                numero = m["numero_marche"]
                r = by_numero.get(numero)
                if not r:
                    continue
                cache[numero] = {
                    "objet_clair": (r.get("objet_clair") or "").strip(),
                    "quoi_concretement": (r.get("quoi_concretement") or "").strip(),
                    "pourquoi_ca_compte": (r.get("pourquoi_ca_compte") or "").strip(),
                    "year": m.get("_year"),
                    "model": GEMINI_MODEL,
                }
            processed += len(batch)

        elapsed = time.time() - t_start
        rate = processed / elapsed if elapsed > 0 else 0
        eta = int((total - processed) / rate) if rate > 0 else 0
        pct = 100 * processed / total
        print(
            f"  [{processed:>4}/{total}] {pct:5.1f}%  ·  {rate:4.1f} items/s  ·  ETA {eta//60:02d}m{eta%60:02d}s",
            flush=True,
        )
        if processed % (BATCH_SIZE * PROGRESS_INTERVAL) == 0 or i + BATCH_SIZE >= total:
            save_cache(cache)  # checkpoint

    save_cache(cache)
    print(f"💾 Cache écrit : {CACHE_PATH.relative_to(PROJECT_ROOT)} ({len(cache)} entrées)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
