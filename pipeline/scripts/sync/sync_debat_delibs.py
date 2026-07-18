#!/usr/bin/env python3
"""Sync ciblé Débat-Délibs (Conseil de Paris) pour les lieux v0.

Interroge la recherche Solr de l'archive officielle des délibérations
(https://a06-v7.apps.paris.fr/a06/, Lutèce/Solr, vérifié 2026-07-17) et
écrit une ligne JSONL par document trouvé : id, titre, séance, référence
officielle (ex. « 2025 DAC 83 »), instance, URLs page + PDF.

Pas d'extraction de contenu ici — raw d'abord (règle : toute donnée
entre par raw → stg → core → mart). La lecture des PDF vient en
enrichissement, avec citation par document.

Notes de recon (2026-07-17) :
- `page=search-solr&query=X&page_index=N` pagine ; sans guillemets le
  Solr OR-matche chaque mot (« piscine des Amiraux » → >500 docs de
  bruit) ; la phrase quotée resserre au périmètre du lieu.
- Chaque résultat est un bloc `itemODS` : titre dans `<h3><a ...
  display_document&id_document=N>`, métas positionnelles (séance, type,
  référence, instance), PDF via `DoDownload.jsp?id_document=N`.

Usage :
    python pipeline/scripts/sync/sync_debat_delibs.py            # les 4 lieux v0
    python pipeline/scripts/sync/sync_debat_delibs.py --query "piscine des Amiraux" --slug piscine-des-amiraux
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://a06-v7.apps.paris.fr/a06/jsp/site/Portal.jsp"
PDF = "https://a06-v7.apps.paris.fr/a06/jsp/site/plugins/solr/modules/ods/DoDownload.jsp"
UA = {"User-Agent": "france-open-data/0.1 (recherche civique; franceopendata.org)"}
ROOT = Path(__file__).resolve().parents[3]
OUT_DIR = ROOT / "pipeline" / "cache" / "lieux"

# Lieux v0 — voir docs/paris-lieux/PLAN.md. La requête est le nom usuel
# du lieu : précision d'abord, rappel ensuite.
# (requête Solr AND, phrase exacte pour le flag title_match)
LIEUX_V0 = {
    "piscine-des-amiraux": ("piscine AND Amiraux", "Amiraux"),
    "philharmonie-de-paris": ("Philharmonie", "Philharmonie"),
    "theatre-de-la-ville": ("Théâtre AND Ville AND Châtelet", "Théâtre de la Ville"),
    "porte-maillot": ("Porte AND Maillot", "Maillot"),
}

ITEM_RE = re.compile(r'class="itemODS"(.*?)(?=class="itemODS"|$)', re.S)
TITLE_RE = re.compile(r'display_document&id_document=(\d+)[^"]*"\s*>(.*?)</a>', re.S)
META_RE = re.compile(r'itemODS_meta-item"[^>]*>(.*?)</div>', re.S)


def fetch(url: str, timeout: int = 60) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")


def clean(fragment: str) -> str:
    txt = html.unescape(re.sub(r"<[^>]+>", " ", fragment))
    return re.sub(r"\s+", " ", txt).strip()


def norm(s: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


def search(query: str, max_pages: int = 40, page_size: int = 50) -> list[dict]:
    """Toutes les pages de résultats, dédupliquées par id.

    Le Solr accepte AND mais pas les phrases quotées (vérifié 2026-07-17 :
    "piscine des Amiraux" quoté → 0 ; piscine AND Amiraux → résultats).
    La précision fine se joue en stg via le flag title_match posé ici.
    """
    seen: dict[str, dict] = {}
    for page in range(max_pages):
        params = {
            "page": "search-solr",
            "query": query,
            "items_per_page": str(page_size),
            "page_index": str(page + 1),
        }
        html_text = fetch(BASE + "?" + urllib.parse.urlencode(params))
        found_this_page = 0
        for block in ITEM_RE.findall(html_text):
            tm = TITLE_RE.search(block)
            if not tm:
                continue
            doc_id, title = tm.group(1), clean(tm.group(2))
            if doc_id in seen or not title:
                continue
            metas = [m for m in (clean(x) for x in META_RE.findall(block)) if m]
            # Champs dérivés par motif, pas par position : les métas glissent
            # quand un document (vœu, question) n'a pas de référence officielle.
            seance = next((m for m in metas if re.match(r"^[A-ZÉÛ]+ \d{4}$", m)), None)
            reference = next((m for m in metas if re.match(r"^\d{4} [A-Z]{1,6} ", m)), None)
            instance = next((m for m in metas if "onseil" in m), None)
            type_doc = next((m for m in metas if m not in (seance, reference, instance)), None)
            seen[doc_id] = {
                "id_document": doc_id,
                "titre": title[:500],  # NB : le portail tronque les titres longs — titre complet via la page doc (L1)
                "metas_raw": metas,
                "seance": seance,
                "type_document": type_doc,
                "reference": reference,
                "instance": instance,
                "source_url": f"{BASE}?page=ods-solr.display_document&id_document={doc_id}",
                "pdf_url": f"{PDF}?id_document={doc_id}",
            }
            found_this_page += 1
        if found_this_page == 0:
            break
        time.sleep(1.0)
    return list(seen.values())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--query", help="requête unique (sinon : lieux v0)")
    ap.add_argument("--slug", help="slug de sortie pour --query", default="adhoc")
    ap.add_argument("--phrase", help="phrase exacte pour le flag title_match (défaut : --query, "
                                     "ce qui ne matche jamais si la requête contient des opérateurs)")
    args = ap.parse_args()

    targets = {args.slug: (args.query, args.phrase or args.query)} if args.query else LIEUX_V0
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    synced_at = datetime.now(timezone.utc).isoformat()

    for slug, (query, phrase) in targets.items():
        try:
            rows = search(query)
            for r in rows:
                r["title_match"] = norm(phrase) in norm(r["titre"])
        except Exception as exc:  # un lieu qui échoue ne bloque pas les autres
            print(f"ERR {slug}: {type(exc).__name__} {exc}", file=sys.stderr)
            continue
        out = OUT_DIR / f"{slug}_delibs.jsonl"
        with out.open("w") as f:
            for r in rows:
                r.update({
                    "lieu_slug": slug,
                    "query": query,
                    "title_phrase": phrase,
                    "source": "Débat-Délibs — Conseil de Paris",
                    "source_portal": "https://a06-v7.apps.paris.fr/a06/",
                    "_synced_at": synced_at,
                })
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        tm = sum(1 for r in rows if r.get("title_match"))
        print(f"{slug}: {len(rows)} documents ({tm} title_match) -> {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
