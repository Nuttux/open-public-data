#!/usr/bin/env python3
"""Crible de couverture : ce que la Ville publie × ce qu'on ingère × ce qu'on publie.

Pourquoi ce script existe
-------------------------
`run_data_quality_audit.py` vérifie la cohérence INTERNE de l'entrepôt (raw →
stg → core → mart). Tous ses contrôles passaient au vert le 2026-09-10 pendant
que les fiches lieu affichaient une dépense d'investissement amputée de 95 M€ :
la Ville publie la série des autorisations de programme en DEUX jeux de données
coupés au changement de plan comptable (M14 jusqu'en 2017, M57 à partir de
2018), et on n'en lisait qu'un. Un audit qui part de nos tables ne peut pas
voir ce qui n'y est jamais entré.

Celui-ci part donc de l'extérieur, et croise trois colonnes :

  VILLE    le catalogue opendata.paris.fr — quels jeux existent, quelles
           années, quels totaux (agrégation côté serveur, coût nul pour nous)
  ENTREPÔT ce qu'on déclare ingérer (pipeline/configs/cities/paris.yaml et les
           syncs qui n'y sont pas encore)
  SITE     ce que le site sert vraiment (website/public/data/*.json)

Le détecteur générique
----------------------
La Ville nomme ses jeux « <série> 2009 - 2017 (M14-M52 …) », « <série> 2018
(M57 …) », « <série> à partir de 2018 (M57 …) ». On retire ces marqueurs de
période du titre : ce qui reste est la SOUCHE de la série. Deux jeux qui
partagent une souche sont deux moitiés de la même chose. Si l'un est ingéré et
pas l'autre, on a un trou — sans que personne ait eu à y penser à l'avance.
C'est ce contrôle qui aurait signalé le bug des AP avant qu'il ne soit publié.

Ce que le rapport distingue
---------------------------
Nos erreurs (série coupée, années manquantes, écart de total) et celles de la
Ville (jeu gelé, changement de format en cours de série, nom de colonne abîmé,
identifiant de jeu fautif). Les deux méritent d'être dites : la seconde
colonne est un état des lieux de l'open data budgétaire parisien.

Sorties
-------
  website/public/data/audit_publication_coverage.json   (publiable)
  pipeline/docs/audit_publication_coverage.md           (lisible)

Usage
-----
  python pipeline/scripts/audit/audit_publication_coverage.py
  python pipeline/scripts/audit/audit_publication_coverage.py --famille budget
  python pipeline/scripts/audit/audit_publication_coverage.py --no-totaux   # rapide
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "website" / "public" / "data"
OUT_JSON = DATA / "audit_publication_coverage.json"
OUT_MD = ROOT / "pipeline" / "docs" / "audit_publication_coverage.md"

PORTAL = "opendata.paris.fr"
API = f"https://{PORTAL}/api/explore/v2.1/catalog/datasets"
API_V1 = f"https://{PORTAL}/api/datasets/1.0/search/"
UA = {"User-Agent": "qipu/0.1 (audit de couverture; qipu.org)"}
TOLERANCE_PCT = 1.0        # écart toléré entre le total source et le nôtre
GEL_ANS = 3                # au-delà, on considère la source gelée


# ─────────────────────────────────────────────────────────────────────────────
# Le registre : une entrée par série d'argent qu'on publie.
#
# `ingere` liste les identifiants ODS qu'on lit AUJOURD'HUI. Le balayage des
# souches ira chercher tout seul les jeux frères qui n'y sont pas.
# `annee`/`montant` sont des indices : les jeux frères ont souvent des noms de
# colonnes légèrement différents, la résolution est faite par comparaison
# normalisée (voir `_resoudre_champ`).
# `site` dit où lire notre propre chiffre.
# ─────────────────────────────────────────────────────────────────────────────
FAMILLES = [
    {
        "id": "budget_execute",
        "label": "Budget exécuté — budget principal (compte administratif)",
        "ingere": ["comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement"],
        "annee": ["exercice_comptable"],
        "montant": ["mandate_titre_apres_regul"],
        "site": {"glob": "budget_sankey_*.json", "total": ["totals", "depenses"],
                 "filtre_type": ("type_budget", "execute")},
        # Miroir de stg_budget_principal (Réel, montant > 0) restreint aux
        # dépenses, côté source. L'export retire en plus les chapitres d'ordre
        # 925/926/946 : la comparaison reste indicative.
        "filtre_source": ('type_d_operation_r_o_i_m="Réel" and mandate_titre_apres_regul>0 '
                          'and sens_depense_recette="Dépenses"'),
        "perimetre": "indicatif",
        "note_perimetre": "l'export exclut les chapitres d'ordre 925/926/946 (opérations comptables)",
    },
    {
        "id": "budget_vote",
        "label": "Budget voté — budget principal",
        "ingere": ["budgets-votes-principaux-a-partir-de-2019-m57-ville-departement"],
        "annee": ["exercice_comptable"],
        "montant": ["credit_vote", "montant"],
        # Pas de filtre sur `type_budget` ici : la question posée est « le site
        # sert-il un budget pour cet exercice », et le site bascule sur le voté
        # uniquement tant que le compte administratif n'est pas publié. Filtrer
        # ferait apparaître 2019-2021 comme manquants alors qu'ils sont servis
        # en exécuté par la famille budget_execute.
        "site": {"glob": "budget_sankey_*.json", "total": None},
        "filtre_source": None,
        "perimetre": "indicatif",
        "note_perimetre": "le budget voté n'a pas de colonne « mandaté » : le total du site vient d'un autre champ",
    },
    {
        "id": "ap_execute",
        "label": "Investissement — autorisations de programme (exécuté)",
        "ingere": [
            "comptes-administratifs-autorisations-de-programmes-ap-ville-departement",
            "comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de",
        ],
        "annee": ["exercice_comptable"],
        "montant": ["mandate_titre_apres_regul"],
        "site": {"fichier": "ca/ap_operations.json", "total": "somme_operations"},
        # Miroir exact du filtre STG de export_ap_operations.py. Vérifié le
        # 2026-09-10 : réconcilie à l'euro près sur 2009 (1 692 587 739,29 €).
        "filtre_source": ('sens_depense_recette="Dépenses" and type_d_operation_r_o_i_m="Réel" '
                          'and section_budgetaire_i_f="Investissement" '
                          'and not startswith(nature_budgetaire_cle,"16") '
                          'and not startswith(nature_budgetaire_cle,"26") '
                          'and not startswith(nature_budgetaire_cle,"27")'),
        "perimetre": "exact",
    },
    {
        # La carte des investissements ne lit PAS la même chose que les fiches
        # lieu : elle sert les fichiers fusionnés PDF + open data, et n'affiche
        # un projet que s'il porte un nom. Les millésimes 2018-2021 de ces
        # fichiers viennent d'un export dont la colonne s'appelle `nomLieu` et
        # non `nom_projet` : ils sont lus comme vides. D'où une famille à part.
        "id": "investissements_carte",
        "label": "Investissement — carte des projets localisés",
        "ingere": ["comptes-administratifs-autorisations-de-programmes-a-partir-de-2018-m57-ville-de"],
        "annee": ["exercice_comptable"],
        "montant": ["mandate_titre_apres_regul"],
        "site": {"glob": "map/investissements_complet_*.json", "total": None,
                 "exige_champ": "nom_projet"},
        "filtre_source": None, "perimetre": "indicatif",
        "note_perimetre": "la carte fusionne l'annexe PDF des investissements localisés et l'open data",
    },
    {
        "id": "subventions",
        "label": "Subventions versées (annexe du compte administratif)",
        "ingere": ["subventions-versees-annexe-compte-administratif-a-partir-de-2018"],
        "annee": ["publication"],
        "montant": ["montant_de_la_subvention"],
        "site": {"glob": "subventions/beneficiaires_*.json", "total": ["total_montant"]},
        # Miroir de stg_subventions_all : montant non nul, bénéficiaire nommé.
        # 2020 et 2021 viennent du PDF B8.1.1, pas de l'open data : sur ces deux
        # exercices la source ODS ne peut pas servir de référence.
        "filtre_source": ('montant_de_la_subvention>0 '
                          'and nom_de_l_organisme_beneficiaire is not null'),
        "perimetre": "exact",
        "exercices_hors_source": ["2020", "2021"],
        "note_perimetre": "2020 et 2021 sont reconstruits depuis l'annexe PDF B8.1.1 (noms absents de l'open data)",
    },
    {
        "id": "marches",
        "label": "Marchés publics de la collectivité parisienne",
        "ingere": ["liste-des-marches-de-la-collectivite-parisienne"],
        "annee": ["annee_de_notification", "date_de_notification"],
        "montant": ["montant_maximum", "montant"],
        "site": {"glob": "marches-publics/marches_*.json", "total": ["enveloppe_max_totale"]},
        "filtre_source": None, "perimetre": "indicatif",
        "note_perimetre": "l'export fusionne l'open data et les DECP nationales : le total dépasse la seule source ODS",
    },
    {
        "id": "logements_sociaux",
        "label": "Logements sociaux financés",
        "ingere": ["logements-sociaux-finances-a-paris"],
        "annee": ["annee"],
        "montant": None,   # on compte des logements, pas des euros
        "site": {"glob": "map/logements_*.json", "total": ["totalLogements"]},
        "filtre_source": None, "perimetre": "indicatif",
    },
    {
        "id": "dette_garantie",
        "label": "Dette garantie par la Ville",
        "ingere": ["dette-garantie"],
        "annee": ["annee_de_publication"],
        "montant": ["capital_restant_du_au_31_12_de_l_annee_de_publication"],
        "site": {"glob": "hors_bilan_*.json", "total": None},
        "filtre_source": None, "perimetre": "indicatif",
    },
    {
        "id": "bilan",
        "label": "Bilan comptable",
        "ingere": ["bilan-comptable"],
        "annee": ["exercice_comptable"],
        "montant": ["net"],
        "site": {"glob": "bilan_sankey_*.json", "total": None},
        "filtre_source": None, "perimetre": "indicatif",
    },
]

# Jeux du catalogue qu'on sait volontairement hors périmètre : les citer évite
# de les redécouvrir à chaque passage comme s'ils étaient des oublis.
HORS_PERIMETRE = {
    "budget-participatif_operations-projets-gagnants-realisations": "budget participatif, autre objet",
    "bp_projets_gagnants": "budget participatif, autre objet",
    "budget_participatif_nombre_votants_opendata": "budget participatif, autre objet",
}


# ─────────────────────────────────────────────────────────────────────────────
# Accès au portail
# ─────────────────────────────────────────────────────────────────────────────
def _get(url: str, tries: int = 3) -> dict:
    last: Exception | None = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            return json.loads(urllib.request.urlopen(req, timeout=60).read())
        except Exception as exc:  # noqa: BLE001 — on retente sur tout transport
            last = exc
            time.sleep(1.5 * (i + 1))
    raise last if last else RuntimeError("injoignable")


def catalogue() -> dict[str, dict]:
    """Tout le catalogue : identifiant → {titre, lignes}. Une seule pagination."""
    out: dict[str, dict] = {}
    start, rows = 0, 100
    while True:
        d = _get(f"{API_V1}?rows={rows}&start={start}")
        lot = d.get("datasets") or []
        for ds in lot:
            m = ds.get("metas") or {}
            out[ds["datasetid"]] = {
                "titre": (m.get("title") or "").strip(),
                "lignes": m.get("records_count") or 0,
                "modifie": m.get("modified"),
            }
        start += rows
        if len(lot) < rows or start >= (d.get("nhits") or 0):
            break
    return out


def champs(dataset: str) -> list[str]:
    """Noms de colonnes, lus sur un enregistrement (pas de schéma à télécharger)."""
    try:
        d = _get(f"{API}/{urllib.parse.quote(dataset)}/records?limit=1")
    except Exception:
        return []
    res = d.get("results") or []
    return list(res[0]) if res else []


def _norm_champ(c: str) -> str:
    """« mandate_titre_x000d_apres_regul » et « mandate_titre_apres_regul » sont
    la même colonne : la Ville a laissé fuir un retour chariot Excel dans
    l'en-tête d'un de ses exports. On compare des noms nettoyés."""
    c = c.lower().replace("_x000d_", "_")
    return re.sub(r"[^a-z0-9]+", "", c)


def _resoudre_champ(dispo: list[str], indices: list[str] | None) -> str | None:
    if not indices:
        return None
    table = {_norm_champ(c): c for c in dispo}
    for ind in indices:
        exact = table.get(_norm_champ(ind))
        if exact:
            return exact
    # repli : un nom qui contient l'indice (ou l'inverse)
    for ind in indices:
        n = _norm_champ(ind)
        for k, orig in table.items():
            if n in k or k in n:
                return orig
    return None


AN = re.compile(r"(19|20)\d{2}")


def annees_et_totaux(dataset: str, champ_annee: str, champ_montant: str | None,
                     avec_totaux: bool = True, where: str | None = None
                     ) -> tuple[dict[str, float], dict[str, int], str | None]:
    """Somme et nombre de lignes par exercice, agrégés PAR LE SERVEUR.

    On groupe sur le champ brut plutôt que sur `year(...)` : le champ d'année
    est tantôt une date, tantôt un entier, tantôt une chaîne (« CA 2014 »), et
    l'année se lit dans tous les cas par expression régulière. Une requête par
    jeu, pas une par ligne."""
    select = "count(*) as n" + (f", sum({champ_montant}) as total" if (champ_montant and avec_totaux) else "")
    params = {"select": select, "group_by": champ_annee, "limit": "100"}
    if where:
        params["where"] = where
    url = f"{API}/{urllib.parse.quote(dataset)}/records?" + urllib.parse.urlencode(params)
    try:
        d = _get(url)
    except Exception as exc:  # noqa: BLE001
        # Un filtre écrit pour le jeu frère peut nommer une colonne absente
        # ici : on retombe sur la requête sans filtre plutôt que de perdre
        # l'information de couverture, et on le dit.
        if where:
            t, l, e = annees_et_totaux(dataset, champ_annee, champ_montant, avec_totaux, None)
            return t, l, (e or "filtre inapplicable sur ce jeu, total brut")
        return {}, {}, f"{type(exc).__name__}: {str(exc)[:90]}"
    totaux: dict[str, float] = defaultdict(float)
    lignes: dict[str, int] = defaultdict(int)
    for r in d.get("results") or []:
        brut = r.get(champ_annee)
        m = AN.search(str(brut)) if brut is not None else None
        if not m:
            continue
        an = m.group(0)
        lignes[an] += int(r.get("n") or 0)
        if r.get("total") is not None:
            totaux[an] += float(r["total"])
    return dict(totaux), dict(lignes), None


# ─────────────────────────────────────────────────────────────────────────────
# Souches : le détecteur de série coupée en deux
# ─────────────────────────────────────────────────────────────────────────────
# ATTENTION : ces motifs s'appliquent au titre DÉJÀ mis en minuscules et
# désaccentué (voir `souche`). Écrire « à partir de » ici ne matcherait jamais,
# le titre porte « a partir de » à ce stade — c'est le bug qui a rendu le
# détecteur aveugle à sa première exécution, le 2026-09-10.
PERIODE = [
    r"\b(19|20)\d{2}\s*[-–]\s*(19|20)\d{2}\b",     # « 2009 - 2017 »
    r"\ba\s+partir\s+de\s+(19|20)\d{2}\b",          # « à partir de 2018 »
    r"\ba\s+compter\s+de\s+(19|20)\d{2}\b",
    r"\bdepuis\s+(19|20)\d{2}\b",
    r"\bjusqu'?\s*en\s+(19|20)\d{2}\b",
    r"\b(19|20)\d{2}\b",                            # « 2018 » seul, en dernier
    r"\(?\s*m1[45]\s*[-–]?\s*m?5?2?\s*\)?",         # « (M14-M52 …) »
    r"\(?\s*m57\s*\)?",
    r"\bville\s*[-–]?\s*departement\b",
    r"\bville\s+de\s+paris\b",
    # Restes de tournure une fois l'année ôtée : « … a partir de », « depuis ».
    r"\ba\s+partir\s+de\b", r"\ba\s+compter\s+de\b", r"\bdepuis\b",
]


def souche(titre: str) -> str:
    """Le titre débarrassé de ses marqueurs de période et de plan comptable.

    « Comptes Administratifs - Budgets Principaux 2018 (M57 Ville-département) »
    et « Comptes Administratifs – Budgets Principaux à partir de 2019 (M57
    Ville-département) » donnent la même souche : deux moitiés d'une série."""
    t = unicodedata.normalize("NFD", titre.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    for motif in PERIODE:
        t = re.sub(motif, " ", t, flags=re.I)
    t = re.sub(r"[^a-z0-9]+", " ", t)
    # pluriel/singulier : « budgets principaux » ≡ « budget principal »
    mots = []
    for w in t.split():
        w = re.sub(r"(aux|es|s)$", "", w) if len(w) > 4 else w
        mots.append(w)
    return " ".join(mots).strip()


def familles_du_catalogue(cat: dict[str, dict]) -> dict[str, list[str]]:
    par_souche: dict[str, list[str]] = defaultdict(list)
    for ds, meta in cat.items():
        if meta["lignes"] and meta["titre"]:
            par_souche[souche(meta["titre"])].append(ds)
    return par_souche


# ─────────────────────────────────────────────────────────────────────────────
# Ce que le site publie
# ─────────────────────────────────────────────────────────────────────────────
def _plonge(d: dict, chemin: list[str]):
    for k in chemin:
        if not isinstance(d, dict) or k not in d:
            return None
        d = d[k]
    return d


def cote_site(spec: dict | None) -> tuple[dict[str, float], list[str], str | None]:
    """Totaux par année tels que le site les sert, lus dans les JSON publiés."""
    if not spec:
        return {}, [], "aucun fichier déclaré"
    if spec.get("fichier"):
        p = DATA / spec["fichier"]
        if not p.exists():
            return {}, [], f"{spec['fichier']} absent"
        d = json.load(open(p))
        if spec.get("total") == "somme_operations":
            par_an: dict[str, float] = defaultdict(float)
            for o in d.get("operations") or []:
                for an, v in (o.get("mandate_par_annee") or {}).items():
                    par_an[an] += v or 0
            return dict(par_an), sorted(par_an), None
        return {}, [], "extracteur inconnu"

    totaux: dict[str, float] = {}
    annees: list[str] = []
    manquant = 0
    for p in sorted(DATA.glob(spec["glob"])):
        m = AN.search(p.stem)
        if not m:
            continue
        an = m.group(0)
        try:
            d = json.load(open(p))
        except Exception:
            manquant += 1
            continue
        ft = spec.get("filtre_type")
        if ft and str(d.get(ft[0])) != ft[1]:
            continue
        # Un fichier peut exister et n'être lu par personne : le site n'affiche
        # un projet que s'il porte un nom. Un millésime dont aucune ligne ne
        # porte le champ attendu est présent sur le disque et absent de l'écran.
        exige = spec.get("exige_champ")
        if exige:
            lignes = d.get("data") or []
            if not any(str(r.get(exige) or "").strip() for r in lignes):
                continue
        annees.append(an)
        if spec.get("total"):
            v = _plonge(d, spec["total"])
            if isinstance(v, (int, float)):
                totaux[an] = float(v)
    note = f"{manquant} fichier(s) illisible(s)" if manquant else None
    return totaux, sorted(set(annees)), note


# ─────────────────────────────────────────────────────────────────────────────
# Le crible
# ─────────────────────────────────────────────────────────────────────────────
def auditer(familles: list[dict], avec_totaux: bool = True) -> dict:
    cat = catalogue()
    par_souche = familles_du_catalogue(cat)
    annee_courante = date.today().year
    lignes_rapport = []
    constats = []

    for fam in familles:
        # 1. Les frères : tous les jeux qui partagent une souche avec les nôtres.
        freres: set[str] = set()
        for ds in fam["ingere"]:
            if ds not in cat:
                constats.append({
                    "gravite": "erreur", "cote": "nous", "famille": fam["id"],
                    "code": "JEU_INTROUVABLE",
                    "message": f"le jeu déclaré « {ds} » n'existe pas au catalogue {PORTAL}",
                })
                continue
            freres |= set(par_souche.get(souche(cat[ds]["titre"]), []))
        freres |= set(fam["ingere"])
        non_ingeres = sorted(d for d in freres
                             if d not in fam["ingere"] and d not in HORS_PERIMETRE)

        # 2. Chaque jeu de la famille : années, lignes, totaux, côté Ville.
        jeux = []
        src_totaux: dict[str, float] = defaultdict(float)
        src_annees: set[str] = set()
        for ds in sorted(freres):
            meta = cat.get(ds) or {"titre": ds, "lignes": 0}
            cols = champs(ds)
            ca = _resoudre_champ(cols, fam["annee"])
            cm = _resoudre_champ(cols, fam["montant"])
            totaux, nlignes, err = ({}, {}, "champ d'année introuvable") if not ca else \
                annees_et_totaux(ds, ca, cm, avec_totaux, fam.get("filtre_source"))
            ingere = ds in fam["ingere"]
            jeux.append({
                "dataset": ds, "titre": meta["titre"], "lignes_catalogue": meta["lignes"],
                "derniere_maj": meta.get("modifie"),
                "ingere": ingere, "champ_annee": ca, "champ_montant": cm,
                "annees": sorted(totaux or nlignes), "lignes_par_annee": nlignes,
                "total_par_annee": {k: round(v, 2) for k, v in totaux.items()},
                "erreur": err,
                "url": f"https://{PORTAL}/explore/dataset/{ds}/",
            })
            if ingere:
                src_annees |= set(totaux or nlignes)
                for an, v in totaux.items():
                    src_totaux[an] += v

            # Côté Ville : nom de colonne abîmé, identifiant fautif.
            for c in cols:
                if "_x000d_" in c.lower():
                    constats.append({
                        "gravite": "info", "cote": "ville", "famille": fam["id"],
                        "code": "COLONNE_ABIMEE",
                        "message": f"{ds} : la colonne « {c} » contient un retour chariot Excel "
                                   f"(_x000d_), le même champ s'appelle autrement dans l'autre moitié de la série",
                    })
                    break
            if re.search(r"\bbugdet\b|autotrisation", ds):
                constats.append({
                    "gravite": "info", "cote": "ville", "famille": fam["id"],
                    "code": "IDENTIFIANT_FAUTIF",
                    "message": f"identifiant de jeu mal orthographié à la source : « {ds} » — "
                               f"il ne peut pas être deviné, seul le catalogue le donne",
                })

            if not ingere:
                lignes = meta["lignes"]
                montant = sum(totaux.values()) if totaux else None
                constats.append({
                    "gravite": "erreur" if lignes > 500 else "avertissement",
                    "cote": "nous", "famille": fam["id"], "code": "SERIE_COUPEE",
                    "message": f"« {meta['titre']} » ({ds}) est un autre morceau d'une série qu'on ingère "
                               f"déjà, et il n'est pas ingéré : {lignes} lignes"
                               + (f", {montant/1e6:.0f} M€" if montant else "")
                               + (f", exercices {min(totaux or nlignes)}→{max(totaux or nlignes)}"
                                  if (totaux or nlignes) else ""),
                    "dataset": ds, "url": f"https://{PORTAL}/explore/dataset/{ds}/",
                })

        # 3. Ce que le site sert.
        site_totaux, site_annees, note_site = cote_site(fam.get("site"))

        # 4. Années publiées par la Ville et absentes du site.
        toutes_src = set()
        for j in jeux:
            toutes_src |= set(j["annees"])
        trous = sorted(a for a in toutes_src if a not in set(site_annees))
        if trous and site_annees:
            constats.append({
                "gravite": "erreur", "cote": "nous", "famille": fam["id"],
                "code": "ANNEES_MANQUANTES",
                "message": f"la Ville publie {min(toutes_src)}→{max(toutes_src)}, le site sert "
                           f"{min(site_annees)}→{max(site_annees)} : {len(trous)} exercice(s) "
                           f"absent(s) ({', '.join(trous[:12])}{'…' if len(trous) > 12 else ''})",
            })

        # 5. Écart de total sur les années communes.
        ecarts = []
        exact = fam.get("perimetre") == "exact"
        hors = set(fam.get("exercices_hors_source") or [])
        for an in sorted(set(src_totaux) & set(site_totaux)):
            if an in hors:
                continue
            src, notre = src_totaux[an], site_totaux[an]
            if src:
                pct = abs(notre - src) / abs(src) * 100
                ecarts.append({"annee": an, "source": round(src, 2), "site": round(notre, 2),
                               "ecart_pct": round(pct, 2), "perimetre": fam.get("perimetre", "indicatif")})
                if pct > TOLERANCE_PCT:
                    # Une alerte qui se déclenche sur une différence de périmètre
                    # connue apprend à ignorer l'alerte. Tant que le filtre de
                    # l'export n'est pas reproduit sur la source, l'écart est une
                    # information, pas une accusation.
                    constats.append({
                        "gravite": "avertissement" if exact else "info",
                        "cote": "nous", "famille": fam["id"],
                        "code": "ECART_TOTAL" if exact else "PERIMETRE_NON_ALIGNE",
                        "message": (f"{an} : source {src/1e6:.1f} M€ vs site {notre/1e6:.1f} M€ "
                                    f"({pct:.1f} % d'écart)")
                                   + (" — même filtre des deux côtés, l'écart est réel" if exact
                                      else f" — périmètres différents"
                                           + (f" : {fam['note_perimetre']}" if fam.get("note_perimetre") else "")),
                    })

        # 6b. Années que la Ville a versées à moitié. Une année dont le nombre de
        # lignes s'effondre par rapport aux autres n'est pas une année creuse :
        # c'est un dépôt interrompu. Vu le 2026-09-10 sur le budget voté 2021,
        # 460 lignes contre ~4 000 les deux années précédentes.
        for j in jeux:
            counts = {a: n for a, n in (j.get("lignes_par_annee") or {}).items() if n}
            if len(counts) < 3:
                continue
            valeurs = sorted(counts.values())
            median = valeurs[len(valeurs) // 2]
            for an, n in sorted(counts.items()):
                if median and n < median * 0.35:
                    constats.append({
                        "gravite": "avertissement", "cote": "ville", "famille": fam["id"],
                        "code": "ANNEE_PARTIELLE_SOURCE",
                        "message": f"{j['dataset']} : l'exercice {an} ne compte que {n} lignes "
                                   f"contre {median} en année pleine ({n/median*100:.0f} %) — "
                                   f"dépôt interrompu, l'exercice ne peut pas être présenté comme complet",
                    })

        # 6c. Ce que dit la date de dernière mise à jour du portail.
        #
        # `modified` est la date à laquelle la Ville a poussé de la donnée
        # (2025-08-26 pour le compte administratif, le jour de la publication
        # du CA 2024). À ne pas confondre avec `data_processed`, identique à la
        # minute près sur des jeux sans rapport : c'est un réindexage du
        # portail, pas un geste de la Ville.
        #
        # Deux cas, et un seul est une accusation :
        #   - la date et le dernier exercice concordent → le jeu est abandonné ;
        #   - le jeu contient des exercices POSTÉRIEURS à sa date de mise à jour
        #     → la métadonnée est fausse, et on ne peut rien conclure sur
        #     l'abandon. C'est le cas des AP M57 le 2026-09-10 : exercices
        #     jusqu'à 2022, dernière mise à jour déclarée le 2019-11-28.
        for j in jeux:
            maj = str(j.get("derniere_maj") or "")[:10]
            if not maj or not j["annees"]:
                continue
            an_maj, dernier = int(maj[:4]), int(max(j["annees"]))
            if dernier > an_maj:
                constats.append({
                    "gravite": "info", "cote": "ville", "famille": fam["id"],
                    "code": "METADONNEE_INCOHERENTE",
                    "message": f"{j['dataset']} : le jeu contient l'exercice {dernier} alors que le "
                               f"portail annonce une dernière mise à jour au {maj} — la date de "
                               f"fraîcheur affichée aux réutilisateurs est fausse",
                })
                continue
            if (annee_courante - an_maj) >= 2 and (annee_courante - dernier) >= GEL_ANS:
                constats.append({
                    "gravite": "avertissement", "cote": "ville", "famille": fam["id"],
                    "code": "JEU_ABANDONNE",
                    "message": f"{j['dataset']} : dernier exercice {dernier}, dernière mise à jour "
                               f"déclarée le {maj} — les deux concordent, le jeu n'est plus alimenté",
                })

        # 6. Source gelée.
        if toutes_src:
            retard = annee_courante - int(max(toutes_src))
            if retard >= GEL_ANS:
                constats.append({
                    "gravite": "avertissement", "cote": "ville", "famille": fam["id"],
                    "code": "SOURCE_GELEE",
                    "message": f"dernier exercice publié {max(toutes_src)}, soit {retard} ans de "
                               f"retard sur {annee_courante} : la Ville a cessé d'alimenter la série",
                })

        lignes_rapport.append({
            "id": fam["id"], "label": fam["label"], "jeux": jeux,
            "non_ingeres": non_ingeres,
            "annees_source": sorted(toutes_src), "annees_site": site_annees,
            "annees_manquantes": trous, "ecarts": ecarts, "note_site": note_site,
        })

    ordre = {"erreur": 0, "avertissement": 1, "info": 2}
    constats.sort(key=lambda c: (ordre.get(c["gravite"], 9), c["cote"], c["famille"]))
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "portail": PORTAL,
        "tolerance_ecart_pct": TOLERANCE_PCT,
        "resume": {
            "familles": len(lignes_rapport),
            "jeux_de_la_serie_non_ingeres": sum(len(f["non_ingeres"]) for f in lignes_rapport),
            "constats": len(constats),
            "erreurs": sum(1 for c in constats if c["gravite"] == "erreur"),
            "cote_nous": sum(1 for c in constats if c["cote"] == "nous"),
            "cote_ville": sum(1 for c in constats if c["cote"] == "ville"),
        },
        "familles": lignes_rapport,
        "constats": constats,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Rendu
# ─────────────────────────────────────────────────────────────────────────────
def markdown(rapport: dict) -> str:
    L = []
    r = rapport["resume"]
    L.append("# Couverture de publication — Ville × entrepôt × site\n")
    L.append(f"Généré le {rapport['generated_at'][:10]} depuis {rapport['portail']}. "
             f"{r['familles']} séries, {r['constats']} constats "
             f"({r['erreurs']} erreurs), dont {r['cote_nous']} de notre côté et "
             f"{r['cote_ville']} du côté de la Ville.\n")

    L.append("\n## Tableau croisé\n")
    L.append("| Série | La Ville publie | Le site sert | Exercices absents | Autres jeux de la série non ingérés |")
    L.append("|---|---|---|---|---|")
    for f in rapport["familles"]:
        src = f"{min(f['annees_source'])}→{max(f['annees_source'])}" if f["annees_source"] else "—"
        site = f"{min(f['annees_site'])}→{max(f['annees_site'])}" if f["annees_site"] else "—"
        trous = str(len(f["annees_manquantes"])) if f["annees_manquantes"] else "—"
        fr = str(len(f["non_ingeres"])) if f["non_ingeres"] else "—"
        L.append(f"| {f['label']} | {src} | {site} | {trous} | {fr} |")

    L.append("\n## Jeux de données, un par ligne\n")
    L.append("| Série | Jeu | Ingéré | Lignes | Exercices | Total | Dernière MAJ Ville |")
    L.append("|---|---|---|---|---|---|---|")
    for f in rapport["familles"]:
        for j in f["jeux"]:
            tot = sum(j["total_par_annee"].values())
            per = f"{min(j['annees'])}→{max(j['annees'])}" if j["annees"] else (j["erreur"] or "—")
            maj = str(j.get("derniere_maj") or "—")[:10]
            montant = f"{tot/1e6:,.0f} M€".replace(",", " ") if tot else "—"
            L.append(f"| {f['id']} | [{j['dataset'][:52]}]({j['url']}) | "
                     f"{'oui' if j['ingere'] else '**non**'} | {j['lignes_catalogue']} | {per} | "
                     f"{montant} | {maj} |")

    for cote, titre in (("nous", "Ce qu'il faut corriger chez nous"),
                        ("ville", "Ce que la Ville publie mal")):
        items = [c for c in rapport["constats"] if c["cote"] == cote]
        if not items:
            continue
        L.append(f"\n## {titre}\n")
        for c in items:
            marque = {"erreur": "**erreur**", "avertissement": "avertissement", "info": "info"}[c["gravite"]]
            L.append(f"- {marque} · `{c['code']}` · {c['famille']} — {c['message']}")

    L.append("\n## Écarts de total, année par année\n")
    L.append("| Série | Exercice | Source | Site | Écart |")
    L.append("|---|---|---|---|---|")
    for f in rapport["familles"]:
        for e in f["ecarts"]:
            L.append(f"| {f['id']} | {e['annee']} | {e['source']/1e6:.1f} M€ | "
                     f"{e['site']/1e6:.1f} M€ | {e['ecart_pct']:.1f} % |")
    return "\n".join(L) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--famille", help="n'auditer qu'une série (son id)")
    ap.add_argument("--no-totaux", action="store_true", help="années seulement, plus rapide")
    ap.add_argument("--dry-run", action="store_true", help="n'écrit aucun fichier")
    a = ap.parse_args()

    familles = [f for f in FAMILLES if not a.famille or f["id"] == a.famille]
    if not familles:
        print(f"famille inconnue : {a.famille}", file=sys.stderr)
        return 2

    rapport = auditer(familles, avec_totaux=not a.no_totaux)
    md = markdown(rapport)
    if not a.dry_run:
        OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
        OUT_JSON.write_text(json.dumps(rapport, ensure_ascii=False, indent=1))
        OUT_MD.parent.mkdir(parents=True, exist_ok=True)
        OUT_MD.write_text(md)
    print(md)
    r = rapport["resume"]
    print(f"\n→ {OUT_JSON.relative_to(ROOT)}\n→ {OUT_MD.relative_to(ROOT)}", file=sys.stderr)
    return 1 if r["erreurs"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
