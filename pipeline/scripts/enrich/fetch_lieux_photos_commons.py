#!/usr/bin/env python3
"""Repêchage photo via Wikimedia Commons, pour les lieux que Wikipédia n'a pas couverts.

`fetch_lieux_wiki.py` prend la vignette de l'article (pageimage) : elle manque
quand l'article n'en a pas, ou quand l'API a limité le débit. Ici on cherche
directement dans Commons, avec deux garde-fous :
  - le titre du fichier doit nommer le lieu (sinon « Philharmonie » attrape
    n'importe quoi — piège vérifié : le premier résultat était un portrait) ;
  - les logos, plans, cartes et blasons sont écartés (une fiche s'ouvre sur une
    photo du lieu, pas sur son logo étiré).
La licence est relevée et écrite à côté de la photo.

Usage : python pipeline/scripts/enrich/fetch_lieux_photos_commons.py
"""
from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "pipeline" / "cache" / "lieux"
PHOTOS = CACHE / "photos"
UA = {"User-Agent": "france-open-data/0.1 (recherche civique; franceopendata.org)"}

# Requête Commons par lieu : le nom qui donne des photos du lieu lui-même.
REQUETES = {
    "petite-ceinture": ("Petite Ceinture Paris railway", "ceinture"),
    "les-halles": ("Canopée des Halles Paris", "halles"),
    "piscine-georges-vallerey": ("Piscine Georges Vallerey", "vallerey"),
    "theatre-du-chatelet": ("Théâtre du Châtelet", "chatelet"),
    "centquatre": ("Centquatre Paris", "centquatre"),
    "parc-montsouris": ("Parc Montsouris lac", "montsouris"),
    "parc-de-bercy": ("Parc de Bercy", "bercy"),
}
REJET = re.compile(r"logo|plan|map|carte|blason|coat.of.arms|diagram|icon|svg", re.I)
# Mots d'un AUTRE lieu du seed : un fichier qui les nomme illustre l'autre lieu.
AUTRES = {slug: [m for s2, (_, m) in REQUETES.items() if s2 != slug] for slug in REQUETES}


def norm(s: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"[\s\-’']+", " ", s)


def api(params: dict) -> dict:
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=45))


def main() -> int:
    PHOTOS.mkdir(parents=True, exist_ok=True)
    meta_p = CACHE / "photos_meta.json"
    meta = json.load(open(meta_p)) if meta_p.exists() else {}

    vues: set[str] = set()
    for slug, (query, must) in REQUETES.items():
        if (PHOTOS / f"{slug}.jpg").exists():
            continue
        try:
            j = api({"action": "query", "generator": "search",
                     "gsrsearch": f"filetype:bitmap {query}", "gsrnamespace": "6", "gsrlimit": "10",
                     "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": "560",
                     "format": "json"})
        except Exception as exc:
            print(f"ERR {slug}: {type(exc).__name__}", file=sys.stderr)
            time.sleep(5)
            continue

        pages = sorted((j.get("query", {}) or {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
        for p in pages:
            title = p.get("title", "")
            nt = norm(title)
            if REJET.search(title) or must not in nt:
                continue
            if any(a in nt for a in AUTRES[slug]):
                continue  # le titre nomme un autre lieu du seed → ambigu
            ii = (p.get("imageinfo") or [{}])[0]
            md = ii.get("extmetadata") or {}
            lic = (md.get("LicenseShortName", {}) or {}).get("value", "")
            if not ii.get("thumburl") or "Fair use" in lic:
                continue
            if title in vues:
                continue  # déjà utilisé pour un autre lieu
            try:
                (PHOTOS / f"{slug}.jpg").write_bytes(
                    urllib.request.urlopen(urllib.request.Request(ii["thumburl"], headers=UA), timeout=45).read())
                vues.add(title)
            except Exception as exc:
                print(f"ERR {slug} download: {type(exc).__name__}", file=sys.stderr)
                break
            meta[slug] = {"title": title, "license": lic,
                          "artist": re.sub(r"<[^>]+>", "", (md.get("Artist", {}) or {}).get("value", ""))[:80],
                          "page": ii.get("descriptionurl", "")}
            print(f"OK  {slug:<26} {lic:<16} {title[:46]}")
            time.sleep(2.5)
            break
        else:
            print(f"--  {slug}: rien d'utilisable")

    json.dump(meta, open(meta_p, "w"), ensure_ascii=False, indent=1)
    print(f"\nphotos : {len(list(PHOTOS.glob('*.jpg')))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
