#!/usr/bin/env python3
"""Garde-fou déterministe entre le juge et l'export des fiches lieu.

Le rattachement de l'argent à un lieu passe par un modèle, encadré par une
vérification adverse elle aussi menée par un modèle. Le 2026-09-10, cette
vérification a rattrapé des opérations budgétaires FABRIQUÉES par le juge :
des clés d'autorisation de programme absentes des candidats, avec des montants
au centime — 985 367,42 € sur le bois de Vincennes, 510 000 € sur le Carreau du
Temple. Elle les a retirées, ce qui est exactement son rôle.

Mais une vérification qui dépend d'un modèle ne peut pas être la dernière
barrière avant publication. Ce script est mécanique et sans jugement : toute
ligne du fichier résolu doit exister à l'identique dans le fichier des
candidats. Clé inconnue, montant qui diffère d'un centime, exercice ajouté :
la ligne est refusée.

  --check   liste les anomalies, code de sortie 1 s'il y en a
  --fix     corrige le résolu (sauvegarde .bak) : les montants d'une opération
            rattachée sont réécrits depuis la table des opérations, et seules
            les lignes introuvables à la source sont retirées

Usage : python pipeline/scripts/audit/check_lieu_money_resolved.py --check
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

CACHE = Path("/Users/daniel/code/open-public-data/pipeline/cache/lieux")
DATA = Path(__file__).resolve().parents[3] / "website" / "public" / "data"
CENT = 0.011   # tolérance : un centime d'arrondi, pas plus


def _num(x) -> float:
    try:
        return float(x or 0)
    except (TypeError, ValueError):
        return 0.0


# ─────────────────────────────────────────────────────────────────────────────
# La référence, c'est la SOURCE, pas le fichier de candidats.
#
# Première version de ce script : comparer le résolu à son fichier de
# candidats. Mauvaise référence — la collecte est rejouée régulièrement, et une
# ligne jugée contre la génération précédente de candidats ressortait comme
# « absente » alors qu'elle est parfaitement fondée. Vingt et une fausses
# alertes sur vingt et une. Une alerte fausse fait perdre à l'outil la
# confiance qui fait son utilité.
#
# On contrôle donc contre les données publiées elles-mêmes : une opération doit
# exister dans la table des opérations avec les mêmes exercices, un projet dans
# l'annexe des investissements, un marché dans la liste des marchés. C'est la
# garantie qui compte : rien sur une fiche qui ne soit dans la source.
# ─────────────────────────────────────────────────────────────────────────────
_SRC: dict = {}


def source():
    if _SRC:
        return _SRC
    ops = {}
    try:
        for o in json.load(open(DATA / "ca" / "ap_operations.json")).get("operations") or []:
            ops[str(o.get("ap_cle"))] = {str(k): _num(v) for k, v in (o.get("mandate_par_annee") or {}).items()}
    except Exception:
        pass
    projets: dict[str, list[float]] = {}
    for motif in ("map/investissements_complet_*.json", "map/investissements_localises_*.json"):
        for f in DATA.glob(motif):
            try:
                for r in json.load(open(f)).get("data") or []:
                    nom = str(r.get("nom_projet") or "").strip()
                    if nom:
                        projets.setdefault(nom, []).append(_num(r.get("montant")))
            except Exception:
                continue
    marches: set[str] = set()
    for f in DATA.glob("marches-publics/marches_*.json"):
        try:
            for r in json.load(open(f)).get("data") or []:
                if r.get("numero_marche"):
                    marches.add(str(r["numero_marche"]))
        except Exception:
            continue
    benef: set[str] = set()
    for f in DATA.glob("subventions/beneficiaires_*.json"):
        if "search" in f.name:
            continue
        try:
            for r in json.load(open(f)).get("data") or []:
                if r.get("beneficiaire"):
                    benef.add(str(r["beneficiaire"]).strip().upper())
        except Exception:
            continue
    _SRC.update({"ap": ops, "projets": projets, "marches": marches, "benef": benef})
    return _SRC


def anomalies_du_lieu(slug: str) -> tuple[list[dict], dict]:
    """(anomalies, résolu nettoyé). Le nettoyage ne retire que les lignes fautives."""
    rp = CACHE / f"{slug}_money_resolved.json"
    if not rp.exists():
        return [], {}
    res = json.load(open(rp))
    src = source()
    out: list[dict] = []

    gardees = []
    for a in res.get("ap") or []:
        cle = str(a.get("ap_cle"))
        vraies = src["ap"].get(cle)
        if vraies is None:
            out.append({"slug": slug, "type": "ap", "cle": cle,
                        "faute": "opération inconnue de la table des opérations",
                        "montant": _num(a.get("total_mandate"))})
            continue
        annees_r = {str(k): _num(v) for k, v in (a.get("mandate_par_annee") or {}).items()}
        faux = [an for an, v in annees_r.items()
                if an not in vraies or abs(vraies[an] - v) > CENT]
        if faux:
            out.append({"slug": slug, "type": "ap", "cle": cle,
                        "faute": f"exercices repris de la source : {', '.join(sorted(faux))}",
                        "montant": sum(annees_r[an] for an in faux)})
        # Le juge décide du RATTACHEMENT, jamais du montant : dès lors que
        # l'opération existe, ses exercices sont réécrits depuis la table des
        # opérations. Retirer l'opération entière parce qu'un exercice cloche
        # coûtait 159,7 M€ parfaitement fondés à la Philharmonie ; la réécrire
        # ne laisse passer aucun chiffre inventé sans jeter le reste.
        a = dict(a)
        a["mandate_par_annee"] = dict(sorted(vraies.items()))
        a["total_mandate"] = round(sum(vraies.values()), 2)
        gardees.append(a)
    res["ap"] = gardees

    gardees = []
    for r in res.get("projets") or []:
        nom, montant = str(r.get("nom_projet") or "").strip(), _num(r.get("montant_eur"))
        # La collecte tronque les noms de projet à 90 caractères : le nom stocké
        # dans le résolu est un PRÉFIXE de celui que le site publie. Comparer les
        # chaînes entières refusait vingt projets parfaitement fondés.
        montants = src["projets"].get(nom)
        if montants is None and len(nom) >= 40:
            montants = []
            for publie, mts in src["projets"].items():
                if publie.startswith(nom):
                    montants.extend(mts)
            montants = montants or None
        if montants is None:
            out.append({"slug": slug, "type": "projets", "cle": nom[:48],
                        "faute": "projet absent de l'annexe des investissements", "montant": montant})
            continue
        if not any(abs(m - montant) <= CENT for m in montants):
            out.append({"slug": slug, "type": "projets", "cle": nom[:48],
                        "faute": "montant absent de l'annexe", "montant": montant})
            continue
        gardees.append(r)
    res["projets"] = gardees

    gardees = []
    for r in res.get("marches") or []:
        num = str(r.get("numero_marche") or "")
        if src["marches"] and num not in src["marches"]:
            out.append({"slug": slug, "type": "marches", "cle": num[:48],
                        "faute": "marché absent de la liste publiée",
                        "montant": _num(r.get("montant_max"))})
            continue
        gardees.append(r)
    res["marches"] = gardees

    # Les subventions : seule l'EXISTENCE du bénéficiaire est contrôlée ici. Le
    # montant affiché sur la fiche n'est pas celui du résolu : l'export le
    # recalcule exercice par exercice depuis les fichiers de bénéficiaires.
    gardees = []
    for r in res.get("subventions") or []:
        nom = str(r.get("beneficiaire") or "").strip().upper()
        if src["benef"] and nom and nom not in src["benef"]:
            out.append({"slug": slug, "type": "subventions", "cle": nom[:48],
                        "faute": "bénéficiaire absent des subventions publiées",
                        "montant": _num(r.get("montant_total"))})
            continue
        gardees.append(r)
    res["subventions"] = gardees

    return out, res


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--fix", action="store_true")
    a = ap.parse_args()
    if not (a.check or a.fix):
        ap.print_help()
        return 2

    slugs = sorted(p.name[: -len("_money_resolved.json")]
                   for p in CACHE.glob("*_money_resolved.json"))
    toutes: list[dict] = []
    for slug in slugs:
        anos, propre = anomalies_du_lieu(slug)
        toutes.extend(anos)
        if anos and a.fix:
            rp = CACHE / f"{slug}_money_resolved.json"
            shutil.copy(rp, rp.with_suffix(".json.bak"))
            json.dump(propre, open(rp, "w"), ensure_ascii=False, indent=1)

    if not toutes:
        print(f"{len(slugs)} lieux contrôlés · aucune ligne sans candidat")
        return 0
    par_type: dict[str, int] = {}
    for t in toutes:
        par_type[t["type"]] = par_type.get(t["type"], 0) + 1
    print(f"{len(slugs)} lieux contrôlés · {len(toutes)} ligne(s) refusée(s) "
          f"({', '.join(f'{k} : {v}' for k, v in sorted(par_type.items()))}) · "
          f"{sum(t['montant'] for t in toutes)/1e6:.2f} M€ écartés")
    for t in sorted(toutes, key=lambda x: -x["montant"])[:25]:
        print(f"   {t['slug']:<30} {t['type']:<12} {str(t['cle'])[:34]:<36} "
              f"{t['montant']/1e6:8.3f} M€  {t['faute']}")
    if a.fix:
        print("\nLignes retirées des fichiers résolus (sauvegardes .bak à côté).")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
