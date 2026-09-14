#!/usr/bin/env python3
"""
À quoi sert l'argent, commune par commune : mart_communes_fonctions → un
fonctions.json par commune et le manifeste.

Ce que la source est vraiment :
    Chaque ligne de la balance DGFiP « présentation croisée nature-fonction »
    porte À LA FOIS une FONCTION (la politique publique : écoles, culture,
    voirie) et un COMPTE (la nature : personnel, achats, subventions versées).
    Le grain réel est donc `commune × fonction × compte` — 1,8 million de
    cellules pour 3 384 communes en 2024. On garde l'arbre :

        fonction principale  →  sous-fonction (le code tel que la commune le
                                vote : « Écoles primaires », « Crèches »)
                             →  nature (« Personnel titulaire », « Subventions
                                aux associations »)

D'où viennent les chiffres :
    sync_dgfip_nature_fonction.py  ZIP → raw_national.dgfip_balances_nature_fonction
    dbt  stg_dgfip_nature_fonction   typage, code INSEE
         core_dgfip_nature_fonction  une ligne de balance, avec ses règles de lecture :
                                     référence fonctionnelle, clé NEUTRE (M14 et M57
                                     ne désignent pas la même chose par le même
                                     chiffre), rubrique 01 « non ventilable » à part,
                                     reversements (6554, 6556), familles de nature
         mart_communes_fonctions     communes, budget principal, CLASSE 6 seulement,
                                     une ligne par cellule, nomenclature dominante
    ce script                        lit le mart, et seulement lui.

Ce que ce script ajoute, et qui est de la présentation :
    - le repliement des cellules en arbre et en familles de nature, dans l'ordre
      du fichier source (premiere_ligne) : les sommes sont celles des fichiers
      déjà publiés, au flottant près ;
    - les libellés (nomenclature DGCL, M57 ou M14 selon la commune) et leur
      traduction anglaise ;
    - les plafonds de lignes, avec une ligne « Autres » qui porte le reste ;
    - la comparaison aux communes de même strate démographique, calculée sur
      les montants ARRONDIS affichés et la population de l'index des communes,
      pour que la part lue dans une fiche soit exactement celle qui la classe.

Sources :
    Balance   https://data.economie.gouv.fr/explore/dataset/balances-comptables-
              des-collectivites-et-des-etablissements-publics-locaux-avec-la-
              presentation-croisee-nature-fonction-2024/
    Libellés  pipeline/data/nomenclature-budgetaire.json
              (voir sync_nomenclature_budgetaire.py — la balance n'a QUE des
              codes, et on n'invente pas le sens d'un code)
    Communes  website/public/data/communes-all/index.json (slug, nom, population)

Sortie :
    website/public/data/communes-fonctions/{slug}/fonctions.json  (→ bucket privé)
    website/src/data/communes-fonctions-manifest.json             (engagé)

Usage :
    python3 pipeline/scripts/export/export_communes_fonctions.py               # exercice le plus récent du mart
    python3 pipeline/scripts/export/export_communes_fonctions.py --annee 2024
    NATIONAL_MARTS_DATASET=dbt_paris_dev_<user>_national_marts python3 …      # mart de dev

Envoi (non fait ici) :
    gcloud storage rsync -r website/public/data/communes-fonctions gs://qipu-communes-budget/communes-fonctions
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import statistics
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Constantes

ROOT = Path(__file__).resolve().parents[3]
NOMENCLATURE_FILE = ROOT / "pipeline" / "data" / "nomenclature-budgetaire.json"
TRADUCTIONS_FILE = ROOT / "pipeline" / "data" / "nomenclature-libelles-en.json"
INDEX_FILE = ROOT / "website" / "public" / "data" / "communes-all" / "index.json"
OUT_ROOT = ROOT / "website" / "public" / "data" / "communes-fonctions"
MANIFEST_FILE = ROOT / "website" / "src" / "data" / "communes-fonctions-manifest.json"

PROJECT_ID = "open-data-france-484717"
_MARTS = os.environ.get("NATIONAL_MARTS_DATASET", "dbt_paris_national_marts")
MART = f"{PROJECT_ID}.{_MARTS}.mart_communes_fonctions"

DATASET_PREFIX = (
    "balances-comptables-des-collectivites-et-des-etablissements-publics-"
    "locaux-avec-la-presentation-croisee-nature-fonction-"
)
BUCKET_BASE = "https://storage.googleapis.com/qipu-communes-budget/communes-fonctions"

SOURCE_LABEL = "DGFiP — balances comptables, présentation croisée nature-fonction"
SOURCE_PIPELINE = "balance DGFiP (ZIP) → dbt national (mart_communes_fonctions) → export_communes_fonctions.py"
SCOPE = "dépenses de fonctionnement (comptes de classe 6)"

# Combien de lignes on garde à chaque niveau avant de replier le reste dans une
# ligne « Autres ». Le reste est une VRAIE ligne portant son montant : les
# totaux se recomposent au centime, on ne perd rien, on n'affiche pas 3 000
# lignes dans un navigateur.
TOP_SOUS_FONCTIONS = 12
TOP_NATURES = 12
TOP_NATURES_SOUS = 8

# Fonctions principales : les clés NEUTRES du core, libellés M57 par défaut.
FONCTIONS = [
    ("f0_services_generaux", "Administration générale", "General administration"),
    ("f1_securite", "Sécurité et salubrité publiques", "Security and public health"),
    ("f2_enseignement", "Enseignement-formation", "Education and training"),
    ("f3_culture", "Culture, vie sociale, jeunesse et sports", "Culture, youth and sports"),
    ("f4", "Santé et action sociale", "Health and social action"),
    ("f5", "Aménagement des territoires et habitat", "Regional planning and housing"),
    ("f6", "Action économique", "Economic action"),
    ("f7", "Environnement", "Environment"),
    ("f8", "Transports", "Transport"),
    ("f9_action_eco", "Action économique (M14)", "Economic action (M14)"),
]
# Les mêmes chiffres, lus en M14. Seules ces communes-là reçoivent ces libellés.
LIB_M14 = {
    "f3_culture": ("Culture", "Culture"),
    "f4": ("Sport et jeunesse", "Sports and youth"),
    "f5": ("Interventions sociales et santé", "Social action and health"),
    "f6": ("Famille", "Family (childcare)"),
    "f7": ("Logement", "Housing"),
    "f8": ("Aménagement, environnement", "Urban planning, environment"),
}
# Reversements à d'autres collectivités (compartiment « rev » du mart) : de
# l'argent que la commune encaisse et transmet, pas un service qu'elle rend. La
# nomenclature les range en fonction 0 faute de politique publique à laquelle
# les rattacher, ce qui faisait ressortir les communes d'un établissement
# public territorial à 43 % d'« administration » — 22 M€ sur 56 à Pantin. Ils
# sortent en compartiment PROPRE, comme le non-ventilé.
REV_FR = "Reversé à l'intercommunalité"
REV_EN = "Passed on to the inter-municipal body"

# Strates démographiques de la DGFiP. Ce sont exactement celles que le site
# emploie déjà pour la médiane de taxe foncière (mart_taux_fonciers_national) :
# une seule définition de « commune comparable » sur tout le site.
STRATES = [
    (0, 100, "moins de 100 habitants"), (100, 200, "100 à 200 habitants"),
    (200, 500, "200 à 500 habitants"), (500, 1000, "500 à 1 000 habitants"),
    (1000, 2000, "1 000 à 2 000 habitants"), (2000, 3500, "2 000 à 3 500 habitants"),
    (3500, 5000, "3 500 à 5 000 habitants"), (5000, 10000, "5 000 à 10 000 habitants"),
    (10000, 20000, "10 000 à 20 000 habitants"), (20000, 50000, "20 000 à 50 000 habitants"),
    (50000, 100000, "50 000 à 100 000 habitants"), (100000, 10**9, "100 000 habitants et plus"),
]
STRATES_EN = ["under 100 inhabitants", "100 to 200 inhabitants", "200 to 500 inhabitants",
              "500 to 1,000 inhabitants", "1,000 to 2,000 inhabitants", "2,000 to 3,500 inhabitants",
              "3,500 to 5,000 inhabitants", "5,000 to 10,000 inhabitants", "10,000 to 20,000 inhabitants",
              "20,000 to 50,000 inhabitants", "50,000 to 100,000 inhabitants", "100,000 inhabitants and over"]


def strate_de(pop: int) -> int:
    for i, (lo, hi, _) in enumerate(STRATES):
        if lo <= pop < hi:
            return i
    return len(STRATES) - 1


# Les familles de natures (colonne famille_nature du core, qui porte la règle
# des préfixes de la classe 6). Ici : leur ordre, leur adresse et leurs libellés.
NATURES = [
    ("salaires", "salaires", "Salaires et charges de personnel", "Staff pay and costs"),
    ("achats", "achats-et-services", "Achats et services extérieurs", "Purchases and external services"),
    ("gestion", "subventions-et-contributions", "Subventions et contributions", "Grants and contributions"),
    ("dette", "interets-de-la-dette", "Intérêts de la dette", "Debt interest"),
    ("impots", "impots-et-taxes", "Impôts et taxes payés", "Taxes paid"),
    ("exceptionnel", "charges-exceptionnelles", "Charges exceptionnelles", "Exceptional charges"),
    ("dotations", "amortissements-et-provisions", "Amortissements et provisions", "Depreciation and provisions"),
]
COMPARTIMENTS = {cle for cle, _, _ in FONCTIONS} | {"nv", "rev"}

NV_FR = "Non ventilé"
NV_EN = "Not allocated"


def _log(msg: str) -> None:
    print(msg, flush=True)


# ---------------------------------------------------------------------------
# Libellés

def slugify(s: str) -> str:
    """Libellé → segment d'URL lisible.

    Le slug est dérivé du LIBELLÉ, pas de la clé neutre : « f4 » désigne la
    santé en M57 et le sport et la jeunesse en M14, et deux choses différentes
    ne peuvent pas partager une URL.
    """
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return re.sub(r"-{2,}", "-", s)[:60]


def _norm(s: str) -> str:
    """Clé de comparaison d'un libellé : une seule forme d'apostrophe.

    Même normalisation que dans sync_nomenclature_budgetaire.py — voir le
    commentaire là-bas sur le Windows-1252 et les apostrophes doublées.
    """
    return re.sub(r"’{2,}", "’", s.replace("\x92", "’").replace("'", "’"))


class Libelles:
    """Résolution code → libellé, par axe et par nomenclature.

    Les codes de la balance sont parfois plus fins que la nomenclature publiée
    (une commune peut voter « 64111 » quand la table s'arrête à « 6411 ») : on
    remonte au plus long préfixe connu. Jamais l'inverse — on ne descend pas
    d'un code court vers un libellé plus précis qu'on aurait choisi.
    """

    def __init__(self, path: Path, traductions: Path) -> None:
        d = json.loads(path.read_text(encoding="utf-8"))
        self.fonction = d["fonction_m57"]
        self.nature_m57 = d["nature_m57"]
        self.nature_m14 = d["nature_m14"]
        self.source_url = d["source_url"]
        # La DGCL ne publie pas de version anglaise : la traduction est la nôtre
        # (voir le fichier). Tout libellé sans entrée est signalé en fin de run
        # plutôt que de laisser passer du français sur le site anglais.
        t = json.loads(traductions.read_text(encoding="utf-8"))
        # Les clés sont normalisées des deux côtés : le fichier de traduction est
        # écrit à la main, et une apostrophe droite tapée là où la nomenclature
        # en a une courbe fait échouer la correspondance sans rien dire d'utile.
        self.en_fonction = {_norm(k): v for k, v in t["fonctions"].items()}
        self.en_nature = {_norm(k): v for k, v in t["natures"].items()}
        self.manquants: set[tuple[str, str]] = set()

    def en(self, axe: str, fr: str) -> str:
        table = self.en_fonction if axe == "fonction" else self.en_nature
        trad = table.get(_norm(fr))
        if trad is None:
            self.manquants.add((axe, fr))
            return fr
        return trad

    # Un libellé qui ne se suffit pas à lui-même : soit un fragment de phrase
    # (« à caractère administratif »), soit un mot passe-partout. La
    # nomenclature est hiérarchique et ses feuilles ne portent souvent que ce
    # qui les distingue de leur parent.
    GENERIQUES = {"autres", "autre", "divers", "rémunérations", "autres charges"}

    @classmethod
    def _autoportant(cls, lib: str) -> bool:
        return lib[:1].isupper() and lib.lower() not in cls.GENERIQUES

    @staticmethod
    def _chaine(table: dict[str, str], code: str) -> list[str]:
        """Les libellés des ancêtres du code, du plus général au plus précis."""
        return [table[code[:n]] for n in range(1, len(code) + 1) if code[:n] in table]

    @classmethod
    def _compose(cls, table: dict[str, str], code: str) -> str | None:
        """Le libellé le plus précis connu, rendu lisible hors de son contexte.

        La balance descend parfois plus bas que la nomenclature publiée : on
        remonte au plus long préfixe connu, jamais l'inverse. Et si ce libellé
        est un fragment (« à caractère administratif »), on lui rend son
        parent : « Subventions de fonctionnement aux organismes publics — à
        caractère administratif ». Sans ça, une ligne de 2,45 M€ ne dit rien.
        """
        chaine = cls._chaine(table, code)
        if not chaine:
            return None
        feuille = chaine[-1]
        if cls._autoportant(feuille):
            return feuille
        for parent in reversed(chaine[:-1]):
            if cls._autoportant(parent):
                return f"{parent} — {feuille}"
        return feuille

    def fonction_label(self, ref: str) -> str | None:
        # Les sous-fonctions s'affichent SOUS leur fonction : « Services
        # communs » y est lisible sans être recomposé.
        chaine = self._chaine(self.fonction, ref)
        return chaine[-1] if chaine else None

    def nature_label(self, compte: str, nomen: str) -> str | None:
        # Les natures s'affichent à plat, sans parent visible : elles, si.
        table = self.nature_m14 if nomen.startswith("M14") else self.nature_m57
        return self._compose(table, compte)


# ---------------------------------------------------------------------------
# Lecture du mart

def client_bq():
    from google.cloud import bigquery

    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        adc = Path.home() / ".config" / "gcloud" / "application_default_credentials.json"
        if adc.exists():
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(adc)
    return bigquery.Client(project=PROJECT_ID)


def annee_la_plus_recente(client) -> int | None:
    """Le dernier exercice présent dans le mart : celui qu'on exporte par défaut."""
    row = next(iter(client.query(f"SELECT MAX(annee) AS annee FROM `{MART}`").result()))
    return row["annee"]


def lire_mart(client, annee: int) -> dict[str, dict]:
    """Les cellules de chaque commune, dans l'ordre du fichier source.

    L'ordre n'est pas cosmétique : les montants sont additionnés en flottant,
    et l'ordre d'addition décide de l'arrondi d'un total qui tombe sur
    50 centimes. Le rejouer à l'identique garde les fichiers publiés stables.
    """
    from google.cloud import bigquery

    sql = f"""
        SELECT code_insee, libelle_budget, nomenclature, compartiment, fonction_reference, compte,
               famille_nature, montant
        FROM `{MART}`
        WHERE annee = @annee
        ORDER BY code_insee, premiere_ligne
    """
    job = client.query(sql, job_config=bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("annee", "INT64", annee)]
    ))
    by_insee: dict[str, dict] = {}
    for r in job.result(page_size=200_000):
        cle = r["compartiment"]
        if cle not in COMPARTIMENTS:
            raise RuntimeError(f"compartiment inconnu dans le mart : {cle!r}")
        bucket = by_insee.setdefault(r["code_insee"], {
            "cellules": defaultdict(float),   # (compartiment, ref, compte) → montant
            "familles": {},                   # compte → famille de nature
            "libelle": r["libelle_budget"],
            "nomen": r["nomenclature"],
            "total": 0.0,
        })
        montant = float(r["montant"])
        bucket["cellules"][(cle, r["fonction_reference"], r["compte"])] += montant
        bucket["familles"][r["compte"]] = r["famille_nature"]
        bucket["total"] += montant
    _log(f"  = {MART} : {job.total_bytes_processed / 1e6:.0f} Mo lus")
    return by_insee


# ---------------------------------------------------------------------------
# Repliement en arbre

def _top(items: list[dict], n: int, autres_fr: str, autres_en: str) -> list[dict]:
    """Les n plus gros, puis une ligne « Autres » qui porte tout le reste.

    La ligne de reste n'est pas cosmétique : sans elle la somme des lignes
    affichées ne fait pas le total affiché, et le lecteur qui additionne a
    raison contre nous.

    Le reste peut être NÉGATIF, et c'est normal : la balance porte des
    annulations sur exercices antérieurs (OBNETDEB net). Les écarter parce
    qu'ils sont négatifs — ce que faisait la première version — retirait
    70 629 € du total de Pantin et faisait que les natures sommaient plus haut
    que leur fonction. On les garde donc, repliés dans le reste.
    """
    items.sort(key=lambda x: -x["montant"])
    if len(items) <= n + 1:
        return items
    reste = sum(x["montant"] for x in items[n:])
    out = items[:n]
    if reste != 0:
        out.append({"code": "autres", "libelle": autres_fr, "libelle_en": autres_en,
                    "montant": reste, "autres": True})
    return out


def _traduire(rows: list[dict], axe: str, lib: "Libelles") -> list[dict]:
    """Attache le libellé anglais aux lignes retenues, sur place."""
    for r in rows:
        if "libelle_en" not in r:
            r["libelle_en"] = lib.en(axe, r["libelle"])
    return rows


def build_commune(bucket: dict, lib: Libelles) -> dict | None:
    total = bucket["total"]
    if total <= 0:
        return None
    nomen = bucket["nomen"]
    est_m14 = nomen.startswith("M14")

    par_fonction: dict[str, float] = defaultdict(float)
    natures: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    sous: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    sous_natures: dict[tuple[str, str], dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for (fkey, ref, compte), montant in bucket["cellules"].items():
        par_fonction[fkey] += montant
        natures[fkey][compte] += montant
        sous[fkey][ref] += montant
        sous_natures[(fkey, ref)][compte] += montant

    # Le dénominateur des parts : ce que la commune rattache à une politique
    # qu'elle délivre — ni le non-ventilé, ni ce qu'elle reverse.
    ventile = total - par_fonction.get("nv", 0.0) - par_fonction.get("rev", 0.0)

    def natures_rows(counts: dict[str, float], n: int) -> list[dict]:
        rows = [
            {"code": c, "libelle": lib.nature_label(c, nomen) or f"Compte {c}", "montant": round(v)}
            for c, v in counts.items() if v != 0
        ]
        # Traduire APRÈS l'élagage : seuls les libellés réellement affichés ont
        # besoin d'une version anglaise, et l'ensemble à maintenir à la main
        # reste borné (quelques centaines, pas les 2 573 codes du plan).
        return _traduire(_top(rows, n, "Autres natures de dépense", "Other types of spending"), "nature", lib)

    fonctions_out: list[dict] = []
    for cle, fr_def, en_def in FONCTIONS:
        montant = par_fonction.get(cle, 0.0)
        # Une fonction peut être NETTE NÉGATIVE : les annulations sur exercices
        # antérieurs dépassent alors les dépenses de l'année (Pouzauges, sécurité,
        # −76 656 €). L'écarter parce qu'elle est négative cassait l'addition —
        # les fonctions restantes sommaient plus haut que le total, sur 33
        # communes. On la garde, avec sa part réellement négative ; c'est à
        # l'affichage de ne pas lui dessiner de barre.
        if montant == 0:
            continue
        fr, en = (LIB_M14.get(cle) if est_m14 else None) or (fr_def, en_def)
        entry = {
            "cle": cle,
            "slug": slugify(fr),
            "libelle": fr,
            "libelle_en": en,
            "montant": round(montant),
            "share": round(montant / ventile, 4) if ventile > 0 else None,
            "natures": natures_rows(natures[cle], TOP_NATURES),
        }
        # Sous-fonctions : uniquement en M57. La nomenclature FONCTIONNELLE M14
        # n'est pas publiée dans le jeu DGCL qu'on ingère, et la table M14 qu'on
        # a est un plan de comptes par NATURE : y chercher un code de fonction
        # renverrait un libellé faux et crédible (« 212 » y vaut « Agencements
        # et aménagements de terrains », pas « Écoles primaires »). Donc rien.
        if not est_m14:
            rows = []
            for ref, v in sous[cle].items():
                if v == 0:
                    continue
                label = lib.fonction_label(ref)
                if not label:
                    continue
                rows.append({
                    "code": ref,
                    "libelle": label,
                    "montant": round(v),
                    "natures": natures_rows(sous_natures[(cle, ref)], TOP_NATURES_SOUS),
                })
            rows = _traduire(_top(rows, TOP_SOUS_FONCTIONS, "Autres domaines", "Other areas"), "fonction", lib)
            # Un seul poste dont le libellé répète celui de la fonction n'ajoute
            # rien : la commune a voté au niveau de la fonction, sans détail.
            if len(rows) > 1 or (len(rows) == 1 and rows[0]["libelle"] != fr):
                entry["sous_fonctions"] = rows
        fonctions_out.append(entry)

    fonctions_out.sort(key=lambda x: -x["montant"])

    # Les familles de natures. Le reversement en est exclu, comme des fonctions :
    # un transfert n'est ni une politique ni une forme de dépense de la commune.
    fam_montant: dict[str, float] = defaultdict(float)
    fam_comptes: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    fam_fonctions: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for (fkey, ref, compte), montant in bucket["cellules"].items():
        if fkey == "rev":
            continue
        fam = bucket["familles"][compte]
        if not fam:
            continue
        fam_montant[fam] += montant
        fam_comptes[fam][compte] += montant
        fam_fonctions[fam][fkey] += montant
    base_natures = total - par_fonction.get("rev", 0.0)
    lib_fonction = {cle: (fr, en) for cle, fr, en in FONCTIONS}
    lib_fonction["nv"] = (NV_FR, NV_EN)
    natures_out: list[dict] = []
    for key, slug_n, fr_n, en_n in NATURES:
        montant = fam_montant.get(key, 0.0)
        if montant == 0:
            continue
        # Le croisement : cette forme de dépense, dans quelles politiques. C'est
        # la lecture de la fiche poste de Paris, et la seule chose qu'une fiche
        # nature peut dire que la page ville ne montre pas déjà.
        croise = []
        for fkey, v in fam_fonctions[key].items():
            if v == 0:
                continue
            fr_f, en_f = (LIB_M14.get(fkey) if est_m14 and fkey in LIB_M14 else None) or lib_fonction.get(fkey, (fkey, fkey))
            croise.append({"cle": fkey, "slug": slugify(fr_f) if fkey != "nv" else None, "libelle": fr_f, "libelle_en": en_f, "montant": round(v)})
        croise.sort(key=lambda x: -x["montant"])
        natures_out.append({
            "key": key,
            "slug": slug_n,
            "libelle": fr_n,
            "libelle_en": en_n,
            "montant": round(montant),
            "share": round(montant / base_natures, 4) if base_natures > 0 else None,
            "comptes": natures_rows(fam_comptes[key], TOP_NATURES),
            "fonctions": croise,
        })
    natures_out.sort(key=lambda x: -x["montant"])

    non_ventile = round(par_fonction.get("nv", 0.0))
    reverse = round(par_fonction.get("rev", 0.0))
    out = {
        "total": round(total),
        "total_ventile": round(ventile),
        "non_ventile": non_ventile,
        "reversement": reverse,
        "nomenclature": nomen,
        "fonctions": fonctions_out,
        "natures": natures_out,
    }
    if reverse > 0:
        out["reversement_detail"] = {
            "libelle": REV_FR,
            "libelle_en": REV_EN,
            "montant": reverse,
            "natures": natures_rows(natures["rev"], TOP_NATURES),
        }
    if non_ventile > 0:
        # « C'est quoi, ces millions non ventilés ? » — la question se pose, la
        # réponse est dans le fichier : intérêts de la dette, reversements de
        # fiscalité, opérations générales.
        out["non_ventile_detail"] = {
            "libelle": NV_FR,
            "libelle_en": NV_EN,
            "montant": non_ventile,
            "natures": natures_rows(natures["nv"], TOP_NATURES),
        }
    return out


# ---------------------------------------------------------------------------
# Comparaison aux communes de même taille

def attacher_comparaisons(docs: dict[str, dict], pops: dict[str, int], noms: dict[str, str]) -> dict[str, int]:
    """« Est-ce que ma ville met assez dans les écoles ? »

    La seule question qu'un habitant se pose vraiment, et à laquelle aucune
    source ne répond aujourd'hui. On y répond par fonction, en euros par
    habitant, contre la MÉDIANE des communes de la même strate démographique.

    DEUX LECTURES, ET LA PREMIÈRE TROMPE SEULE. Une commune qui dépense plus par
    habitant que ses pairs — Pantin : +46 % toutes politiques confondues — est
    « au-dessus » presque partout en euros, sans que ça dise rien de ses choix.
    Mesuré sur sa strate : 25 communes sur 81 sont ainsi « + » ou « − » presque
    partout. Et l'écart en euros cache l'inverse : Pantin est « dans la moyenne »
    en culture (+3 %) alors qu'elle y met un tiers de part en moins (14,5 %
    contre 21,4 %).

    On sépare donc le NIVEAU de la COMPOSITION, comme en benchmarking :
      - la priorité : la part du budget contre la part médiane — la lecture
        principale, indépendante de la richesse de la commune ;
      - le niveau général : les € par habitant toutes politiques confondues,
        contre la médiane, dit UNE fois par commune ;
      - le niveau par fonction : les € par habitant, gardés en second.

    Précautions : les reversements sont déjà hors des fonctions (compartiment
    « rev ») ; une strate de moins de 12 communes ne donne pas de médiane
    publiable, on n'attache alors rien plutôt qu'un chiffre fragile.
    """
    MIN_STRATE = 12
    # strate → fonction → { slug: (€/hab, part) } ; strate → { slug: €/hab global }
    vals: dict[int, dict[str, dict[str, tuple[float, float]]]] = defaultdict(lambda: defaultdict(dict))
    glob: dict[int, dict[str, float]] = defaultdict(dict)
    for slug, doc in docs.items():
        pop = pops.get(slug, 0)
        if pop <= 0 or doc["total_ventile"] <= 0:
            continue
        st = strate_de(pop)
        glob[st][slug] = doc["total_ventile"] / pop
        for f in doc["fonctions"]:
            vals[st][f["cle"]][slug] = (f["montant"] / pop, f["montant"] / doc["total_ventile"])

    # Un classement par strate et par fonction, sur la PART, du plus au moins.
    classements: dict[int, dict[str, list[tuple[str, float, float]]]] = defaultdict(dict)
    for st, d in vals.items():
        for cle, m in d.items():
            classements[st][cle] = sorted(((sl, v[1], v[0]) for sl, v in m.items()), key=lambda x: -x[1])

    attachees = 0
    for slug, doc in docs.items():
        pop = pops.get(slug, 0)
        if pop <= 0 or slug not in glob.get(strate_de(pop), {}):
            continue
        st = strate_de(pop)
        lo, hi, lib = STRATES[st]
        n_strate = len(glob[st])
        if n_strate < MIN_STRATE:
            continue
        doc["strate"] = {
            "code": st, "libelle": lib, "libelle_en": STRATES_EN[st],
            "min": lo, "max": None if hi >= 10**9 else hi, "n_communes": n_strate,
        }
        # Le niveau général, dit une fois : « +46 % par habitant que ses semblables ».
        serie_g = list(glob[st].values())
        med_g = statistics.median(serie_g)
        mien_g = glob[st][slug]
        doc["comparaison_globale"] = {
            "eur_hab": round(mien_g, 1),
            "mediane": round(med_g, 1),
            "ecart_pct": round((mien_g - med_g) / med_g * 100, 1) if med_g > 0 else None,
            "rang": sum(1 for v in serie_g if v > mien_g) + 1,
            "n_communes": n_strate,
        }
        for f in doc["fonctions"]:
            m = vals[st].get(f["cle"]) or {}
            if len(m) < MIN_STRATE or slug not in m:
                continue
            eur, part = m[slug]
            med_eur = statistics.median(v[0] for v in m.values())
            med_part = statistics.median(v[1] for v in m.values())
            if med_part <= 0:
                continue
            ordre = classements[st][f["cle"]]
            rang = next(k for k, (sl, _, _) in enumerate(ordre) if sl == slug) + 1
            f["comparaison"] = {
                # La lecture principale : la priorité.
                "part": round(part * 100, 1),
                "part_mediane": round(med_part * 100, 1),
                "ecart_pt": round((part - med_part) * 100, 1),
                "rang": rang,
                "n_communes": len(m),
                # Le niveau par fonction, en second.
                "eur_hab": round(eur, 1),
                "mediane": round(med_eur, 1),
                "ecart_pct": round((eur - med_eur) / med_eur * 100, 1) if med_eur > 0 else None,
            }
            # Les communes qui l'encadrent sur CETTE politique, par priorité. C'est
            # ce qui rend une fiche « écoles à Pantin » lisible plutôt que mince —
            # et le maillage interne se tisse tout seul, de commune en commune.
            i = rang - 1
            deb, fin = max(0, i - 3), min(len(ordre), i + 4)
            f["comparaison"]["voisins"] = [
                {"slug": sl, "nom": noms.get(sl, sl), "part": round(pt * 100, 1), "eur_hab": round(e, 1), "rang": k + 1}
                for k, (sl, pt, e) in enumerate(ordre[deb:fin], start=deb) if sl != slug
            ]
            attachees += 1
    # Les natures : même méthode, même strate, même lecture par la part.
    valn: dict[int, dict[str, dict[str, tuple[float, float]]]] = defaultdict(lambda: defaultdict(dict))
    for slug, doc in docs.items():
        pop = pops.get(slug, 0)
        base = doc["total"] - doc.get("reversement", 0)
        if pop <= 0 or base <= 0:
            continue
        st = strate_de(pop)
        for n in doc.get("natures", []):
            valn[st][n["key"]][slug] = (n["montant"] / pop, n["montant"] / base)
    classn: dict[int, dict[str, list[tuple[str, float, float]]]] = defaultdict(dict)
    for st, d in valn.items():
        for key, m in d.items():
            classn[st][key] = sorted(((sl, v[1], v[0]) for sl, v in m.items()), key=lambda x: -x[1])
    attachees_n = 0
    for slug, doc in docs.items():
        if "strate" not in doc:
            continue
        st = doc["strate"]["code"]
        for n in doc.get("natures", []):
            m = valn[st].get(n["key"]) or {}
            if len(m) < MIN_STRATE or slug not in m:
                continue
            eur, part = m[slug]
            med_eur = statistics.median(v[0] for v in m.values())
            med_part = statistics.median(v[1] for v in m.values())
            if med_part <= 0:
                continue
            ordre = classn[st][n["key"]]
            rang = next(k for k, (sl, _, _) in enumerate(ordre) if sl == slug) + 1
            i = rang - 1
            deb, fin = max(0, i - 3), min(len(ordre), i + 4)
            n["comparaison"] = {
                "part": round(part * 100, 1), "part_mediane": round(med_part * 100, 1), "ecart_pt": round((part - med_part) * 100, 1),
                "rang": rang, "n_communes": len(m),
                "eur_hab": round(eur, 1), "mediane": round(med_eur, 1),
                "ecart_pct": round((eur - med_eur) / med_eur * 100, 1) if med_eur > 0 else None,
                "voisins": [{"slug": sl, "nom": noms.get(sl, sl), "part": round(pt * 100, 1), "eur_hab": round(e, 1), "rang": k + 1}
                            for k, (sl, pt, e) in enumerate(ordre[deb:fin], start=deb) if sl != slug],
            }
            attachees_n += 1
    return {"fonctions_comparees": attachees, "natures_comparees": attachees_n}


# ---------------------------------------------------------------------------
# Écriture

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--annee", type=int, default=None, help="exercice (défaut : le plus récent présent dans le mart)")
    ap.add_argument("--limit", type=int, default=0, help="n'écrire que N communes (mise au point)")
    args = ap.parse_args()
    client = client_bq()
    annee = args.annee if args.annee is not None else annee_la_plus_recente(client)
    if annee is None:
        _log(f"✗ {MART} est vide — charger un exercice (sync_dgfip_nature_fonction.py) puis relancer dbt")
        return 1
    dataset_page = f"https://data.economie.gouv.fr/explore/dataset/{DATASET_PREFIX}{annee}/"

    origine = "demandé" if args.annee is not None else "le plus récent du mart"
    _log(f"→ À quoi sert l'argent : ventilation fonction × nature, par commune ({annee}, {origine})")
    if not NOMENCLATURE_FILE.exists():
        _log(f"✗ {NOMENCLATURE_FILE.relative_to(ROOT)} manquant — lancer d'abord "
             "pipeline/scripts/sync/sync_nomenclature_budgetaire.py")
        return 1
    lib = Libelles(NOMENCLATURE_FILE, TRADUCTIONS_FILE)
    _log(f"  = libellés : {len(lib.fonction)} fonctions, {len(lib.nature_m57)} comptes M57, "
         f"{len(lib.nature_m14)} comptes M14")

    index = json.loads(INDEX_FILE.read_text(encoding="utf-8"))["communes"]
    by_insee = lire_mart(client, annee)
    if not by_insee:
        _log(f"✗ aucune cellule pour {annee} dans {MART} — charger l'exercice puis relancer dbt")
        return 1
    _log(f"  ✓ cellules : {sum(len(b['cellules']) for b in by_insee.values()):,} · "
         f"communes avec fonction renseignée : {len(by_insee):,}")

    if OUT_ROOT.exists():
        shutil.rmtree(OUT_ROOT)
    OUT_ROOT.mkdir(parents=True, exist_ok=True)

    # Passe 1 : construire tous les documents. Passe 2 : comparer chaque commune
    # à sa strate — impossible avant d'avoir lu toutes les communes.
    docs: dict[str, dict] = {}
    metas: dict[str, dict] = {}
    pops: dict[str, int] = {}
    sans_slug: list[str] = []
    for insee, bucket in sorted(by_insee.items()):
        meta = index.get(insee)
        if not meta:
            # Une commune que la balance connaît et que l'index des communes du
            # site ne connaît pas (il est bâti sur un exercice OFGL donné, voir
            # sync_ofgl_all_communes.py) : pas de slug, donc pas d'adresse où
            # publier sa fiche. On la saute sans arrêter l'export, et on la nomme.
            sans_slug.append(f"{insee} ({bucket['libelle']})")
            continue
        payload = build_commune(bucket, lib)
        if payload is None or not payload["fonctions"]:
            continue
        docs[meta["slug"]] = payload
        metas[meta["slug"]] = meta
        pops[meta["slug"]] = meta.get("pop") or 0

    noms = {sl: m["nom"] for sl, m in metas.items()}
    stats = attacher_comparaisons(docs, pops, noms)
    n_avec_strate = sum(1 for d in docs.values() if "strate" in d)
    _log(f"  ✓ comparaison à la strate : {stats['fonctions_comparees']:,} fonctions et "
         f"{stats['natures_comparees']:,} natures sur {n_avec_strate:,} communes")

    manifest: dict[str, dict] = {}
    tailles: list[int] = []
    written = 0
    for slug, payload in docs.items():
        meta = metas[slug]
        insee = meta["insee"]
        doc = {
            "source": SOURCE_LABEL,
            "source_url": dataset_page,
            "source_libelles": lib.source_url,
            "source_pipeline": SOURCE_PIPELINE,
            "annee": annee,
            "scope": SCOPE,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "commune": {"insee": insee, "slug": slug, "nom": meta["nom"], "pop": meta.get("pop")},
            **payload,
        }
        dest = OUT_ROOT / slug / "fonctions.json"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        tailles.append(dest.stat().st_size)
        manifest[slug] = {
            "insee": insee,
            "total": payload["total"],
            "total_ventile": payload["total_ventile"],
            "non_ventile": payload["non_ventile"],
            "nomenclature": payload["nomenclature"],
            "n_fonctions": len(payload["fonctions"]),
            "strate": payload.get("strate", {}).get("code"),
            # Les slugs de fonction, pour que le sitemap et le pré-rendu sachent
            # quelles pages existent sans ouvrir les 3 248 fichiers du bucket.
            "fonctions": [f["slug"] for f in payload["fonctions"]],
            "natures": [n["slug"] for n in payload.get("natures", [])],
        }
        written += 1
        if args.limit and written >= args.limit:
            break

    MANIFEST_FILE.write_text(
        json.dumps({
            "source": SOURCE_LABEL,
            "source_url": dataset_page,
            "bucket": BUCKET_BASE,
            "annee": annee,
            "scope": SCOPE,
            "n_communes": len(manifest),
            "communes": manifest,
        }, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    _log(f"  ✓ {written:,} fichiers dans {OUT_ROOT.relative_to(ROOT)}")
    if sans_slug:
        _log(f"  ⚠ {len(sans_slug)} communes du mart absentes de {INDEX_FILE.relative_to(ROOT)}, "
             f"ignorées (pas de slug où publier) : {', '.join(sans_slug)}")
    if tailles:
        _log(f"  • poids par commune : médiane {statistics.median(tailles)/1024:.1f} Ko · "
             f"max {max(tailles)/1024:.1f} Ko · total {sum(tailles)/1e6:.1f} Mo")
    _log(f"  ✓ {MANIFEST_FILE.relative_to(ROOT)} ({MANIFEST_FILE.stat().st_size/1024:.0f} Ko)")

    if lib.manquants:
        # La liste COMPLÈTE part dans un fichier : vingt lignes à l'écran ne
        # suffisent pas pour compléter la table de traduction en une passe.
        dump = ROOT / "pipeline" / "cache" / "libelles-manquants.json"
        dump.parent.mkdir(parents=True, exist_ok=True)
        dump.write_text(json.dumps(sorted(lib.manquants), ensure_ascii=False, indent=1), encoding="utf-8")
        _log(f"✗ {len(lib.manquants)} libellés sans traduction anglaise "
             f"(pipeline/data/nomenclature-libelles-en.json) — liste dans {dump.relative_to(ROOT)} :")
        for axe, fr in sorted(lib.manquants)[:20]:
            _log(f"      [{axe}] {fr}")
        return 1
    _log("  ✓ tous les libellés affichés ont une traduction anglaise")

    national: dict[str, float] = defaultdict(float)
    for bucket in by_insee.values():
        for (fkey, _ref, _compte), montant in bucket["cellules"].items():
            national[fkey] += montant
    nat_total = sum(national.values())
    nat_nv = national.get("nv", 0.0)
    _log(f"  • national : {nat_total/1e9:.1f} Md€ dont {nat_nv/1e9:.1f} Md€ non ventilés "
         f"({nat_nv/nat_total:.1%})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
