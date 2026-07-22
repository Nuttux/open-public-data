#!/usr/bin/env python3
"""Passe photo GÉNÉRALE : une image Commons pour chaque lieu du seed qui n'en a pas.

`fetch_lieux_photos_commons.py` ne traite qu'une liste codée en dur (repêchage
ponctuel). Ici on balaye tout le seed avec les mêmes garde-fous, éprouvés :
  - le titre du fichier doit contenir un mot DISTINCTIF du lieu (« Vosges »,
    « Bourdelle »…), sinon une requête large ramène n'importe quoi ;
  - il ne doit pas nommer un AUTRE lieu du seed (piège « Châtelet » : la place
    et le théâtre) ;
  - logos, plans, cartes, blasons et SVG écartés — une fiche s'ouvre sur une
    photo du lieu ;
  - une même image n'est jamais réutilisée pour deux lieux.
Licence + auteur relevés dans photos_meta.json (crédit affiché sur la fiche).

Usage : python pipeline/scripts/enrich/fetch_lieux_photos_all.py
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
UA = {"User-Agent": "qipu/0.1 (recherche civique; qipu.org)"}

REJET = re.compile(
    r"logo|plan\b|map\b|carte|blason|coat.of.arms|diagram|icon|\.svg|schema|affiche|poster"
    # Gros plans : Commons remonte souvent des détails avant une vue d'ensemble
    # (7 « porte du n° … » avant la moindre photo de la place des Vosges). Une
    # carte-lieu doit montrer le LIEU, pas la serrure de sa porte.
    r"|porte du|porte n|d[ée]tail|plaque|inscription|escalier|fen[êe]tre|grille"
    r"|serrure|heurtoir|balcon|buste|panneau|enseigne",
    re.I)

# Mots trop génériques pour identifier un lieu : ils ne peuvent pas servir de
# preuve que le fichier montre CE lieu.
GENERIQUES = {
    "place", "musee", "theatre", "parc", "piscine", "jardin", "square", "marche",
    "mairie", "bibliotheque", "mediatheque", "fontaine", "bois", "stade", "halle",
    "conservatoire", "maison", "arenes", "bourse", "coulee", "verte", "de", "du",
    "des", "la", "le", "les", "l", "d", "a", "au", "aux", "et", "en", "paris",
    "saint", "sainte", "arrondissement", "municipal", "municipale", "ville",
    "centre", "espace", "salle", "cite", "porte", "grand", "grande", "petit",
    "petite", "nouveau", "nouvelle", "national", "nationale",
}


def norm(s: str) -> str:
    """Minuscules sans accents, toute ponctuation → espace. Indispensable : le
    rapprochement se fait ensuite MOT À MOT, jamais en sous-chaîne (« ile » de
    l'île de la Cité matchait à l'intérieur de « File: » — préfixe présent dans
    TOUS les titres Commons, ce qui rejetait 100 % des résultats)."""
    s = "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def tokens(name: str) -> list[str]:
    """Mots distinctifs d'un nom de lieu (hors génériques), les plus longs d'abord."""
    ws = [w for w in norm(name).split() if len(w) > 2 and w not in GENERIQUES]
    return sorted(set(ws), key=len, reverse=True)


def api(params: dict, tries: int = 4) -> dict:
    """Commons throttle : un 429/5xx en rafale faisait échouer la moitié des lieux.
    On réessaie avec un recul croissant plutôt que d'abandonner le lieu."""
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    last: Exception | None = None
    for i in range(tries):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=45))
        except Exception as exc:  # noqa: BLE001 — on veut réessayer sur tout transport
            last = exc
            time.sleep(3 * (i + 1))
    raise last if last else RuntimeError("commons unreachable")


def main() -> int:
    PHOTOS.mkdir(parents=True, exist_ok=True)
    meta_p = CACHE / "photos_meta.json"
    meta = json.load(open(meta_p)) if meta_p.exists() else {}

    rows = list(csv.DictReader(SEED.open()))
    toks = {r["slug"]: tokens(r["name"]) for r in rows}
    # Jetons appartenant à un AUTRE lieu → un fichier qui les nomme est ambigu.
    autres = {
        r["slug"]: {t for s2, ts in toks.items() if s2 != r["slug"] for t in ts} - set(toks[r["slug"]])
        for r in rows
    }

    vues = {m.get("title") for m in meta.values() if isinstance(m, dict)}
    ok = skip = ko = 0
    for r in rows:
        slug, name = r["slug"], r["name"]
        if (PHOTOS / f"{slug}.jpg").exists():
            skip += 1
            continue
        must = toks[slug]
        if not must:
            print(f"--  {slug}: aucun mot distinctif", file=sys.stderr)
            ko += 1
            continue
        query = f"{name} Paris" if "paris" not in norm(name) else name
        try:
            j = api({"action": "query", "generator": "search",
                     "gsrsearch": f"filetype:bitmap {query}", "gsrnamespace": "6", "gsrlimit": "20",
                     "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": "560",
                     "format": "json"})
        except Exception as exc:
            print(f"ERR {slug}: {type(exc).__name__}", file=sys.stderr)
            time.sleep(5)
            ko += 1
            continue

        pages = sorted((j.get("query", {}) or {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
        for p in pages:
            title = p.get("title", "")
            # « File: » est un préfixe de namespace, pas une partie du nom.
            mots = set(norm(title.split(":", 1)[-1]).split())
            if REJET.search(title):
                continue
            if not (mots & set(must)):                   # ne nomme pas ce lieu
                continue
            if mots & autres[slug]:                      # nomme un autre lieu du seed
                continue
            ii = (p.get("imageinfo") or [{}])[0]
            md = ii.get("extmetadata") or {}
            lic = (md.get("LicenseShortName", {}) or {}).get("value", "")
            if not ii.get("thumburl") or "Fair use" in lic:
                continue
            if title in vues:
                continue
            data = None
            for i in range(4):  # le téléchargement aussi est throttlé : on réessaie
                try:
                    data = urllib.request.urlopen(
                        urllib.request.Request(ii["thumburl"], headers=UA), timeout=45).read()
                    break
                except Exception:
                    time.sleep(3 * (i + 1))
            if not data:
                print(f"ERR {slug} download après retries", file=sys.stderr)
                continue  # on tente l'image suivante, on n'abandonne pas le lieu
            (PHOTOS / f"{slug}.jpg").write_bytes(data)
            vues.add(title)
            meta[slug] = {"title": title, "license": lic,
                          "artist": re.sub(r"<[^>]+>", "", (md.get("Artist", {}) or {}).get("value", ""))[:80],
                          "page": ii.get("descriptionurl", "")}
            ok += 1
            print(f"OK  {slug:<44} {lic:<14} {title[:44]}")
            time.sleep(1.5)
            break
        else:
            ko += 1
            print(f"--  {slug}: rien d'utilisable")

    json.dump(meta, open(meta_p, "w"), ensure_ascii=False, indent=1)
    print(f"\najoutées={ok} déjà là={skip} sans photo={ko} · total {len(list(PHOTOS.glob('*.jpg')))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
