#!/usr/bin/env python3
"""
Variante Anthropic du vulgarize_projets_llm.py — produit le même cache JSON
(website/public/data/enrichment/vulgarization_projets.json) mais via Claude
au lieu de Gemini. Pratique quand seul ANTHROPIC_API_KEY est dispo.

Réutilise les helpers de vulgarize_projets_llm (prompt, cache I/O, iter_projets).
Idempotent : ne réappelle pas un projet déjà en cache.

Usage :
    export ANTHROPIC_API_KEY=sk-ant-...
    python pipeline/scripts/enrich/vulgarize_projets_anthropic.py
    python pipeline/scripts/enrich/vulgarize_projets_anthropic.py --year 2021 --min-montant 100000
    python pipeline/scripts/enrich/vulgarize_projets_anthropic.py --max-projects 50  # test
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

# Réutilise tout le scaffolding du script Gemini
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from vulgarize_projets_llm import (  # noqa: E402
    BATCH_SIZE,
    CACHE_PATH,
    PROGRESS_INTERVAL,
    SYSTEM_PROMPT,
    build_batch_prompt,
    iter_projets,
    load_cache,
    save_cache,
)

ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")


def call_anthropic(user_prompt: str) -> list[dict]:
    """Appel Claude via SDK Python. Retourne la liste de dicts {id, ...}."""
    if not ANTHROPIC_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY non définie")
    try:
        from anthropic import Anthropic
    except ImportError as e:
        raise ImportError(
            "Le SDK anthropic n'est pas installé. `pip install anthropic`."
        ) from e

    client = Anthropic(api_key=ANTHROPIC_KEY)
    msg = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=4096,
        temperature=0.2,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )
    text = "".join(b.text for b in msg.content if hasattr(b, "text")).strip()
    # Strip markdown fences si présents
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Salvage : couper à la dernière `}` complète
        last = max(text.rfind("},"), text.rfind("}"))
        if last > 0:
            try:
                return json.loads(text[: last + 1].rstrip(",") + "]")
            except json.JSONDecodeError:
                pass
        raise


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--year", type=int, help="Restreindre à une année")
    ap.add_argument("--min-montant", type=float, default=0,
                    help="Skip projets sous ce montant (€). Défaut 0.")
    ap.add_argument("--max-projects", type=int, default=0,
                    help="Plafond de projets à traiter (debug). 0 = pas de plafond.")
    ap.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    ap.add_argument("--dry-run", action="store_true",
                    help="N'appelle pas l'API, affiche juste les batches.")
    args = ap.parse_args()

    cache = load_cache()
    print(f"Cache existant : {len(cache)} projets vulgarisés")

    todo = [p for p in iter_projets(args.year, args.min_montant) if p["id"] not in cache]
    if args.max_projects > 0:
        todo = todo[: args.max_projects]
    print(f"À traiter : {len(todo)} projets (year={args.year}, min={args.min_montant} €)")
    if not todo:
        print("Rien à faire.")
        return

    if not ANTHROPIC_KEY and not args.dry_run:
        print("❌ ANTHROPIC_API_KEY non définie. Exporte-la ou utilise --dry-run.")
        return

    bs = args.batch_size
    saved_since = 0
    start = time.time()
    for i in range(0, len(todo), bs):
        batch = todo[i : i + bs]
        prompt = build_batch_prompt(batch)
        if args.dry_run:
            print(f"\n--- batch {i // bs + 1} (dry-run, {len(batch)} projets) ---")
            print(prompt[:500] + "…")
            continue
        try:
            results = call_anthropic(prompt)
        except Exception as e:
            print(f"  batch {i // bs + 1} ÉCHEC : {e}")
            continue
        # Index par id
        by_id = {r["id"]: r for r in results if isinstance(r, dict) and r.get("id")}
        added = 0
        for p in batch:
            r = by_id.get(p["id"])
            if not r:
                continue
            cache[p["id"]] = {
                "description_claire": r.get("description_claire", ""),
                "quoi_concretement": r.get("quoi_concretement", ""),
                "pourquoi_ca_compte": r.get("pourquoi_ca_compte", ""),
                "typologie_normalisee": r.get("typologie_normalisee", "autre"),
            }
            added += 1
        saved_since += added
        elapsed = time.time() - start
        rate = (i + len(batch)) / elapsed if elapsed > 0 else 0
        remaining = (len(todo) - (i + len(batch))) / rate if rate > 0 else 0
        print(
            f"  [{i + len(batch):>4}/{len(todo)}] +{added}/{len(batch)} "
            f"  {rate:.1f} projets/s  ETA {remaining/60:.1f} min"
        )
        if saved_since >= 50:
            save_cache(cache)
            saved_since = 0

    save_cache(cache)
    print(f"\n→ {CACHE_PATH.relative_to(Path(__file__).resolve().parents[3])}  ({len(cache)} projets en cache)")


if __name__ == "__main__":
    main()
