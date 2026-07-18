#!/usr/bin/env python3
"""Prépare les contextes de lecture d'un lieu : sélection → texte → fenêtres.

Le « PDF » de Débat-Délibs sert en fait le corps du document en HTML (vérifié
2026-07-17) : pas d'OCR, texte propre. On sélectionne les documents à lire,
on récupère leur texte, et on extrait des fenêtres de ±1200 caractères autour
de chaque mention du lieu — c'est ce que l'agent lit ensuite.

Sélection (dans l'ordre) :
  1. title_match → les documents dont le titre nomme le lieu ;
  2. sinon, petit corpus (≤ SMALL) → tout (cas Amiraux : le lieu n'apparaît
     que dans le corps des digests de séance) ;
  3. sinon → tête du classement Solr (le portail trie par pertinence :
     vérifié — page 1 pertinente, page 60 = « Condoléances »).
Le mode retenu est écrit dans la sortie : la couverture doit rester lisible.

Usage :
    python pipeline/scripts/enrich/prep_lieu_contexts.py --slug les-halles
    python pipeline/scripts/enrich/prep_lieu_contexts.py --all --workers 4
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import csv
import html
import json
import os
import re
import sys
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "seed_lieux_v1.csv"
CACHE = ROOT / "pipeline" / "cache" / "lieux"
UA = {"User-Agent": "france-open-data/0.1 (recherche civique; franceopendata.org)"}

MAX_DOCS = 45      # plafond de lecture par lieu — coût maîtrisé, couverture déclarée
SMALL = 60         # en dessous, on lit tout le corpus
WINDOW = 1200      # ±caractères autour d'une mention


def norm(s: str) -> str:
    s = "".join(c for c in unicodedata.normalize("NFD", s.lower())
                if unicodedata.category(c) != "Mn")
    return re.sub(r"[\s\-’']+", " ", s).strip()


def fetch_text(doc: dict, slug: str) -> str | None:
    d = CACHE / "txt" / slug
    d.mkdir(parents=True, exist_ok=True)
    p = d / f"{doc['id_document']}.txt"
    if p.exists() and p.stat().st_size > 400:
        return p.read_text()
    try:
        raw = urllib.request.urlopen(
            urllib.request.Request(doc["pdf_url"], headers=UA), timeout=60
        ).read().decode("latin-1", "ignore")
    except Exception:
        return None
    txt = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", raw)))
    p.write_text(txt)
    return txt


def select(rows: list[dict]) -> tuple[list[dict], str]:
    tm = [r for r in rows if r.get("title_match")]
    if tm:
        return tm[:MAX_DOCS], f"titre nommant le lieu ({len(tm)} trouvés)"
    if len(rows) <= SMALL:
        return rows, f"corpus complet ({len(rows)} documents)"
    return rows[:MAX_DOCS], f"tête du classement Solr ({len(rows)} documents au total)"


def prep(slug: str, phrase: str, workers: int = 4) -> dict | None:
    src = CACHE / f"{slug}_delibs.jsonl"
    if not src.exists():
        return None
    rows = [json.loads(l) for l in src.open()]
    sel, mode = select(rows)
    pat = re.compile("[\\s\\-]+".join(re.escape(t) for t in phrase.split()), re.I)

    out = []
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        texts = list(ex.map(lambda d: (d, fetch_text(d, slug)), sel))
    for doc, txt in texts:
        if not txt:
            continue
        ctxs = []
        for m in list(pat.finditer(txt))[:6]:
            a, b = max(0, m.start() - WINDOW), min(len(txt), m.end() + WINDOW)
            ctxs.append(txt[a:b])
        out.append({
            "id": doc["id_document"], "seance": doc.get("seance"),
            "reference": doc.get("reference"), "titre": doc.get("titre"),
            "source_url": doc.get("source_url"),
            "n_mentions": len(pat.findall(txt)), "contexts": ctxs,
        })
    payload = {"slug": slug, "phrase": phrase, "selection_mode": mode,
               "n_total_docs": len(rows), "n_lus": len(out), "docs": out}
    (CACHE / f"{slug}_ctx.json").write_text(json.dumps(payload, ensure_ascii=False))
    chars = sum(len(c) for d in out for c in d["contexts"])
    print(f"{slug:<30} {len(out):>3} lus / {len(rows):<5} | {chars//1000:>4}k chars | {mode}")
    return payload


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--skip-existing", action="store_true")
    args = ap.parse_args()

    seed = {r["slug"]: r for r in csv.DictReader(SEED.open())}
    slugs = [args.slug] if args.slug else list(seed)
    for slug in slugs:
        if slug not in seed:
            print(f"{slug}: absent du seed", file=sys.stderr)
            continue
        if args.skip_existing and (CACHE / f"{slug}_ctx.json").exists():
            continue
        if not (CACHE / f"{slug}_delibs.jsonl").exists():
            continue
        try:
            prep(slug, seed[slug]["title_phrase"], args.workers)
        except Exception as exc:
            print(f"{slug}: ERR {type(exc).__name__} {exc}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
