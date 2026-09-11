#!/usr/bin/env python3
"""Rattache à chaque EXERCICE d'un lieu la ou les délibérations du Conseil de
Paris qui ont décidé l'argent — sans jamais écrire un motif à notre place.

Idée. Une fiche lieu montre un montant par année. Ce montant est la trace
comptable d'une décision : une délibération votée en séance. Le titre de cette
délibération, écrit par la Ville, contient déjà le motif à la ligne près
(« 2020 DAC 105 — Subvention (15.800.000 euros) et 2e avenant avec l'association
Théâtre Musical de Paris »). On le publie VERBATIM avec son lien : le lecteur
passe du chiffre à la décision, et la phrase reste celle de la Ville.

Rattachement (déterministe, aucun modèle) :
  - corpus : {slug}_delibs.jsonl (archive officielle des délibérations) ;
  - on ne retient qu'un titre qui décide de l'argent (subvention, avenant,
    convention, marché, travaux, autorisation de programme) ;
  - il doit NOMMER le lieu ou l'un de ses bénéficiaires rattachés
    ({slug}_money_resolved.json) — le nom entier, d'un seul tenant, pas un mot
    isolé. Vérifié : avec un simple mot distinctif (« châtelet »), la fiche du
    Théâtre du Châtelet ramassait les travaux du Théâtre de la Ville, qui est
    situé place du Châtelet — quatre délibérations fausses sur quarante-huit ;
  - l'exercice vient de la RÉFÉRENCE de la délibération (« 2020 DAC 105 »),
    c'est-à-dire l'année du vote, pas celle du paiement. Les deux diffèrent
    souvent d'un an : la fiche doit le dire, pas le masquer.

Sortie : {slug}_delibs_annee.json
    {"slug", "annees": {"2020": [{"reference","titre","seance","source_url"}]}}

Usage :
    python pipeline/scripts/enrich/link_delibs_par_annee.py --slug theatre-du-chatelet
    python pipeline/scripts/enrich/link_delibs_par_annee.py --all [--stats]
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "seed_lieux_v1.csv"
CACHE = ROOT / "pipeline" / "cache" / "lieux"

# Un titre qui décide de l'argent. « Vœu », « communication », « débat » n'en
# sont pas : ils parlent du lieu sans rien décider.
ARGENT = re.compile(
    r"subvention|avenant|convention|march[ée]|travaux|autorisation de programme"
    r"|financement|participation financi|d[ée]l[ée]gation de service", re.I)

# Référence officielle : « 2020 DAC 105 », « 2009, DAC 53 », « 1996, D. 467 ».
REF = re.compile(r"\b((?:19|20)\d{2}),?\s+(D[A-Z]{1,6}|D)\.?\s+(\d{1,4})\b")

# Articles et liaisons : retirés des DEUX côtés avant comparaison, pour que
# « travaux à l'église Saint-Merri » retrouve « Église Saint-Merri ».
LIAISONS = re.compile(r"\b(de|du|des|la|le|les|l|d|a|au|aux|et|en)\b")

# Mots trop courants pour identifier un lieu dans un titre de séance.
STOP = {
    "association", "theatre", "musee", "piscine", "jardin", "square", "parc",
    "eglise", "temple", "conservatoire", "bibliotheque", "mediatheque", "ecole",
    "stade", "gymnase", "halle", "marche", "mairie", "centre", "espace", "salle",
    "institut", "cite", "maison", "place", "pont", "porte", "bois", "cimetiere",
    "de", "du", "des", "la", "le", "les", "l", "d", "et", "en", "au", "aux",
    "paris", "ville", "municipal", "municipale", "saint", "sainte", "notre",
    "dame", "arrondissement", "nouveau", "nouvelle", "grand", "grande",
}
MIN_MOT = 5  # « ravel » oui, « pajol » oui, « roule » — d'où le garde-fou du titre


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", str(s).lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def squelette(s: str) -> str:
    """Forme comparable d'un nom : sans accents, sans articles, sans ponctuation.
    « Théâtre musical de Paris-Châtelet » et « THEATRE MUSICAL DE PARIS » se
    rejoignent ; « Théâtre de la Ville » reste distinct de « Théâtre du
    Châtelet »."""
    return re.sub(r"\s+", " ", LIAISONS.sub(" ", norm(s))).strip()


def mots_distinctifs(*noms: str) -> set[str]:
    out: set[str] = set()
    for n in noms:
        if not n:
            continue
        out |= {w for w in norm(n).split() if w not in STOP and len(w) >= MIN_MOT}
    return out


def jsonl(p: Path) -> list[dict]:
    if not p.exists():
        return []
    return [json.loads(l) for l in p.open() if l.strip()]


def lie_un_lieu(slug: str, row: dict) -> dict:
    delibs = jsonl(CACHE / f"{slug}_delibs.jsonl")
    if not delibs:
        return {}
    rp = CACHE / f"{slug}_money_resolved.json"
    benes = []
    if rp.exists():
        res = json.load(rp.open())
        benes = [s.get("beneficiaire", "") for s in res.get("subventions", [])]
    # Phrases qui NOMMENT le lieu : son nom, ses noms historiques, et le nom de
    # chaque bénéficiaire que le juge lui a rattaché (l'exploitant porte souvent
    # un autre nom que le bâtiment).
    phrases = {squelette(x) for x in
               [row.get("name", ""), row.get("title_phrase", ""),
                *(row.get("noms_historiques", "") or "").split(";"), *benes]}
    # DEUX MOTS AU MOINS. Vérifié : un nom d'un seul mot attrape le quartier ou
    # la rue homonyme — « Montsouris » ramenait la ZAC Alésia-Montsouris dans la
    # fiche du parc, « Belliard » ramenait un groupe scolaire de la rue Belliard
    # dans celle de la piscine. Le prix à payer est une délibération manquée
    # quand la Ville écrit « la piscine située rue Belliard » : on préfère un
    # trou à un faux lien.
    phrases = {p for p in phrases if len(p.split()) >= 2 and len(p) >= 8}
    if not phrases:
        return {}

    annees: dict[str, list[dict]] = {}
    vus: set[tuple] = set()
    for d in delibs:
        titre = (d.get("titre") or "").strip()
        if not titre or not ARGENT.search(titre):
            continue
        sq = squelette(titre)
        if not any(p in sq for p in phrases):
            continue
        m = REF.search(titre) or (REF.search(d["reference"]) if d.get("reference") else None)
        if not m:
            continue
        ref = f"{m.group(1)} {m.group(2)} {m.group(3)}"
        cle = (ref, norm(titre)[:80])
        if cle in vus:
            continue  # l'archive publie le même acte en « débat » et en « délibération »
        vus.add(cle)
        annees.setdefault(m.group(1), []).append({
            "reference": ref,
            "titre": titre,
            "seance": d.get("seance"),
            "source_url": d.get("source_url"),
        })
    for an in annees:
        annees[an].sort(key=lambda x: x["reference"])
    return {"slug": slug, "annees": dict(sorted(annees.items())),
            "noms_reconnus": sorted(phrases)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--stats", action="store_true")
    args = ap.parse_args()

    rows = list(csv.DictReader(SEED.open()))
    if args.slug:
        rows = [r for r in rows if r["slug"] == args.slug]
    elif not args.all:
        print("--slug ou --all", file=sys.stderr)
        return 2

    ecrits = total_annees = total_delibs = 0
    couverture = []
    for r in rows:
        out = lie_un_lieu(r["slug"], r)
        if not out or not out["annees"]:
            # Un lieu qui ne rattache plus rien doit PERDRE son fichier : sinon un
            # durcissement des règles laisse en place le résultat de l'ancienne,
            # et l'export republie ce qu'on vient de juger faux.
            (CACHE / f"{r['slug']}_delibs_annee.json").unlink(missing_ok=True)
            continue
        (CACHE / f"{r['slug']}_delibs_annee.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=1))
        ecrits += 1
        n_an = len(out["annees"])
        n_de = sum(len(v) for v in out["annees"].values())
        total_annees += n_an
        total_delibs += n_de
        couverture.append((n_de, n_an, r["slug"]))
        if args.slug:
            for an, ds in out["annees"].items():
                for d in ds:
                    print(f"  {an}  {d['reference']:<14} {d['titre'][:110]}")
    print(f"\n{ecrits} lieux avec au moins un exercice rattaché ; "
          f"{total_annees} exercices, {total_delibs} délibérations.")
    if args.stats:
        for n_de, n_an, slug in sorted(couverture, reverse=True)[:25]:
            print(f"  {n_de:>4} délibs / {n_an:>3} exercices  {slug}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
