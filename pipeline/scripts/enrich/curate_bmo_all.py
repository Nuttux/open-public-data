#!/usr/bin/env python3
"""Curation BMO GÉNÉRALE et bornée : des extraits pour TOUS les lieux, pas 3.

Pourquoi borner. Le raw compte ~48 000 fascicules (médiane 740 par lieu) et
ContentSearch coûte une requête PAR fascicule : tout traiter, c'est des jours de
trafic sur Gallica. Or la fiche n'affiche que ~5 extraits. On échantillonne donc
les fascicules LES PLUS ANCIENS (là où est la valeur historique : 1890-1930), ce
qui suffit largement à en sortir cinq bons — et on le dit sur la fiche.

Garde-fous conservés de curate_bmo_snippets.py : Gallica racinise (« Amiraux » →
« Amiral-Roussin »), donc on n'accepte que les snippets contenant le terme EXACT.
La pertinence réelle (parler DU LIEU et pas seulement de la rue homonyme) est
jugée après, par judge_bmo_snippets.workflow.js.

Usage : python pipeline/scripts/enrich/curate_bmo_all.py [--par-lieu 30]
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "seed_lieux_v1.csv"
CACHE = ROOT / "pipeline" / "cache" / "lieux"
UA = {"User-Agent": "qipu/0.1 (recherche civique; qipu.org)"}

GENERIQUES = {
    "place", "musee", "theatre", "parc", "piscine", "jardin", "square", "marche",
    "mairie", "bibliotheque", "mediatheque", "fontaine", "bois", "stade", "halle",
    "conservatoire", "maison", "arenes", "bourse", "coulee", "verte", "de", "du",
    "des", "la", "le", "les", "paris", "cite", "porte", "centre", "salle",
}


def norm(s: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^A-Za-z0-9]+", " ", s)


MOTS_VIDES = {"de", "du", "des", "la", "le", "les", "d", "l", "a", "au", "aux", "et", "en"}


def mots_requis(query: str) -> list[str]:
    """Mots que l'extrait doit TOUS contenir, tirés de la requête curée du seed
    (`bmo_query`, ex. « canal Saint-Martin », « marché Saint-Pierre »).

    Exiger UN SEUL mot — le plus long du nom — était le grand défaut de la
    première version : on cherchait « Martin » (rue Saint-Martin), « Palais »
    (Palais de Justice), « Pierre » (prénom de conseillers), « travail »,
    « moderne », « romantique ». Exiger TOUS les mots significatifs de la phrase
    élimine ces homonymes à la source, avant même le juge."""
    ws = [norm(w).lower() for w in re.split(r"[\s'’\-]+", query) if w]
    return [w for w in ws if w and w not in MOTS_VIDES and len(w) > 2]


def nettoyer(brut: str) -> str:
    """Gallica renvoie du balisage DOUBLEMENT échappé. Dépouiller les balises
    AVANT de dés-échapper laissait ressortir `<span class='highlight'>` et des
    entités brutes (`&#176;`, `&apos;`, `&#233;`) jusque dans la citation
    publiée. On dés-échappe donc jusqu'à stabilité, PUIS on retire les balises,
    puis on repasse — sinon le lecteur voit du HTML dans une archive de 1882."""
    txt = brut
    for _ in range(4):
        suivant = html.unescape(txt)
        if suivant == txt:
            break
        txt = suivant
    txt = re.sub(r"<[^>]*>", " ", txt)
    txt = html.unescape(txt)
    txt = re.sub(r"<[^>]*>", " ", txt)
    return re.sub(r"\s+", " ", txt).strip()


def content_search(ark: str, query: str) -> list[dict]:
    u = "https://gallica.bnf.fr/services/ContentSearch?" + urllib.parse.urlencode({"ark": ark, "query": query})
    x = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40).read().decode("utf-8", "replace")
    out = []
    for pid, content in re.findall(r"<p_id>PAG_(\d+)</p_id>.*?<content>(.*?)</content>", x, re.S):
        txt = nettoyer(content)
        if txt:
            out.append({"page": int(pid), "snippet": txt[:300]})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--par-lieu", type=int, default=30, help="fascicules les plus anciens par lieu")
    ap.add_argument("--max-snippets", type=int, default=12, help="extraits gardés par lieu")
    ap.add_argument("--only", help="slugs à traiter, séparés par des virgules")
    ap.add_argument("--redo", action="store_true",
                    help="retraite un lieu même si ses snippets existent (écrase)")
    args = ap.parse_args()

    seed = {r["slug"]: r for r in csv.DictReader(SEED.open())}
    if args.only:
        veut = {s.strip() for s in args.only.split(",") if s.strip()}
        inconnus = veut - set(seed)
        if inconnus:
            print(f"ERR slugs absents du seed : {sorted(inconnus)}", file=sys.stderr)
            return 1
        seed = {k: v for k, v in seed.items() if k in veut}
    total_ok = 0
    for slug, row in seed.items():
        raw = CACHE / f"{slug}_bmo.jsonl"
        out_p = CACHE / f"{slug}_bmo_snippets.jsonl"
        if not raw.exists() or (out_p.exists() and not args.redo):
            continue
        query = (row.get("bmo_query") or row["name"]).strip()
        rows = [json.loads(l) for l in raw.open()]
        rows.sort(key=lambda r: r.get("issue_date") or "9999")
        # Échantillon ÉTALÉ sur toute la période, pas les N plus anciens : le BMO
        # court de 1882 à 1985 et l'histoire d'un lieu ne tient pas dans ses
        # trente premiers fascicules (la piscine des Amiraux se construit en 1928,
        # se refait en 1964). On prend un fascicule tous les k pour couvrir le
        # siècle, ce qui donne un récit qui traverse vraiment le temps.
        if len(rows) > args.par_lieu:
            k = len(rows) / args.par_lieu
            rows = [rows[int(i * k)] for i in range(args.par_lieu)]

        # Un fascicule trouvé au sync sous un nom d'époque (« place du Trône »,
        # « Théâtre Sarah-Bernhardt ») ne contient PAS le nom moderne : on
        # l'interroge sous le nom qui l'a fait matcher (champ `query` de la
        # ligne raw), repli sur bmo_query pour les caches d'avant le multi-nom.
        req_par_nom: dict[str, list[str]] = {}
        found: list[dict] = []
        for r in rows:
            q = (r.get("query") or query).strip()
            if q not in req_par_nom:
                req_par_nom[q] = mots_requis(q)
            req = req_par_nom[q]
            if not req:
                continue
            ark = (r.get("gallica_url") or "").split("gallica.bnf.fr/")[-1]
            if not ark.startswith("ark:"):
                continue
            try:
                snips = content_search(ark, q)
            except Exception:
                time.sleep(3)
                continue
            for s in snips:
                # Gallica racinise et cherche mot à mot : on exige que TOUS les
                # mots significatifs de la phrase soient présents dans l'extrait.
                mots = set(norm(s["snippet"]).lower().split())
                if not all(w in mots for w in req):
                    continue
                found.append({
                    "lieu_slug": slug, "term": q, "issue_date": r.get("issue_date"),
                    "ark": ark, "page": s["page"], "snippet": s["snippet"],
                    "page_url": f"https://gallica.bnf.fr/{ark}/f{s['page']}.item",
                    "source": r.get("source", "Gallica / BnF — Bulletin Municipal Officiel de la Ville de Paris"),
                    "_synced_at": datetime.now(timezone.utc).isoformat(),
                })
                break  # un extrait par fascicule suffit
            time.sleep(1.1)
            if len(found) >= args.max_snippets:
                break

        if found:
            out_p.write_text("\n".join(json.dumps(f, ensure_ascii=False) for f in found))
            total_ok += 1
            print(f"OK  {slug:<44} {len(found):>2} extraits (« {query} », {len(rows)} fascicules lus)")
        else:
            print(f"--  {slug}: aucun extrait exact (« {query} »)")

    print(f"\nlieux avec extraits : {total_ok}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
