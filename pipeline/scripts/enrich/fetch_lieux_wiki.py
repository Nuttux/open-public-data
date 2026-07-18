#!/usr/bin/env python3
"""Présentation + photo de chaque lieu depuis Wikipédia FR.

Même principe que l'enrichissement photo des projets : on ne devine pas une
URL d'image, on demande à l'API le résumé et la vignette d'un article dont on
a vérifié le titre. Un article dont le titre ne contient pas le nom du lieu est
rejeté (sinon « Philharmonie de Paris » attrape n'importe quoi).

Sortie : pipeline/cache/lieux/wiki_summaries.json + photos/{slug}.jpg

Usage : python pipeline/scripts/enrich/fetch_lieux_wiki.py
"""
from __future__ import annotations

import csv
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "seed_lieux_v1.csv"
CACHE = ROOT / "pipeline" / "cache" / "lieux"
PHOTOS = CACHE / "photos"
UA = {"User-Agent": "france-open-data/0.1 (recherche civique; franceopendata.org)"}

# Titres d'article quand le nom du seed ne suffit pas (vérifiés à la main).
TITRES = {
    "theatre-de-la-ville": "Théâtre de la Ville",
    "les-halles": "Forum des Halles",
    "centquatre": "Centquatre-Paris",
    "petite-ceinture": "Ligne de Petite Ceinture",
    "porte-maillot": "Porte Maillot",
    "piscine-butte-aux-cailles": "Piscine de la Butte-aux-Cailles",
    "maison-des-metallos": "Maison des Métallos",
    "carreau-du-temple": "Carreau du Temple",
    "gaite-lyrique": "Gaîté lyrique",
    # Musées, théâtres et monuments — titres d'article vérifiés à la main.
    "musee-carnavalet": "Musée Carnavalet",
    "petit-palais": "Petit Palais",
    "musee-d-art-moderne-de-paris": "Musée d'Art moderne de Paris",
    "musee-cernuschi": "Musée Cernuschi",
    "musee-cognacq-jay": "Musée Cognacq-Jay",
    "musee-bourdelle": "Musée Bourdelle",
    "musee-zadkine": "Musée Zadkine",
    "musee-de-la-vie-romantique": "Musée de la Vie romantique",
    "maison-de-balzac": "Maison de Balzac",
    "maison-de-victor-hugo": "Maison de Victor Hugo",
    "palais-galliera": "Palais Galliera",
    "memorial-du-marechal-leclerc-et-musee-jean-moulin": "Musée de la Libération de Paris - musée du général Leclerc - musée Jean Moulin",
    "crypte-archeologique-de-l-ile-de-la-cite": "Crypte archéologique de l'île de la Cité",
    "catacombes-de-paris": "Catacombes de Paris",
    "theatre-du-rond-point": "Théâtre du Rond-Point",
    "theatre-silvia-monfort": "Théâtre Silvia-Monfort",
    "theatre-paris-villette": "Théâtre Paris-Villette",
    "theatre-14": "Théâtre 14 Jean-Marie Serreau",
    "pere-lachaise": "Cimetière du Père-Lachaise",
    "gymnase-japy": "Gymnase Japy",
    "bourse-du-travail": "Bourse du travail de Paris",
    "pavillon-de-larsenal": "Pavillon de l'Arsenal",
    "mediatheque-james-baldwin": "Médiathèque James-Baldwin",
    "stade-charlety": "Stade Sébastien-Charléty",
    "adidas-arena": "Adidas Arena",
    "colonne-de-juillet": "Colonne de Juillet",
    "cirque-d-hiver": "Cirque d'Hiver",
    "parc-de-la-villette": "Parc de la Villette",
    "parc-de-belleville": "Parc de Belleville",
    "parc-georges-brassens": "Parc Georges-Brassens",
    "serres-dauteuil": "Jardin des serres d'Auteuil",
    "canal-saint-martin": "Canal Saint-Martin",
    "marche-daligre": "Marché d'Aligre",
    "marche-saint-quentin": "Marché Saint-Quentin",
    "place-de-la-bastille": "Place de la Bastille",
    "place-de-la-nation": "Place de la Nation",
    "place-de-la-republique": "Place de la République",
    "hotel-de-ville": "Hôtel de ville de Paris",
    "porte-de-la-chapelle": "Porte de la Chapelle",
    "porte-de-montreuil": "Porte de Montreuil",
    "piscine-belliard": "Piscine Belliard",
}


def norm(s: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"[\s\-’']+", " ", s).strip()


def get(url: str, timeout: int = 40) -> bytes:
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def summary(title: str) -> dict | None:
    url = "https://fr.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(title.replace(" ", "_"))
    try:
        j = json.loads(get(url))
    except Exception:
        return None
    if j.get("type") == "disambiguation" or not j.get("extract"):
        return None
    return j


def main() -> int:
    PHOTOS.mkdir(parents=True, exist_ok=True)
    out = json.load(open(CACHE / "wiki_summaries.json")) if (CACHE / "wiki_summaries.json").exists() else {}
    rows = list(csv.DictReader(SEED.open()))

    for r in rows:
        slug, name = r["slug"], r["name"]
        if not (CACHE / f"{slug}_delibs.jsonl").exists():
            continue
        if out.get(slug, {}).get("extract"):
            continue

        j = None
        verifie = False  # titre vérifié à la main → le garde-fou ne s'applique pas
        for cand in [TITRES.get(slug), name, f"{name} (Paris)"]:
            if not cand:
                continue
            j = summary(cand)
            time.sleep(1.5)
            if j:
                verifie = cand == TITRES.get(slug)
                break
        if not j:
            print(f"--  {slug}: aucun article", file=sys.stderr)
            continue

        # Garde-fou : le titre de l'article doit nommer le lieu — un nom de seed
        # générique ne doit pas capturer un article voisin. Sauf quand le titre
        # vient de TITRES : il a déjà été vérifié (« Les Halles » → « Forum des
        # Halles » est correct et serait rejeté ici).
        key = norm(re.sub(r"^(Piscine|Parc|Jardin|Square|Place|Théâtre|Marché|Tour) ", "", name))
        if not verifie and key and key not in norm(j["title"]) and norm(name) not in norm(j["title"]):
            print(f"--  {slug}: « {j['title']} » ne nomme pas le lieu, rejeté", file=sys.stderr)
            continue

        rec = {
            "title": j["title"],
            "extract": j["extract"],
            "thumb": (j.get("thumbnail") or {}).get("source"),
            "url": j["content_urls"]["desktop"]["page"],
        }
        fn = PHOTOS / f"{slug}.jpg"
        if rec["thumb"] and not fn.exists():
            try:
                fn.write_bytes(get(rec["thumb"]))
                time.sleep(2.0)
            except Exception as exc:
                print(f"    {slug}: photo KO ({type(exc).__name__})", file=sys.stderr)
        out[slug] = rec
        print(f"OK  {slug:<28} {j['title'][:38]:<38} photo={'oui' if fn.exists() else 'non'}")
        json.dump(out, open(CACHE / "wiki_summaries.json", "w"), ensure_ascii=False, indent=1)

    have = sum(1 for r in rows if out.get(r["slug"], {}).get("extract"))
    print(f"\nrésumés : {have} lieux")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
