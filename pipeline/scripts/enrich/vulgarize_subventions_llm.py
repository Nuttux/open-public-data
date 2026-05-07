#!/usr/bin/env python3
"""
Vulgarize subventions — génère pour chaque association subventionnée :

- activite_claire     : 1 phrase qui décrit l'activité principale
- pourquoi_subvention : 1-2 phrases sur ce que la subvention finance
- impact_citoyen      : 1 phrase sur l'impact pour les Parisiens

Lit `website/public/data/subventions/beneficiaires_*.json` et appelle
Gemini 3 Flash. Cache dans `website/public/data/enrichment/vulgarization_subventions.json`.

Idempotent : les bénéficiaires déjà en cache ne sont pas réappelés.

Usage :
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/vulgarize_subventions_llm.py
    GOOGLE_API_KEY=xxx python pipeline/scripts/enrich/vulgarize_subventions_llm.py --limit 100 --dry-run
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

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = PROJECT_ROOT / "pipeline" / "cache" / "subventions_pre_enrichment"
CACHE_PATH = PROJECT_ROOT / "pipeline" / "cache" / "enrichment" / "vulgarization_subventions.json"

GEMINI_API_KEY = os.environ.get("GOOGLE_API_KEY", "") or os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

BATCH_SIZE = 10
MAX_RETRIES = 3
RETRY_WAIT_429 = 30

SYSTEM_PROMPT = """Tu es un journaliste data qui vulgarise les subventions versées par la Ville de Paris.

Pour chaque bénéficiaire reçu, tu produis trois champs en français simple :

- activite_claire : 1 phrase (max 120 caractères). Activité principale de l'association. Si c'est un opérateur public (CASVP, Paris Habitat…), précise-le. Pas de jargon.

- pourquoi_subvention : 1 ou 2 phrases (max 280 caractères). Ce que finance concrètement la subvention dans le contexte de Paris. Utilise la thématique rattachée pour contextualiser.

- impact_citoyen : 1 phrase (max 140 caractères) sur le bénéfice pour les habitants. Si c'est un opérateur technique sans impact direct, laisse vide.

RÈGLES :
1. Pas d'invention. Si tu ne connais pas l'association, base-toi strictement sur le nom et la thématique.
2. Pas de marketing ("association exemplaire"). Ton objectif, neutre.
3. Si le bénéficiaire est une structure administrative (ex: CENTRE ACTION SOCIALE VILLE PARIS), dis-le simplement.
4. JSON uniquement, format :
[{"name": "...", "activite_claire": "...", "pourquoi_subvention": "...", "impact_citoyen": "..."}, ...]
"""


def build_prompt(batch: list[dict[str, Any]]) -> str:
    lines = ["Bénéficiaires à vulgariser :", ""]
    for b in batch:
        name = b.get("beneficiaire", "")
        theme = b.get("thematique") or "—"
        nature = b.get("nature_juridique") or "—"
        montant = b.get("montant_total") or 0
        lines.append(
            f"- name={name!r} · thématique={theme} · nature_juridique={nature} · "
            f"montant={montant:,} €"
        )
    return "\n".join(lines)


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
        r = requests.post(f"{GEMINI_URL}?key={GEMINI_API_KEY}", json=payload, timeout=60)
        if r.status_code == 429:
            wait = RETRY_WAIT_429 * (attempt + 1)
            print(f"  ⚠ rate-limit, pause {wait}s")
            time.sleep(wait)
            continue
        if r.status_code != 200:
            raise RuntimeError(f"Gemini HTTP {r.status_code}: {r.text[:200]}")
        data = r.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            last = max(text.rfind("},"), text.rfind("}"))
            if last > 0:
                salvaged = text[: last + 1].rstrip(",") + "]"
                try:
                    return json.loads(salvaged)
                except json.JSONDecodeError:
                    pass
            raise
    raise RuntimeError("Max retries exceeded")


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
    files = sorted(DATA_DIR.glob("beneficiaires_*.json"), reverse=True)
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
            name = b.get("beneficiaire")
            if not name or name in seen:
                continue
            seen.add(name)
            items.append(b)
    return items


def main() -> int:
    parser = argparse.ArgumentParser(description="Vulgarize subventions via Gemini 3 Flash")
    parser.add_argument("--year", type=int)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not GEMINI_API_KEY and not args.dry_run:
        print("❌ GOOGLE_API_KEY non définie.")
        return 1

    cache = load_cache()
    print(f"📦 Cache : {len(cache)} entrées")

    ben = iter_beneficiaires(args.year)
    pending = [b for b in ben if b["beneficiaire"] not in cache]
    print(f"📋 Bénéficiaires uniques : {len(ben)} · à traiter : {len(pending)}")

    if args.limit:
        pending = pending[: args.limit]
        print(f"🔒 Limite : {len(pending)}")

    if not pending:
        print("✅ Cache à jour.")
        return 0

    processed = 0
    total = len(pending)
    t_start = time.time()
    for i in range(0, total, BATCH_SIZE):
        batch = pending[i : i + BATCH_SIZE]
        if args.dry_run:
            for b in batch:
                cache[b["beneficiaire"]] = {
                    "activite_claire": "(dry-run stub)",
                    "pourquoi_subvention": "(dry-run stub)",
                    "impact_citoyen": "",
                    "model": "dry-run",
                }
            processed += len(batch)
        else:
            try:
                results = call_gemini(build_prompt(batch))
            except Exception as e:
                print(f"  ⚠ batch {i // BATCH_SIZE + 1}: {e}", flush=True)
                continue

            by_name = {r.get("name"): r for r in results if r.get("name")}
            for b in batch:
                r = by_name.get(b["beneficiaire"])
                if not r:
                    continue
                cache[b["beneficiaire"]] = {
                    "activite_claire": (r.get("activite_claire") or "").strip(),
                    "pourquoi_subvention": (r.get("pourquoi_subvention") or "").strip(),
                    "impact_citoyen": (r.get("impact_citoyen") or "").strip(),
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
        if processed % (BATCH_SIZE * 5) == 0 or i + BATCH_SIZE >= total:
            save_cache(cache)

    save_cache(cache)
    print(f"💾 Cache écrit : {CACHE_PATH.relative_to(PROJECT_ROOT)} ({len(cache)} entrées)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
