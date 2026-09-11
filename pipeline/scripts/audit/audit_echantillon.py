#!/usr/bin/env python3
"""Contrôle par sondage : une ligne publiée, la même ligne à la source.

Le crible de couverture compare des TOTAUX. Deux jeux peuvent avoir le même
total et des lignes fausses : une somme juste ne prouve pas qu'un bénéficiaire
donné a bien reçu le montant qu'on lui affiche. Ce script fait l'autre moitié
du travail — il tire des lignes au hasard dans ce que le site publie et va
rechercher chacune dans le portail, une requête par ligne.

Ce qu'il prouve et ce qu'il ne prouve pas
-----------------------------------------
Il prouve qu'une ligne affichée existe à la source avec le même montant. Il ne
prouve rien sur les données reconstruites à partir des PDF (subventions 2020 et
2021, investissements localisés) : celles-là n'ont pas d'équivalent interrogeable
et sont marquées « hors portée » plutôt que déclarées bonnes.

Usage
-----
  python pipeline/scripts/audit/audit_echantillon.py --n 40
  python pipeline/scripts/audit/audit_echantillon.py --serie subventions --n 100

Codes de sortie : 0 tout identique · 1 au moins une ligne fausse ·
3 impossible de conclure (requêtes en erreur, aucune ligne fausse).
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "website" / "public" / "data"
OUT = DATA / "audit_echantillon.json"
PORTAL = "opendata.paris.fr"
API = f"https://{PORTAL}/api/explore/v2.1/catalog/datasets"
UA = {"User-Agent": "qipu/0.1 (sondage; qipu.org)"}
CENT = 0.01


def _get(url: str, tries: int = 3) -> dict:
    last = None
    for i in range(tries):
        try:
            return json.loads(urllib.request.urlopen(
                urllib.request.Request(url, headers=UA), timeout=45).read())
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(1.5 * (i + 1))
    raise last if last else RuntimeError("injoignable")


def _q(s: str) -> str:
    """Échappe une valeur pour une clause where ODQL."""
    return str(s).replace('"', '\\"')


# ── Les séries sondables, et comment retrouver une ligne à la source ──────────

def tirage_subventions(rng, n):
    """Une subvention publiée = (exercice, bénéficiaire, montant)."""
    lignes = []
    for f in sorted(DATA.glob("subventions/beneficiaires_*.json")):
        an = f.stem.split("_")[-1]
        if an in ("2010", "2011", "2012", "2020", "2021"):
            continue      # reconstruits depuis les annexes PDF, non interrogeables au portail
        d = json.load(open(f))
        for r in d.get("data") or []:
            nom = str(r.get("beneficiaire") or "")
            if not nom or nom.startswith("Personnes physiques anonymis"):
                continue  # agrégat RGPD : n'existe pas tel quel à la source
            lignes.append({"annee": an, "cle": nom, "montant": r.get("montant_total") or r.get("montant") or 0})
    return rng.sample(lignes, min(n, len(lignes)))


def verif_subventions(l):
    """Somme, à la source, tout ce que ce bénéficiaire a reçu cet exercice."""
    ds = ("subventions-versees" if int(l["annee"]) <= 2017
          else "subventions-versees-annexe-compte-administratif-a-partir-de-2018")
    champ = ("nom_de_l_organisme_beneficiaire_d_une_subvention" if int(l["annee"]) <= 2017
             else "nom_de_l_organisme_beneficiaire")
    where = f'{champ}="{_q(l["cle"])}" and publication like "*{l["annee"]}*"'
    u = f"{API}/{ds}/records?" + urllib.parse.urlencode(
        {"select": "sum(montant_de_la_subvention) as t, count(*) as n", "where": where, "limit": "1"})
    r = (_get(u).get("results") or [{}])[0]
    return (r.get("t") or 0), (r.get("n") or 0)


def tirage_ap(rng, n):
    """Une opération d'investissement publiée = (clé d'AP, exercice, montant)."""
    ops = json.load(open(DATA / "ca" / "ap_operations.json")).get("operations") or []
    lignes = [{"annee": an, "cle": o["ap_cle"], "montant": v}
              for o in ops if o.get("ap_cle")
              for an, v in (o.get("mandate_par_annee") or {}).items() if v]
    return rng.sample(lignes, min(n, len(lignes)))


def verif_ap(l):
    ds = ("comptes-administratifs-autorisations-de-programmes-ap-ville-departement"
          if int(l["annee"]) <= 2017
          else "comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de")
    where = (f'autorisation_de_programme_cle="{_q(l["cle"])}" '
             f'and year(exercice_comptable)={int(l["annee"])} '
             f'and sens_depense_recette="Dépenses" and type_d_operation_r_o_i_m="Réel" '
             f'and section_budgetaire_i_f="Investissement" '
             f'and not startswith(nature_budgetaire_cle,"16") '
             f'and not startswith(nature_budgetaire_cle,"26") '
             f'and not startswith(nature_budgetaire_cle,"27")')
    u = f"{API}/{ds}/records?" + urllib.parse.urlencode(
        {"select": "sum(mandate_titre_apres_regul) as t, count(*) as n", "where": where, "limit": "1"})
    r = (_get(u).get("results") or [{}])[0]
    return (r.get("t") or 0), (r.get("n") or 0)


def tirage_logements(rng, n):
    """Une livraison publiée = (exercice, id de livraison, total de logements).

    On somme NOS lignes par (exercice, livraison) avant de tirer : une livraison
    est publiée en plusieurs lignes quand elle mêle des financements différents,
    et comparer une seule de ces lignes au total de la source crie au faux sur
    une donnée juste. Deuxième fausse alerte du sondage, corrigée ici.
    """
    from collections import defaultdict
    par_cle = defaultdict(float)
    for f in sorted(DATA.glob("map/logements_*.json")):
        if "index" in f.name:
            continue
        d = json.load(open(f))
        for r in d.get("data") or []:
            # L'identifiant publié est composite (« 2019-2003676-logement… ») :
            # l'identifiant de livraison du portail en est le deuxième segment.
            morceaux = str(r.get("id") or "").split("-")
            if r.get("nbLogements") and len(morceaux) > 1 and morceaux[1].isdigit():
                par_cle[(str(d.get("year")), morceaux[1])] += r["nbLogements"]
    lignes = [{"annee": an, "cle": cle, "montant": v} for (an, cle), v in par_cle.items()]
    return rng.sample(lignes, min(n, len(lignes)))


def verif_logements(l):
    # Deux pièges, tous deux trouvés en faisant tourner le sondage.
    # 1. `id_livraison` ne suffit pas : la même livraison réapparaît sur un
    #    autre exercice (2003460 vaut 833 logements en 2018 et 1 en 2020).
    # 2. `annee` est un champ DATE. Écrire `annee=2018` renvoie une erreur 400 ;
    #    sans le filtre on compare notre ligne à la somme de tous les exercices.
    #    Il faut `year(annee)=`.
    where = f'id_livraison={int(l["cle"])} and year(annee)={int(l["annee"])}'
    u = f"{API}/logements-sociaux-finances-a-paris/records?" + urllib.parse.urlencode(
        {"select": "sum(nb_logmt_total) as t, count(*) as n", "where": where, "limit": "1"})
    r = (_get(u).get("results") or [{}])[0]
    return (r.get("t") or 0), (r.get("n") or 0)


SERIES = {
    "subventions": (tirage_subventions, verif_subventions, "montant versé (€)"),
    "ap": (tirage_ap, verif_ap, "mandaté (€)"),
    "logements": (tirage_logements, verif_logements, "logements financés"),
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=30, help="lignes tirées par série")
    ap.add_argument("--serie", choices=list(SERIES), help="ne sonder qu'une série")
    ap.add_argument("--graine", type=int, default=None, help="graine du tirage (rejouable)")
    a = ap.parse_args()

    graine = a.graine if a.graine is not None else random.randrange(10**9)
    rng = random.Random(graine)
    print(f"tirage aléatoire, graine {graine} (rejouable avec --graine {graine})\n")

    resultats = []
    for nom, (tirer, verifier, unite) in SERIES.items():
        if a.serie and nom != a.serie:
            continue
        try:
            echantillon = tirer(rng, a.n)
        except Exception as exc:  # noqa: BLE001
            print(f"{nom}: tirage impossible — {exc}", file=sys.stderr)
            continue
        ok = ecart = absent = erreur = 0
        details = []
        for l in echantillon:
            try:
                src, n_lignes = verifier(l)
            except Exception as exc:  # noqa: BLE001
                erreur += 1
                details.append({**l, "statut": "erreur", "message": str(exc)[:80]})
                continue
            if n_lignes == 0:
                absent += 1
                details.append({**l, "statut": "introuvable_a_la_source"})
            elif abs((src or 0) - (l["montant"] or 0)) <= max(CENT, abs(l["montant"]) * 1e-6):
                ok += 1
            else:
                ecart += 1
                details.append({**l, "statut": "ecart", "source": src, "publie": l["montant"]})
            time.sleep(0.25)
        total = len(echantillon)
        print(f"── {nom} · {unite} · {total} lignes tirées")
        print(f"     identiques à la source : {ok}")
        if ecart:   print(f"     écart de montant       : {ecart}")
        if absent:  print(f"     introuvables           : {absent}")
        if erreur:  print(f"     requête en erreur      : {erreur}")
        for d in details[:6]:
            print(f"       · {d.get('annee')} {str(d.get('cle'))[:44]:<46} {d.get('statut')}"
                  + (f" publié {d.get('publie')} vs source {d.get('source')}" if d.get("statut") == "ecart" else ""))
        resultats.append({"serie": nom, "tirees": total, "identiques": ok, "ecarts": ecart,
                          "introuvables": absent, "erreurs": erreur, "details": details})
        print()

    OUT.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "graine": graine, "portail": PORTAL,
        "note": "Sondage ligne à ligne. Les données reconstruites depuis les PDF "
                "(subventions 2020-2021, investissements localisés) sont hors portée : "
                "elles n'ont pas d'équivalent interrogeable au portail.",
        "series": resultats,
    }, ensure_ascii=False, indent=1))
    print(f"→ {OUT.relative_to(ROOT)}")
    # 1 = au moins une ligne publiée ne correspond pas à la source. 3 = aucune
    # ligne fausse mais des requêtes en erreur : on n'a pas pu conclure, et un
    # sondage dont toutes les requêtes ont échoué ne doit surtout pas sortir en
    # vert. 0 = tout tiré, tout vérifié, tout identique.
    faux = sum(r["ecarts"] + r["introuvables"] for r in resultats)
    if faux:
        return 1
    if sum(r["erreurs"] for r in resultats):
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
