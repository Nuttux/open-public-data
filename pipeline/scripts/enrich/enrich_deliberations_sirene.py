#!/usr/bin/env python3
"""
Enrich deliberation articles with SIRET via recherche-entreprises.api.gouv.fr.

For each article that has a beneficiary name but no SIRET, look up the
organisation on `api-recherche-entreprises.api.gouv.fr` (public, no auth).
High match rate on formal association names.

The API is free but rate-limited; we sleep ~0.3s between calls and cache
name → {siren, siret, denomination} in
`website/public/data/enrichment/deliberations_sirene.json` so re-runs
are fast and only new names hit the API.

Usage:
    python enrich_deliberations_sirene.py --session 152
    python enrich_deliberations_sirene.py --session 152 --limit 50 --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote

import requests

ROOT = Path(__file__).resolve().parents[3]
DELIBS_DIR = ROOT / "website" / "public" / "data" / "subventions_delibs"
CACHE_PATH = ROOT / "website" / "public" / "data" / "enrichment" / "deliberations_sirene.json"
API = "https://recherche-entreprises.api.gouv.fr/search"

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "FranceOpenData-Scraper/0.1 (+contact@franceopendata.org)"})


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
        "source": "recherche-entreprises.api.gouv.fr",
        "count": len(items),
        "items": items,
    }
    CACHE_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def normalise(name: str) -> str:
    """Strip connectors / entity prefixes / trailing noise picked up by
    the regex from the PDF, so the resulting query matches SIRENE's
    search index. Order matters: trailing noise first, then prefixes."""
    s = name.strip()
    # Trim trailing descriptors the scraper regex sometimes swallows.
    s = re.split(
        r"\s+(?:domicili[ée]|sise|situ[ée]|au\s+titre\s+de|dont\s+le|dont\s+l[’']|déclarée\s+d['’]utilit[ée])",
        s,
        flags=re.IGNORECASE,
    )[0]
    # Strip leading french connector particles ("de l'", "la ", "le ").
    s = re.sub(r"^(?:de\s+l['’]|de\s+la\s+|de\s+|l['’]\s*|la\s+|le\s+)\s*", "", s, flags=re.IGNORECASE)
    # Strip entity prefixes (association, société, SAS, SARL, SCIC, régie...).
    s = re.sub(
        r"^(?:association|fondation|société|régie|comité|centre|ligue|syndicat|groupement|collectif|entreprise|SAS|SARL|SCIC|SCOP|EURL|SA|SNC|SCA|mutuelle|maison|théâtre|fonds)\s+",
        "",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(r"\s+", " ", s).strip(" ,;.'\"")
    return s


def lookup(name: str) -> dict | None:
    q = normalise(name)
    if not q or len(q) < 4:
        return None
    # Two-pass: first restrict to Paris (dept 75) for higher precision,
    # then fall back to national search if nothing matches.
    for params in (
        {"q": q, "departement": "75", "per_page": 1, "page": 1},
        {"q": q, "per_page": 1, "page": 1},
    ):
        try:
            r = SESSION.get(API, params=params, timeout=10)
        except requests.RequestException as e:
            print(f"  request error {name!r}: {e}", file=sys.stderr)
            return None
        if r.status_code != 200:
            continue
        hits = (r.json() or {}).get("results") or []
        if hits:
            break
    else:
        return None
    h = hits[0]
    siege = h.get("siege") or {}
    siret = siege.get("siret")
    return {
        "denomination": h.get("nom_raison_sociale") or h.get("nom_complet"),
        "siren": h.get("siren"),
        "siret": siret,
        "nature_juridique": h.get("nature_juridique"),
        "activite_principale": h.get("activite_principale"),
        "ville_siege": (siege.get("libelle_commune") or "").strip(),
        "matched_name": name,
    }


def process(session_id: int, limit: int | None = None, dry_run: bool = False) -> None:
    path = DELIBS_DIR / f"session_{session_id}.json"
    if not path.exists():
        print(f"No file for session {session_id}", file=sys.stderr)
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    cache = load_cache()

    gap = [
        a for a in data["articles"]
        if a.get("beneficiary") and not a.get("siret")
    ]
    names_unique: list[str] = []
    seen: set[str] = set()
    for a in gap:
        n = a["beneficiary"].strip()
        if n.lower() in seen:
            continue
        seen.add(n.lower())
        names_unique.append(n)

    to_query = [n for n in names_unique if n.lower() not in cache]
    if limit:
        to_query = to_query[:limit]

    print(
        f"Session {session_id}: {len(data['articles'])} arts, "
        f"{len(gap)} with benef-no-siret, {len(names_unique)} unique names, "
        f"{len(to_query)} to query (cache hits: {len(names_unique) - len(to_query)})"
    )

    if dry_run:
        for n in to_query[:10]:
            print(f"  would query: {n}")
        return

    hit = 0
    for i, name in enumerate(to_query, 1):
        res = lookup(name)
        cache[name.lower()] = res  # None stored as miss
        if res:
            hit += 1
        if i % 25 == 0:
            print(f"  {i}/{len(to_query)} · hit {hit}")
            save_cache(cache)
        time.sleep(0.3)
    save_cache(cache)
    print(f"  done · {hit}/{len(to_query)} matched")

    # Apply cache back to articles
    applied = 0
    for a in data["articles"]:
        if a.get("siret") or not a.get("beneficiary"):
            continue
        hit = cache.get(a["beneficiary"].lower().strip())
        if hit and hit.get("siret"):
            a["siret"] = hit["siret"]
            a["siret_source"] = "sirene"
            applied += 1
    data["sirene_enriched_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    total = len(data["articles"])
    with_siret = sum(1 for a in data["articles"] if a.get("siret"))
    print(f"  applied SIRET on {applied} articles · total SIRET {with_siret}/{total}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", type=int, action="append", required=True)
    ap.add_argument("--limit", type=int, help="Max new names to query (for testing).")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    for sid in args.session:
        process(sid, limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
