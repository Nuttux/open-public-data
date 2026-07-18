#!/usr/bin/env python3
"""Re-nettoie les extraits BMO déjà téléchargés (sans retoucher Gallica).

Les premières curations dépouillaient les balises AVANT de dés-échapper le HTML :
`&lt;span class='highlight'&gt;` redevenait une vraie balise APRÈS le nettoyage et
partait telle quelle dans la citation publiée, avec des entités brutes
(`&#176;`, `&apos;`, `&#233;`). Résultat à l'écran :

  « 2&#176; De M. Hallez d&apos;Arros … au Petit <span class='highlight'>Palais</span> »

Ce script réapplique le bon ordre sur les fichiers existants. Idempotent.

Usage : python pipeline/scripts/enrich/clean_bmo_snippets.py
"""
from __future__ import annotations

import glob
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CACHE = ROOT / "pipeline" / "cache" / "lieux"


def nettoyer(brut: str) -> str:
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


def main() -> int:
    touches = corriges = 0
    for p in sorted(glob.glob(str(CACHE / "*_bmo_snippets.jsonl"))):
        lignes = [json.loads(l) for l in Path(p).open() if l.strip()]
        change = False
        for r in lignes:
            avant = r.get("snippet") or ""
            apres = nettoyer(avant)
            if apres != avant:
                r["snippet"] = apres
                change = True
                corriges += 1
        if change:
            Path(p).write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in lignes))
            touches += 1
            print(f"OK  {Path(p).name}")
    print(f"\nfichiers nettoyés : {touches} · extraits corrigés : {corriges}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
