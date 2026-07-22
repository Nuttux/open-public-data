#!/usr/bin/env python3
"""
Sample photo availability — avant d'investir dans un pipeline de photos
à grande échelle pour les projets d'investissement, on sample ~20 projets
stratifiés par montant + typologie et on teste 3 sources gratuites :

    - Wikimedia Commons (illimité, licences CC)
    - Unsplash (50 req/h gratuit, licence Unsplash)
    - Pexels (illimité gratuit, licence CC0)

Output : `pipeline/output/sample_photos_report.md`
       + `pipeline/output/sample_photos_report.json` (pour post-analyse)

L'objectif est de répondre à "est-ce qu'on trouve réellement des photos
dédiées pour les gros projets, ou juste du générique ?" avant de décider
de la stratégie (photo dédiée / photo typologique / pictogramme SVG).

Dépendances :
    pip install requests

Usage :
    python pipeline/scripts/enrich/sample_photo_availability.py
    python pipeline/scripts/enrich/sample_photo_availability.py --year 2024 --limit 20

APIs clés optionnelles (si absentes, on skip la source) :
    UNSPLASH_ACCESS_KEY  — https://unsplash.com/developers (50 req/h gratuit)
    PEXELS_API_KEY       — https://www.pexels.com/api/ (illimité gratuit)
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from pathlib import Path
from typing import Any

import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = PROJECT_ROOT / "website" / "public" / "data" / "map"
OUT_DIR = PROJECT_ROOT / "pipeline" / "output"
OUT_DIR.mkdir(parents=True, exist_ok=True)

UNSPLASH_KEY = os.environ.get("UNSPLASH_ACCESS_KEY", "")
PEXELS_KEY = os.environ.get("PEXELS_API_KEY", "")

REQ_TIMEOUT = 12
MAX_RESULTS_PER_SOURCE = 3

# Wikimedia API policy requires a descriptive User-Agent (otherwise → HTTP 403).
# https://www.mediawiki.org/wiki/API:Etiquette
USER_AGENT = "Qipu-PhotoSampler/0.1 (https://qipu.org; contact@qipu.org)"


def load_projets(year: int) -> list[dict[str, Any]]:
    f = DATA_DIR / f"investissements_complet_{year}.json"
    if not f.exists():
        print(f"❌ {f} introuvable", file=sys.stderr)
        sys.exit(1)
    with f.open(encoding="utf-8") as fh:
        return json.load(fh).get("data", [])


def stratified_sample(projets: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    """Répartit l'échantillon par montant + diversité de typologie."""
    buckets: dict[str, list[dict[str, Any]]] = {
        "xxl": [],   # > 50 M€
        "xl":  [],   # 10-50 M€
        "l":   [],   # 1-10 M€
        "m":   [],   # 100k-1M€
        "s":   [],   # < 100k€
    }
    for p in projets:
        if not p.get("nom_projet"):
            continue
        m = float(p.get("montant") or 0)
        if m >= 50e6:
            b = "xxl"
        elif m >= 10e6:
            b = "xl"
        elif m >= 1e6:
            b = "l"
        elif m >= 100e3:
            b = "m"
        else:
            b = "s"
        buckets[b].append(p)

    for b in buckets.values():
        random.shuffle(b)

    # Quotas visés
    quotas = {"xxl": 3, "xl": 5, "l": 5, "m": 4, "s": 3}
    sample: list[dict[str, Any]] = []
    for tier, q in quotas.items():
        sample.extend(buckets[tier][:q])

    sample = sample[:limit]
    print(f"Échantillon : {len(sample)} projets")
    for tier, q in quotas.items():
        got = sum(1 for s in sample if bucket_of(s) == tier)
        print(f"  {tier}: {got}/{q}")
    return sample


def bucket_of(p: dict[str, Any]) -> str:
    m = float(p.get("montant") or 0)
    if m >= 50e6:
        return "xxl"
    if m >= 10e6:
        return "xl"
    if m >= 1e6:
        return "l"
    if m >= 100e3:
        return "m"
    return "s"


def fmt_eur(n: float) -> str:
    if n >= 1e9:
        return f"{n / 1e9:.2f} Md€".replace(".", ",")
    if n >= 1e6:
        return f"{n / 1e6:.1f} M€".replace(".", ",")
    if n >= 1e3:
        return f"{round(n / 1e3)} k€"
    return f"{round(n)} €"


# ─── Wikimedia Commons ────────────────────────────────────────────────────────

WIKIMEDIA_URL = "https://commons.wikimedia.org/w/api.php"


def wikimedia_search(query: str) -> list[dict[str, Any]]:
    params = {
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrsearch": f"filetype:bitmap {query}",
        "gsrlimit": MAX_RESULTS_PER_SOURCE,
        "gsrnamespace": 6,  # file namespace
        "prop": "imageinfo",
        "iiprop": "url|size|extmetadata",
        "iiurlwidth": 400,
    }
    try:
        r = requests.get(
            WIKIMEDIA_URL,
            params=params,
            timeout=REQ_TIMEOUT,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        )
    except requests.RequestException as e:
        return [{"error": str(e)}]
    if r.status_code != 200:
        return [{"error": f"HTTP {r.status_code}"}]
    pages = r.json().get("query", {}).get("pages", {}) or {}
    results = []
    for p in pages.values():
        ii = (p.get("imageinfo") or [{}])[0]
        meta = ii.get("extmetadata", {}) or {}
        results.append({
            "title": p.get("title", ""),
            "url": ii.get("url"),
            "thumb": ii.get("thumburl"),
            "width": ii.get("width"),
            "height": ii.get("height"),
            "license": (meta.get("LicenseShortName") or {}).get("value", ""),
            "author": (meta.get("Artist") or {}).get("value", "")[:120],
        })
    return results


# ─── Unsplash ─────────────────────────────────────────────────────────────────

def unsplash_search(query: str) -> list[dict[str, Any]]:
    if not UNSPLASH_KEY:
        return [{"skip": "UNSPLASH_ACCESS_KEY absent"}]
    try:
        r = requests.get(
            "https://api.unsplash.com/search/photos",
            params={"query": query, "per_page": MAX_RESULTS_PER_SOURCE, "orientation": "landscape"},
            headers={"Authorization": f"Client-ID {UNSPLASH_KEY}"},
            timeout=REQ_TIMEOUT,
        )
    except requests.RequestException as e:
        return [{"error": str(e)}]
    if r.status_code != 200:
        return [{"error": f"HTTP {r.status_code}"}]
    items = r.json().get("results", [])
    return [
        {
            "title": it.get("description") or it.get("alt_description") or "",
            "url": (it.get("urls") or {}).get("regular"),
            "thumb": (it.get("urls") or {}).get("small"),
            "width": it.get("width"),
            "height": it.get("height"),
            "license": "Unsplash License",
            "author": (it.get("user") or {}).get("name", ""),
        }
        for it in items
    ]


# ─── Pexels ───────────────────────────────────────────────────────────────────

def pexels_search(query: str) -> list[dict[str, Any]]:
    if not PEXELS_KEY:
        return [{"skip": "PEXELS_API_KEY absent"}]
    try:
        r = requests.get(
            "https://api.pexels.com/v1/search",
            params={"query": query, "per_page": MAX_RESULTS_PER_SOURCE, "orientation": "landscape"},
            headers={"Authorization": PEXELS_KEY},
            timeout=REQ_TIMEOUT,
        )
    except requests.RequestException as e:
        return [{"error": str(e)}]
    if r.status_code != 200:
        return [{"error": f"HTTP {r.status_code}"}]
    items = r.json().get("photos", [])
    return [
        {
            "title": it.get("alt", ""),
            "url": (it.get("src") or {}).get("large"),
            "thumb": (it.get("src") or {}).get("medium"),
            "width": it.get("width"),
            "height": it.get("height"),
            "license": "Pexels License",
            "author": it.get("photographer", ""),
        }
        for it in items
    ]


# ─── Build queries per projet ─────────────────────────────────────────────────

def typologie_guess(nom: str, chapitre: str) -> str:
    """Typologie heuristique — sert pour les queries génériques (Unsplash/Pexels)."""
    n = nom.lower()
    c = (chapitre or "").lower()
    if any(w in n for w in ["école", "ecole", "elementaire", "primaire", "maternelle"]):
        return "école primaire paris"
    if "college" in n or "collège" in n:
        return "collège paris"
    if "lycee" in n or "lycée" in n:
        return "lycée paris"
    if "gymnase" in n:
        return "gymnase paris"
    if "piscine" in n:
        return "piscine municipale paris"
    if "creche" in n or "crèche" in n:
        return "crèche paris"
    if "voirie" in n or "chaussée" in n or "trottoir" in n:
        return "voirie paris"
    if "jardin" in n or "parc" in n or "square" in n:
        return "parc jardin paris"
    if "mediathèque" in n or "bibliothèque" in n:
        return "bibliothèque paris"
    if "logement" in n or "logement social" in n:
        return "logement social paris"
    if "logement" in c or "habitat" in c:
        return "immeuble logement paris"
    if "culture" in c or "sport" in c:
        return "équipement culturel paris"
    return "bâtiment public paris"


def run_sample(year: int, limit: int) -> None:
    projets = load_projets(year)
    sample = stratified_sample(projets, limit)

    report_json: list[dict[str, Any]] = []
    md_lines: list[str] = [
        f"# Sample photo availability — {year} ({len(sample)} projets)",
        "",
        f"Sources testées : Wikimedia · Unsplash {'✅' if UNSPLASH_KEY else '⚠ sans clé'} · "
        f"Pexels {'✅' if PEXELS_KEY else '⚠ sans clé'}",
        "",
        f"Légende verdict : 🟢 ≥ 2 sources ont retourné qqch  ·  🟡 1 source  ·  🔴 rien",
        "",
    ]

    for i, p in enumerate(sample, 1):
        nom = (p.get("nom_projet") or "").strip()
        montant = float(p.get("montant") or 0)
        arr = p.get("arrondissement") or 0
        chapitre = p.get("chapitre_libelle") or ""
        tier = bucket_of(p)
        typologie = typologie_guess(nom, chapitre)

        q_wiki = nom[:80]
        q_generic = typologie

        print(f"\n[{i}/{len(sample)}] {tier.upper()} · {fmt_eur(montant)} · {nom[:70]}")
        wiki = wikimedia_search(q_wiki)
        time.sleep(0.2)
        wiki_generic = wikimedia_search(q_generic) if not any(r.get("url") for r in wiki) else []
        time.sleep(0.2)
        uns = unsplash_search(q_generic)
        time.sleep(0.2)
        pex = pexels_search(q_generic)

        wiki_ok = sum(1 for r in wiki if r.get("url"))
        wiki_generic_ok = sum(1 for r in wiki_generic if r.get("url"))
        uns_ok = sum(1 for r in uns if r.get("url"))
        pex_ok = sum(1 for r in pex if r.get("url"))
        sources_with_hits = sum(1 for v in [wiki_ok + wiki_generic_ok, uns_ok, pex_ok] if v > 0)
        verdict = "🟢" if sources_with_hits >= 2 else ("🟡" if sources_with_hits == 1 else "🔴")

        item = {
            "id": p.get("id"),
            "tier": tier,
            "nom": nom,
            "montant_eur": montant,
            "arrondissement": arr,
            "chapitre": chapitre,
            "typologie_guess": typologie,
            "queries": {"wiki": q_wiki, "generic": q_generic},
            "wiki_direct": wiki,
            "wiki_generic": wiki_generic,
            "unsplash": uns,
            "pexels": pex,
            "verdict": verdict,
        }
        report_json.append(item)

        # Markdown section
        md_lines.append(f"## {i}. {verdict}  `[{tier.upper()}]`  {nom}")
        md_lines.append("")
        md_lines.append(f"- **Montant** : {fmt_eur(montant)}")
        md_lines.append(f"- **Arrondissement** : {arr}ᵉ")
        md_lines.append(f"- **Chapitre** : {chapitre}")
        md_lines.append(f"- **Typologie devinée** : `{typologie}`")
        md_lines.append("")

        def render_source(name: str, items: list[dict[str, Any]], query: str) -> None:
            md_lines.append(f"### {name}  ·  query : `{query}`")
            if not items:
                md_lines.append("_aucun résultat_")
                md_lines.append("")
                return
            # Handle skip/error-only responses
            if all(("skip" in r or "error" in r) for r in items):
                reasons = ", ".join([r.get("skip") or r.get("error", "") for r in items])
                md_lines.append(f"⚠ {reasons}")
                md_lines.append("")
                return
            for r in items:
                if "skip" in r or "error" in r:
                    continue
                url = r.get("url") or ""
                thumb = r.get("thumb") or ""
                lic = r.get("license") or ""
                author = r.get("author") or ""
                title = r.get("title") or ""
                md_lines.append(f"- [{title[:60] or 'photo'}]({url}) · {lic} · {author[:60]}")
                if thumb:
                    md_lines.append(f"  ![thumb]({thumb})")
            md_lines.append("")

        render_source("Wikimedia (direct)", wiki, q_wiki)
        if wiki_generic:
            render_source("Wikimedia (fallback générique)", wiki_generic, q_generic)
        render_source("Unsplash", uns, q_generic)
        render_source("Pexels", pex, q_generic)
        md_lines.append("---")
        md_lines.append("")

    # Summary
    counts = {"🟢": 0, "🟡": 0, "🔴": 0}
    for r in report_json:
        counts[r["verdict"]] += 1
    md_lines.insert(
        3,
        f"**Verdict global** : 🟢 {counts['🟢']} · 🟡 {counts['🟡']} · 🔴 {counts['🔴']}  "
        f"(sur {len(report_json)} projets)",
    )

    md_path = OUT_DIR / "sample_photos_report.md"
    json_path = OUT_DIR / "sample_photos_report.json"
    md_path.write_text("\n".join(md_lines), encoding="utf-8")
    json_path.write_text(json.dumps(report_json, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n✅ Rapport : {md_path}")
    print(f"✅ JSON :   {json_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=2024)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--seed", type=int, default=42, help="reproducible sampling")
    args = parser.parse_args()

    random.seed(args.seed)
    run_sample(args.year, args.limit)


if __name__ == "__main__":
    main()
