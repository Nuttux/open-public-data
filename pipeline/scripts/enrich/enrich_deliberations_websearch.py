#!/usr/bin/env python3
"""
Resolve missing SIRETs on deliberation articles via Claude + WebSearch.

Runs AFTER `enrich_deliberations_sirene.py` — for each remaining article
with a beneficiary name but no SIRET, asks Claude (Sonnet-class) to use
its WebSearch tool to find the SIRET by searching for the association on
the French public registries (annuaire-entreprises.data.gouv.fr,
societe.com, pappers.fr, net1901.org).

The cache lives in the same file as the SIRENE lookup
(`deliberations_sirene.json`) — WebSearch-sourced entries carry
`source: "websearch"`. Re-runs skip anything already cached.

Usage:
    ANTHROPIC_API_KEY=xxx python enrich_deliberations_websearch.py --session 152
    ANTHROPIC_API_KEY=xxx python enrich_deliberations_websearch.py --session 152 --limit 20 --dry-run

Cost estimate: ~$0.02 per lookup via Claude Sonnet + WebSearch
(~1-2k tokens per call, 1-2 web searches). For 150 gap names ≈ $3-4.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[3]
DELIBS_DIR = ROOT / "pipeline" / "cache" / "delibs" / "sessions"
CACHE_PATH = ROOT / "pipeline" / "cache" / "enrichment" / "deliberations_sirene.json"

API_KEY = os.environ.get("ANTHROPIC_API_KEY")
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5")
API_URL = "https://api.anthropic.com/v1/messages"

SYSTEM_PROMPT = (
    "Tu es un assistant de résolution d'identité pour des organisations "
    "françaises. On te donne le nom d'un bénéficiaire d'une subvention "
    "votée par le Conseil de Paris. Utilise ton outil web_search pour "
    "trouver son SIRET (14 chiffres). Privilégie les sources officielles "
    "(annuaire-entreprises.data.gouv.fr, societe.com, pappers.fr, net1901.org). "
    "Quand plusieurs organisations portent un nom similaire, préfère celle "
    "située à Paris (dept 75) ou en Île-de-France. Retourne UNIQUEMENT un "
    "JSON dans ton dernier message (pas de prose après), avec les clés : "
    '{"siret": "14-digit-string" | null, "denomination": "nom officiel" | null, '
    '"ville_siege": "ville" | null, "confidence": "high"|"medium"|"low", '
    '"source_url": "url" | null}. Si tu n\'es pas sûr, retourne siret=null.'
)


def load_cache() -> dict:
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text(encoding="utf-8")).get("items", {})
        except Exception:  # noqa: BLE001
            return {}
    return {}


def save_cache(items: dict) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "source": "recherche-entreprises.api.gouv.fr + claude websearch",
        "count": len(items),
        "items": items,
    }
    CACHE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def call_claude(name: str, hint: str | None = None) -> dict | None:
    if not API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY non définie")
    user_msg = (
        f"Nom: « {name} »\n"
        + (f"Indice: {hint}\n" if hint else "")
        + "Contexte: bénéficiaire d'une subvention de la Ville de Paris en 2025. "
        "Trouve le SIRET."
    )
    payload = {
        "model": MODEL,
        "max_tokens": 1024,
        "system": SYSTEM_PROMPT,
        "tools": [{"type": "web_search_20250305", "name": "web_search", "max_uses": 3}],
        "messages": [{"role": "user", "content": user_msg}],
    }
    r = requests.post(
        API_URL,
        json=payload,
        headers={
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        timeout=60,
    )
    if r.status_code != 200:
        print(f"  Claude HTTP {r.status_code}: {r.text[:200]}", file=sys.stderr)
        return None
    data = r.json()
    # Extract last text block from the response
    for block in reversed(data.get("content", [])):
        if block.get("type") == "text":
            text = block.get("text", "").strip()
            # Strip possible markdown fences
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0]
            # Find the first {...} JSON object
            m = re.search(r"\{[\s\S]*\}", text)
            if not m:
                return None
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
    return None


def process(session_id: int, limit: int | None = None, dry_run: bool = False) -> None:
    path = DELIBS_DIR / f"session_{session_id}.json"
    if not path.exists():
        print(f"No file for session {session_id}", file=sys.stderr)
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    cache = load_cache()

    def is_real(n: str) -> bool:
        if not n or len(n.strip()) < 6:
            return False
        low = n.strip().lower()
        return not any(
            j in low
            for j in ("présente délib", "la ville", "convention", "titre de", "dont le")
        )

    seen: set[str] = set()
    gap: list[str] = []
    for a in data["articles"]:
        if a.get("siret"):
            continue
        n = (a.get("beneficiary") or "").strip()
        if not is_real(n):
            continue
        key = n.lower()
        if key in seen:
            continue
        seen.add(key)
        if cache.get(key):  # already resolved (SIRENE or websearch)
            continue
        gap.append(n)

    if limit:
        gap = gap[:limit]

    print(f"Session {session_id}: {len(gap)} names to WebSearch")

    if dry_run:
        for n in gap[:20]:
            print(f"  would search: {n}")
        return

    hit = 0
    for i, name in enumerate(gap, 1):
        try:
            res = call_claude(name, hint="Paris, association subventionnée")
        except Exception as e:  # noqa: BLE001
            print(f"  [{i}/{len(gap)}] {name!r} error: {e}")
            time.sleep(2)
            continue
        if res and res.get("siret"):
            siret = re.sub(r"\D", "", str(res["siret"]))
            if len(siret) == 14:
                cache[name.lower()] = {
                    "denomination": res.get("denomination"),
                    "siren": siret[:9],
                    "siret": siret,
                    "ville_siege": res.get("ville_siege"),
                    "confidence": res.get("confidence"),
                    "source_url": res.get("source_url"),
                    "matched_name": name,
                    "source": "websearch",
                }
                hit += 1
                print(f"  [{i}/{len(gap)}] {name[:50]:<50} → {siret} ({res.get('confidence','?')})")
            else:
                print(f"  [{i}/{len(gap)}] {name[:50]:<50} → malformed SIRET {res['siret']!r}")
        else:
            print(f"  [{i}/{len(gap)}] {name[:50]:<50} → no match")
            cache[name.lower()] = None
        if i % 10 == 0:
            save_cache({k: v for k, v in cache.items() if v})
        time.sleep(0.5)
    save_cache({k: v for k, v in cache.items() if v})
    print(f"  done · {hit}/{len(gap)} new SIRETs resolved")

    # Apply back to the session JSON
    applied = 0
    for a in data["articles"]:
        if a.get("siret") or not a.get("beneficiary"):
            continue
        hit_entry = cache.get(a["beneficiary"].lower().strip())
        if hit_entry and hit_entry.get("siret"):
            a["siret"] = hit_entry["siret"]
            a["siret_source"] = hit_entry.get("source", "websearch")
            applied += 1
    data["websearch_enriched_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    total = len(data["articles"])
    with_siret = sum(1 for a in data["articles"] if a.get("siret"))
    print(f"  applied SIRET on {applied} articles · total SIRET {with_siret}/{total}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", type=int, action="append", required=True)
    ap.add_argument("--limit", type=int)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    for sid in args.session:
        process(sid, limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
