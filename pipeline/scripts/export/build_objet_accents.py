"""Construit la table d'accents des objets de marchés, DEPUIS le corpus.

Les objets DECP arrivent dans une casse et une accentuation incohérentes : la
même commune écrit « AMÉNAGEMENTS » sur une ligne et « AMELIORATION » sur la
suivante. Pour pouvoir passer les objets tout en capitales en casse de phrase
sans fabriquer d'orthographe, on apprend l'accentuation sur les objets qui la
portent déjà : pour chaque forme sans accent, la graphie accentuée la plus
fréquente du corpus l'emporte, et seulement si elle domine nettement.

Rien n'est inventé : un mot dont aucune graphie accentuée n'existe dans les
517 000 objets reste tel quel.

    python3 scripts/export/build_objet_accents.py
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from google.cloud import bigquery

PROJECT = "open-data-france-484717"
MARTS = "dbt_paris_dev_local_marts"
OUT = Path(__file__).resolve().parents[2] / "seeds" / "objet_accents.json"

WORD = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ]{3,}")
ACCENTED = set("àâäéèêëîïôöùûüÿçœæÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇŒÆ")
# Sous ce nombre d'occurrences, une graphie accentuée est du bruit (faute de
# frappe, nom propre étranger) et n'entre pas dans la table.
MIN_COUNT = 4
# La graphie retenue doit peser au moins cette part des occurrences accentuées
# de la forme : en dessous, l'usage est trop partagé et on s'abstient.
MIN_SHARE = 0.35
# Une graphie plus accentuée ne peut battre la plus fréquente que si elle
# atteint cette part de ses occurrences — sinon les fautes rares gagneraient.
RIVAL_SHARE = 0.60
# La graphie accentuée doit peser ce multiple de la graphie sans accent pour
# être retenue : en dessous, c'est la forme sans accent qui est la bonne.
PLAIN_RATIO = 3.0
# Les mots outils ne s'accentuent jamais dans ce contexte, quelle que soit la
# statistique : « des » n'est pas « dès », « ou » n'est pas « où ».
STOP = {"des", "les", "la", "le", "du", "de", "en", "sur", "aux", "au", "un", "une",
        "et", "ou", "par", "pour", "dans", "avec", "sans", "sous", "ce", "ces",
        "son", "ses", "leur", "leurs", "a", "ville", "villes", "commune", "communes"}


def strip_accents(w: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", w) if unicodedata.category(c) != "Mn").lower()


def main() -> int:
    client = bigquery.Client(project=PROJECT)
    sql = f"SELECT objet FROM `{PROJECT}.{MARTS}.mart_marches_national` WHERE objet IS NOT NULL"
    print("lecture des objets…", flush=True)

    # On compte TOUTES les graphies, accentuées ou non : sans le versant sans
    # accent, la table croit qu'il faut accentuer « des » en « dès » et
    # « ville » en « villé », parce qu'elle ne voit jamais la forme courante.
    forms: dict[str, Counter] = defaultdict(Counter)
    vocab: Counter = Counter()
    n = 0
    for row in client.query(sql).result():
        n += 1
        for w in WORD.findall(row.objet):
            if w.isupper():
                continue          # « AMÉNAGEMENTS » : casse inutilisable telle quelle
            low = w.lower()
            forms[strip_accents(w)][low] += 1
            vocab[strip_accents(w)] += 1

    def n_accents(w: str) -> int:
        return sum(1 for c in w if c in ACCENTED)

    table: dict[str, str] = {}
    for plain, spellings in forms.items():
        total = sum(spellings.values())
        plain_count = spellings.get(plain, 0)
        ranked = [(w, c) for w, c in spellings.most_common() if c >= MIN_COUNT and w != plain]
        if not ranked:
            continue
        # La graphie la plus fréquente donne le ton, mais une graphie PLUS
        # complètement accentuée l'emporte si elle pèse un poids comparable :
        # « électricité » (2 898) bat « electricité » (4 065), saisie à moitié
        # faite. Le seuil de fréquence évite qu'une faute rare (« éléctricité »,
        # 24 occurrences) gagne parce qu'elle porte un accent de plus.
        lead = ranked[0][1]
        near = [(w, c) for w, c in ranked if c >= RIVAL_SHARE * lead]
        best, count = max(near, key=lambda x: (n_accents(x[0]), x[1]))
        # La graphie accentuée doit l'emporter NETTEMENT sur la graphie sans
        # accent : « ville » (courant) ne devient pas « villé », « des » ne
        # devient pas « dès », alors que « electricite » (rare) devient bien
        # « électricité ».
        if plain in STOP:
            continue
        if count / total >= MIN_SHARE and count >= PLAIN_RATIO * plain_count:
            table[plain] = best

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "source": "objets DECP du mart national, graphies accentuées observées",
        "n_objets": n,
        "min_count": MIN_COUNT,
        "min_share": MIN_SHARE,
        "n_mots": len(table),
        "mots": dict(sorted(table.items())),
        "vocab": sorted(w for w, c in vocab.items() if c >= 20),
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{n} objets lus, {len(table)} mots retenus → {OUT}")
    for k in list(sorted(table))[:12]:
        print(f"   {k} → {table[k]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
