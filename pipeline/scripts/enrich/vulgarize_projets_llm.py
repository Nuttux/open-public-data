#!/usr/bin/env python3
"""
Vulgarize projets d'investissement — pour chaque projet extrait des PDFs
du compte administratif, génère 4 champs :

- description_claire     : 1 phrase (max 130 chars) — c'est quoi en clair
- quoi_concretement      : 2-3 phrases (max 320 chars) — scope technique
                           (rénovation / construction / remplacement, usage,
                            localisation si utile)
- pourquoi_ca_compte     : 1 phrase (max 140 chars) — impact habitant
- typologie_normalisee   : l'un des slugs : ecole, college, lycee, creche,
                           gymnase, piscine, bibliotheque, espace-vert, voirie,
                           logement-social, equipement-culturel,
                           equipement-sante, administration, autre

La typologie est critique pour :
- Les filtres du photo wall côté frontend
- Le fallback générique quand aucune photo dédiée n'est trouvée
- Le sourcing de photos (query "école primaire paris" vs "immeuble paris")

Lit `website/public/data/map/investissements_complet_*.json` et appelle
Gemini 3 Flash. Cache dans `vulgarization_projets.json`.

Idempotent : les projets déjà en cache ne sont PAS réappelés.

Usage :
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/vulgarize_projets_llm.py
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/vulgarize_projets_llm.py --year 2024 --limit 100
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/vulgarize_projets_llm.py --min-montant 100000
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
DATA_DIR = PROJECT_ROOT / "website" / "public" / "data" / "map"
CACHE_PATH = PROJECT_ROOT / "pipeline" / "cache" / "enrichment" / "vulgarization_projets.json"

GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY", "") or os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

BATCH_SIZE = 8
PROGRESS_INTERVAL = 5
MAX_RETRIES = 3
RETRY_WAIT_429 = 30

TYPOLOGIES = [
    "ecole",
    "college",
    "lycee",
    "creche",
    "gymnase",
    "piscine",
    "bibliotheque",
    "espace-vert",
    "voirie",
    "logement-social",
    "equipement-culturel",
    "equipement-sante",
    "administration",
    "autre",
]

# =============================================================================
# Prompts
# =============================================================================

SYSTEM_PROMPT = f"""Tu es un journaliste data qui vulgarise les projets d'investissement de la Ville de Paris à destination du grand public.

Pour chaque projet reçu (extrait d'un compte administratif), tu produis quatre champs en français simple, sans jargon technique :

- description_claire : UNE phrase claire et courte (max 130 caractères). Pas d'acronymes, pas de majuscules accidentelles. Qu'est-ce que c'est, en clair ?

- quoi_concretement : 2 ou 3 phrases (max 320 caractères total). Scope technique : rénovation / construction neuve / extension / remplacement / étude / acquisition. Le lecteur doit comprendre ce qui est VRAIMENT fait.

- pourquoi_ca_compte : UNE phrase (max 140 caractères) sur l'impact pour les habitants de l'arrondissement ou de Paris. Si c'est purement administratif sans impact direct, laisse vide.

- typologie_normalisee : UN SEUL slug parmi : {", ".join(TYPOLOGIES)}. Choisis le plus proche. Règles :
  * "ecole" = maternelle + élémentaire + primaire (pas collège / lycée)
  * "logement-social" = construction/réhabilitation de logements sociaux (bailleurs)
  * "voirie" = chaussées, trottoirs, pistes cyclables, éclairage public
  * "espace-vert" = parcs, jardins, squares, plantations d'arbres
  * "equipement-culturel" = musée, théâtre, médiathèque (pas bibliothèque)
  * "equipement-sante" = crèche exclue (→ creche) ; PMI, centre de santé municipal
  * "administration" = mairie arrdt, locaux techniques, services internes
  * "autre" UNIQUEMENT si rien ne colle

RÈGLES STRICTES :
1. Pas d'invention. Si tu ne sais pas, reste factuel et court.
2. Pas de jargon ("maîtrise d'œuvre", "AP/CP" etc.) — reformule.
3. Pas de phrases pompeuses. Style direct, journal.
4. Objectivité neutre. Ni promo, ni critique.
5. Tu réponds UNIQUEMENT avec un tableau JSON valide, format :
[
  {{"id": "...", "description_claire": "...", "quoi_concretement": "...", "pourquoi_ca_compte": "...", "typologie_normalisee": "..."}},
  ...
]
"""


def build_batch_prompt(batch: list[dict[str, Any]]) -> str:
    lines = [
        "Voici les projets d'investissement à vulgariser. Pour chacun, génère les quatre champs demandés.",
        "",
    ]
    for p in batch:
        nom = (p.get("nom_projet") or "").strip()
        chapitre = (p.get("chapitre_libelle") or "").strip()
        type_ap = (p.get("type_ap") or "").strip()
        arr = p.get("arrondissement") or 0
        montant = p.get("montant") or 0
        geo = (p.get("geo_label") or "").strip()
        lines.append(
            f"- id={p['id']} · chapitre={chapitre} · type={type_ap} · "
            f"arrondissement={arr}ᵉ · montant={montant:,.0f} €"
        )
        lines.append(f"  nom : {nom}")
        if geo:
            lines.append(f"  adresse : {geo}")
    return "\n".join(lines)


# =============================================================================
# Gemini call
# =============================================================================


def call_gemini(user_prompt: str) -> list[dict[str, Any]]:
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
            # Salvage truncated response
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


def iter_projets(year: int | None, min_montant: float) -> list[dict[str, Any]]:
    """Itère sur tous les projets nommés disponibles, en scannant DEUX
    sources :
      - investissements_complet_*.json (source historique 2018-2024)
      - investissements_localises_*.json (PDFs IL extraits, 2019-2024)
    Un id présent dans les deux n'est gardé qu'une fois (priorité au complet
    qui a la géoloc + métadonnées riches)."""
    patterns = ("investissements_complet_20*.json", "investissements_localises_20*.json")
    files: list[Path] = []
    for pat in patterns:
        files.extend(sorted(DATA_DIR.glob(pat)))
    if year:
        files = [f for f in files if f.stem.endswith(str(year))]
    items: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for f in files:
        try:
            with f.open(encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception as e:
            print(f"  ⚠ skip {f.name}: {e}")
            continue
        for row in data.get("data", []):
            pid = row.get("id")
            if not pid or not row.get("nom_projet"):
                continue
            if pid in seen_ids:
                continue
            if float(row.get("montant") or 0) < min_montant:
                continue
            items.append(row)
            seen_ids.add(pid)
    return items


def main() -> int:
    parser = argparse.ArgumentParser(description="Vulgarize projets investissement via Gemini 3 Flash")
    parser.add_argument("--year", type=int, help="Filtrer à une année")
    parser.add_argument("--limit", type=int, help="Limite nombre de projets à traiter")
    parser.add_argument("--min-montant", type=float, default=50_000,
                        help="Montant minimum pour vulgariser (défaut 50k€ — évite les micro-lignes d'entretien)")
    parser.add_argument("--dry-run", action="store_true", help="N'appelle pas Gemini, simule")
    args = parser.parse_args()

    if not GEMINI_API_KEY and not args.dry_run:
        print("❌ GOOGLE_API_KEY / GEMINI_API_KEY non définie. Exporte-la ou utilise --dry-run.")
        return 1

    cache = load_cache()
    print(f"📦 Cache existant : {len(cache)} entrées")

    projets = iter_projets(args.year, args.min_montant)
    pending = [p for p in projets if p["id"] not in cache]
    print(f"📋 Total projets (montant ≥ {args.min_montant:,.0f} €) : {len(projets)} · à traiter : {len(pending)}")

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
            for p in batch:
                cache[p["id"]] = {
                    "description_claire": "(dry-run stub)",
                    "quoi_concretement": "(dry-run stub)",
                    "pourquoi_ca_compte": "",
                    "typologie_normalisee": "autre",
                    "year": p.get("annee"),
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

            by_id = {r.get("id"): r for r in results if r.get("id")}
            for p in batch:
                pid = p["id"]
                r = by_id.get(pid)
                if not r:
                    continue
                typo = (r.get("typologie_normalisee") or "autre").strip().lower()
                if typo not in TYPOLOGIES:
                    typo = "autre"
                cache[pid] = {
                    "description_claire": (r.get("description_claire") or "").strip(),
                    "quoi_concretement": (r.get("quoi_concretement") or "").strip(),
                    "pourquoi_ca_compte": (r.get("pourquoi_ca_compte") or "").strip(),
                    "typologie_normalisee": typo,
                    "year": p.get("annee"),
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
            save_cache(cache)

    save_cache(cache)
    print(f"💾 Cache écrit : {CACHE_PATH.relative_to(PROJECT_ROOT)} ({len(cache)} entrées)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
