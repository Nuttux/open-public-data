#!/usr/bin/env python3
"""
Export National Marchés Publics (DECP) → per-commune JSON.

Reads mart_marches_national (row-level, all commune buyers) and produces, for
each commune with procurement, a JSON aggregate (total, by year, by CPV theme,
top titulaires, biggest marchés + coverage note). Deterministic — no enrichment.

  website/public/data/communes-marches/{slug}/marches.json      (→ private bucket)
  website/public/data/communes-marches/{slug}/fournisseurs.json  (→ private bucket)
  website/public/data/communes-marches/{slug}/contrats.json      (→ private bucket, fiche contrat)
  website/src/data/communes-marches-manifest.json            (committed, slug→years)
  website/public/data/communes-marches/_sitemap/*.txt        (→ private bucket, sitemap des fiches contrat)

Coverage: DECP publishes marchés ≥ 40 k€ HT (~50-70% national). Shown, not hidden.

Usage:
    python scripts/export/export_marches_national.py --slugs pantin albi
    python scripts/export/export_marches_national.py --all
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import unicodedata
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import bigquery

PIPELINE_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ID = "open-data-france-484717"
_MARTS = os.environ.get("NATIONAL_MARTS_DATASET", "dbt_paris_national_marts")
MART = f"{PROJECT_ID}.{_MARTS}.mart_marches_national"

WEBSITE_DATA = PIPELINE_ROOT.parent / "website" / "public" / "data"
INDEX_FILE = WEBSITE_DATA / "communes-all" / "index.json"
OUT_ROOT = WEBSITE_DATA / "communes-marches"
MANIFEST_FILE = PIPELINE_ROOT.parent / "website" / "src" / "data" / "communes-marches-manifest.json"

SOURCE_LABEL = "Marchés publics (DECP consolidé, data.gouv.fr)"
SOURCE_URL = "https://www.data.gouv.fr/fr/datasets/donnees-essentielles-de-la-commande-publique-consolidees-format-tabulaire/"
SOURCE_PIPELINE = "DECP parquet → dbt national (mart_marches_national) → export_marches_national.py"
COVERAGE_NOTE = "Marchés de plus de 40 000 € HT déclarés à la notification (DECP) : montants des contrats, pas les paiements. Les plus petits marchés ne sont pas publiés ; les montants manifestement erronés sont écartés."
BUCKET_BASE = "https://storage.googleapis.com/qipu-communes-budget/communes-marches"


def load_slug_index() -> dict:
    return json.load(open(INDEX_FILE, encoding="utf-8"))["communes"]


def get_client() -> bigquery.Client:
    if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        p = Path.home() / ".config" / "gcloud" / "application_default_credentials.json"
        if p.exists():
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(p)
    return bigquery.Client(project=PROJECT_ID)


def fetch(client, insees):
    where = "WHERE code_insee IN UNNEST(@insees)" if insees else ""
    params = [bigquery.ArrayQueryParameter("insees", "STRING", insees)] if insees else []
    sql = f"""
        SELECT code_insee, commune_nom, population, annee, date_notification, montant, categorie_cpv,
               type_procedure, objet, titulaire_nom, titulaire_siren,
               titulaire_personne_physique, montant_invraisemblable, depenses_totales_commune, marche_id, duree_mois,
               nature_marche, forme_prix, offres_recues, ccag, techniques, considerations_sociales,
               considerations_environnementales, sous_traitance_declaree, lieu_execution_code, lieu_execution_type,
               id_accord_cadre, nb_titulaires, nb_modifications
        FROM `{MART}` {where}
    """
    job = client.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=params))
    by_insee = defaultdict(list)
    for r in job.result():
        by_insee[r["code_insee"]].append(dict(r))
    return by_insee


_APOS = re.compile(r"(?<=[A-Za-zÀ-ÿœŒ])\?(?=[A-Za-zÀ-ÿœŒ])")
PERSONNES_LABEL = "Entrepreneurs individuels"
SANS_SIRET_LABEL = "Titulaire sans SIRET"


def titulaire_public(r: dict) -> tuple[str | None, str | None]:
    """Le nom et le SIREN qu'on peut publier pour le titulaire d'une ligne.

    Vie privée : un entrepreneur individuel (catégorie juridique 1000) est une
    personne physique, jamais nommée. Un titulaire SANS SIRET ne peut pas être
    vérifié dans SIRENE — le drapeau personne physique y vaudrait FALSE par
    défaut et le nom d'un particulier passerait : il n'est pas nommé non plus.
    """
    if r.get("titulaire_personne_physique"):
        return PERSONNES_LABEL, None
    siren = r.get("titulaire_siren")
    if not siren:
        return SANS_SIRET_LABEL, None
    return (r.get("titulaire_nom") or "").strip() or None, siren


def contrat_id(marche_ids: list[str]) -> str:
    """Identifiant court et stable d'un marché regroupé (ses lots) : empreinte du
    plus petit uid DECP. L'uid seul ne sert pas d'adresse : jusqu'à 323
    caractères, avec « * », accents et espaces."""
    base = min(m for m in marche_ids if m) if any(marche_ids) else "".join(sorted(map(str, marche_ids)))
    return hashlib.sha1(base.encode("utf-8")).hexdigest()[:8]


def slugify(t: str, limit: int = 60) -> str:
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    if len(t) > limit:
        t = t[:limit].rsplit("-", 1)[0]
    return t or "marche"

# Le DECP consolidé a perdu des accents dans ~4 500 intitulés (caractère U+FFFD).
# On répare les mots fréquents par dictionnaire ; ailleurs le caractère devient
# « é » (le cas de loin le plus fréquent), « à » s'il est seul, « ° » après « n ».
_FFFD = "\ufffd"
_ACCENT_WORDS = {
    "pi�ces": "pièces", "pi�ce": "pièce", "syst�me": "système", "syst�mes": "systèmes",
    "hygi�ne": "hygiène", "acc�s": "accès", "r�glement": "règlement", "�l�ves": "élèves",
    "contr�le": "contrôle", "contr�les": "contrôles", "p�le": "pôle", "h�tel": "hôtel",
    "ma�trise": "maîtrise", "ma�onnerie": "maçonnerie", "fa�ades": "façades", "fa�ade": "façade",
    "�me": "ème", "b�timent": "bâtiment", "b�timents": "bâtiments", "th��tre": "théâtre",
    "cr�che": "crèche", "cr�ches": "crèches", "biblioth�que": "bibliothèque", "m�diath�que": "médiathèque",
    "coll�ge": "collège", "probl�me": "problème", "mod�le": "modèle", "�tre": "être",
    "pr�s": "près", "apr�s": "après", "tr�s": "très", "d�s": "dès", "arr�t": "arrêt",
    "enqu�te": "enquête", "f�te": "fête", "f�tes": "fêtes", "forêt": "forêt", "for�t": "forêt",
    "ch�teau": "château", "�tang": "étang", "ma�tre": "maître", "b�ton": "béton",
    "c�ble": "câble", "c�bles": "câbles", "c�blage": "câblage", "d�p�t": "dépôt",
    "co�t": "coût", "go�ter": "goûter", "s�r": "sûr", "s�ret�": "sûreté",
    "cl�ture": "clôture", "cl�tures": "clôtures", "r�le": "rôle", "d�me": "dôme",
    "gar�ons": "garçons", "le�ons": "leçons", "fran�ais": "français", "fran�aise": "française",
    "no�l": "noël", "�uvre": "œuvre", "�uvres": "œuvres", "man�uvre": "manœuvre",
}
_WORD = re.compile(r"[A-Za-zÀ-ÿ\ufffd]+")


def _repair_word(m: re.Match) -> str:
    w = m.group(0)
    if _FFFD not in w:
        return w
    fixed = _ACCENT_WORDS.get(w.lower())
    if fixed is None:
        if w.lower() == "n" + _FFFD:
            fixed = "n°"
        else:
            fixed = w.replace(_FFFD, "é")
    if w.isupper():
        return fixed.upper()
    if w[0].isupper():
        return fixed[0].upper() + fixed[1:]
    return fixed


# Table d'accents apprise sur le corpus lui-même (scripts/export/
# build_objet_accents.py) : forme sans accent → graphie accentuée dominante.
# Elle sert à repasser en casse de phrase les objets tout en capitales sans
# fabriquer d'orthographe — un mot jamais vu accentué reste tel quel.
_ACCENTS_PATH = Path(__file__).resolve().parents[2] / "seeds" / "objet_accents.json"
try:
    _ACC_FILE = json.loads(_ACCENTS_PATH.read_text(encoding="utf-8"))
    _OBJET_ACCENTS: dict[str, str] = _ACC_FILE["mots"]
    _VOCAB: set[str] = set(_ACC_FILE.get("vocab", ()))
except (OSError, ValueError, KeyError):  # table absente : on n'abaisse pas la casse
    _OBJET_ACCENTS, _VOCAB = {}, set()

# Sigles et mots à garder en capitales dans une phrase remise en casse basse.
_SIGLES = {
    "BTP", "VRD", "HT", "TTC", "TVA", "CCAS", "CIAS", "EHPAD", "ZAC", "ZAE", "PLU",
    "SDIS", "AEP", "EU", "EP", "PMR", "ERP", "CVC", "GTB", "GTC", "SSI", "PC",
    "MOE", "MOA", "AMO", "OPC", "SPS", "CSPS", "DSP", "AOT", "RD", "RN", "GO",
    "PVC", "LED", "TNT", "ADSL", "GSM", "SIG", "GPS", "ALSH", "ALAE", "MJC",
    "CAF", "CNRACL", "SIVU", "SIVOM", "EPCI", "ONF", "SNCF", "EDF", "GRDF",
}
_MOT = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ]+")
# Mots outils qui apparaissent dans des noms de communes (« Les Vans », « Aux
# Marais », « Sous-Parsat ») mais appartiennent d'abord à la langue.
_NOM_STOP = {"le", "la", "les", "des", "du", "de", "aux", "au", "sur", "sous",
             "en", "et", "les", "lez", "sainte", "saint", "ville", "villes"}


def _strip_accents(w: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", w) if unicodedata.category(c) != "Mn").lower()


def _lower_word(m: re.Match) -> str:
    """Un mot du corpus s'abaisse ; un sigle garde ses capitales.

    C'est le vocabulaire appris (les mots vus en casse mixte dans les 517 000
    objets) qui tranche, pas une liste écrite à la main : « LOT » est un mot
    français courant et devient « lot », « SLT » n'apparaît jamais en minuscules
    et reste « SLT ».
    """
    w = m.group(0)
    plain = _strip_accents(w)
    if plain in _OBJET_ACCENTS:
        return _OBJET_ACCENTS[plain]
    if w in _SIGLES:
        return w
    # Court, tout en capitales, jamais vu comme un mot : c'est un sigle. Les
    # mots d'une ou deux lettres (« et », « de », « l ») s'abaissent toujours :
    # le vocabulaire ne les compte pas et il n'y a pas de sigle de deux lettres
    # hors de la liste ci-dessus.
    if 3 <= len(w) <= 5 and w.isupper() and plain not in _VOCAB:
        return w
    return w.lower()


# Retour à la ligne devenu « n » chez le producteur (« communauxnTerrassements »,
# « VIDÉOPROTECTION nLot 2 ») : 469 objets dans le pays, surtout des offices HLM,
# des départements et des SPL. Un « n » seul devant une capitale n'est jamais un
# mot ; un « n » collé ne saute que si le mot sans lui est connu du corpus et le
# mot avec lui ne l'est pas — « MonLogement27 » reste entier.
# Jusqu'à trois « n » d'affilée : deux retours à la ligne perdus (« 2023 nnUne réunion »).
_N_SEUL = re.compile(r"(?:(?<=\s)|^)n{1,3}(?=[A-ZÀ-Ö])")
_N_COLLE = re.compile(r"([^\W\d_]*?[^\W\d_n])(n{1,3})(?=[A-ZÀ-Ö])")


# Même perte devant une minuscule (« de la communenmarché subséquent ») : règle
# plus stricte, deux mots connus d'au moins cinq lettres de part et d'autre, et
# le mot soudé inconnu — « fonctionnement », « questionnaire » restent entiers.
_N_COLLE_BAS = re.compile(r"([^\W\d_]{5,})n([a-zà-ÿ]{5,})(?![^\W\d_])")


# Après un chiffre (« accord cadre n° 23.061nfournit », « 2023nLot ») : devant une
# capitale toujours, devant une minuscule seulement si le mot qui suit est connu
# et le mot avec le « n » ne l'est pas (« 5nouveaux » garderait son n).
_N_CHIFFRE = re.compile(r"(?<=\d)n([A-ZÀ-Ö][^\W\d_]{2,}|[a-zà-ÿ]{4,})(?![^\W\d_])")


def _connu(w: str) -> bool:
    plain = _strip_accents(w)
    return plain in _OBJET_ACCENTS or plain in _VOCAB


def _decolle_n(m: re.Match) -> str:
    w, ns = m.group(1), m.group(2)
    if _connu(w) and not _connu(w + ns):
        return w + " "
    return m.group(0)


def _decolle_n_chiffre(m: re.Match) -> str:
    r = m.group(1)
    if r[0].isupper() or (_connu(r) and not _connu("n" + r)):
        return " " + r
    return m.group(0)


def _decolle_n_bas(m: re.Match) -> str:
    w, r = m.group(1), m.group(2)
    if _connu(w) and _connu(r) and not _connu(w + "n") and not _connu(w + "n" + r):
        return w + " " + r
    return m.group(0)


def _mostly_upper(t: str) -> bool:
    letters = [c for c in t if c.isalpha()]
    if len(letters) < 12:
        return False
    return sum(1 for c in letters if c.isupper()) / len(letters) > 0.85


def _sentence_case(t: str) -> str:
    """« PRESTATIONS DE DERATISATION » → « Prestations de dératisation ».

    Les objets DECP arrivent pour un tiers tout en capitales, où le français
    perd ses accents par convention. Les abaisser sans les réaccentuer
    fabriquerait des fautes ; on s'appuie donc sur la table apprise du corpus.
    """
    if not _OBJET_ACCENTS or not _mostly_upper(t):
        return t
    out = _MOT.sub(_lower_word, t)
    # Majuscule initiale sur la première lettre de la phrase.
    for i, c in enumerate(out):
        if c.isalpha():
            return out[:i] + c.upper() + out[i + 1:]
    return out


def _sentence_case_prefix(t: str) -> str:
    """« PRESTATIONS DE SURVEILLANCE L'exécution débutera… » : un titre en
    capitales suivi d'une description en casse basse. Le titre seul passe en
    casse de phrase, la description reste telle quelle. Sans cela la page
    affichait « pRESTATIONS DE SURVEILLANCE L'exécution… »."""
    mots = t.split(" ")
    n = 0
    for w in mots:
        if any(c.islower() for c in w):
            break
        n += 1
    if n < 2 or n == len(mots):
        return t
    tete = " ".join(mots[:n])
    if not _mostly_upper(tete):
        return t
    return _sentence_case(tete) + " " + " ".join(mots[n:])


_PREFIXES = ("ET", "DE", "DES", "DU", "LA", "LE", "LES", "SUR", "POUR", "AUX", "EN")
_COLLE = re.compile(r"\b(" + "|".join(_PREFIXES) + r")([A-ZÀ-Ö]{4,})\b")


def _split_glued(m: re.Match) -> str:
    """« ETTRAVAUX » → « ET TRAVAUX », mais « DERATISATION » reste entier."""
    whole, head, tail = m.group(0), m.group(1), m.group(2)
    if not _VOCAB:
        return whole
    if _strip_accents(whole) in _VOCAB:      # mot réel du corpus : on n'y touche pas
        return whole
    if _strip_accents(tail) in _VOCAB:       # le morceau restant est un vrai mot
        return f"{head} {tail}"
    return whole


def restore_nom(t: str, nom: str | None) -> str:
    """« ville de pantin » → « ville de Pantin ».

    La remise en casse de phrase abaisse aussi les noms propres. Le seul qu'on
    puisse rétablir sans deviner est celui de la commune elle-même, et c'est de
    loin le plus fréquent dans les objets.
    """
    if not nom or not t:
        return t
    # On rétablit le nom ENTIER, pas mot à mot : pour « Les Vans », rendre sa
    # majuscule à « les » capitalisait tous les « les » de la phrase
    # (« dans Les écoles »). Idem « Aux Marais », « Sous-Parsat ».
    # Les séparateurs de la source varient (« Le Grau-du-Roi » / « Le Grau du
    # Roi ») et les accents manquent (« SAINT-ETIENNE ») : la comparaison les
    # ignore des deux côtés.
    words = [w for w in re.split(r"[\s'’-]+", nom) if w]
    if words:
        pattern = r"[\s'’-]+".join(re.escape(_strip_accents(w)) for w in words)
        t = re.sub(rf"(?<![\w’']){pattern}(?![\w’'])",
                   nom,
                   t,
                   flags=re.IGNORECASE)
        # Deuxième passe sur la forme accentuée telle quelle, si la source
        # l'écrit déjà avec ses accents.
        t = re.sub(rf"(?<![\w’']){r'[\s’-]+'.join(re.escape(w) for w in words)}(?![\w’'])",
                   nom, t, flags=re.IGNORECASE)
    # Les mots distinctifs isolés (« PANTIN » seul, « ETIENNE » séparé) sont
    # rétablis un par un — jamais les mots outils, qui appartiennent à la
    # langue autant qu'au nom.
    parts = {_strip_accents(w): w for w in words if len(w) >= 4 and _strip_accents(w) not in _NOM_STOP}
    if not parts:
        return t
    return _MOT.sub(lambda m: parts.get(_strip_accents(m.group(0)), m.group(0)), t)


def trim_objet(t: str, limit: int) -> str:
    """Coupe au mot, avec des points de suspension.

    La coupe brutale à 120 ou 200 caractères produisait « … DANS L » ou
    « … toutes manifestations publi » : la page avait l'air cassée à l'endroit
    le plus concret.
    """
    if len(t) <= limit:
        return t
    cut = t[:limit].rstrip()
    space = cut.rfind(" ")
    if space > limit * 0.6:
        cut = cut[:space]
    return cut.rstrip(" ,;:.-—–") + "…"


def clean_objet(objet: str | None) -> str:
    """Répare les apostrophes cassées (« d?électricité ») et les accents perdus,
    recolle les mots soudés de la source, et remet en casse de phrase les objets
    écrits tout en capitales."""
    t = (objet or "").strip()
    t = re.sub(r"[\r\n]+", " ", t)
    t = _N_SEUL.sub("", t)
    t = _N_COLLE.sub(_decolle_n, t)
    t = _N_COLLE_BAS.sub(_decolle_n_bas, t)
    t = _N_CHIFFRE.sub(_decolle_n_chiffre, t)
    # « ?uvre » = œ perdu ; « ? » isolé entre deux mots = tiret perdu.
    t = re.sub(r"(?i)\?uvre", lambda m: "ŒUVRE" if m.group(0)[1:].isupper() else "œuvre", t)
    t = re.sub(r"(?<=\S) \? (?=\S)", " - ", t)
    if _FFFD in t:
        t = re.sub(r"(?<![^\s])" + _FFFD + r"(?![^\s])", "à", t)   # « � » seul = « à »
        t = _WORD.sub(_repair_word, t)
        t = t.replace(_FFFD, "é")
    t = _APOS.sub("’", t)
    # Espace mangée par la source : « CORRECTIVE ETTRAVAUX ». On ne coupe QUE si
    # le mot collé est inconnu du corpus et que les deux morceaux, eux, y sont —
    # sinon « DERATISATION » deviendrait « DE RATISATION ».
    t = _COLLE.sub(_split_glued, t)
    t = re.sub(r"\s{2,}", " ", t).strip()
    return _sentence_case(t) if _mostly_upper(t) else _sentence_case_prefix(t)


def _lot_key(r: dict) -> tuple:
    """Un marché alloti arrive en N lignes (une par lot) : même objet, même
    titulaire, même année. On les regroupe pour la liste des plus gros marchés."""
    return (re.sub(r"\s+", " ", clean_objet(r["objet"]).lower()), (r["titulaire_nom"] or "").strip().lower(), r["annee"])


def build(insee: str, meta: dict, rows: list[dict], now: str) -> dict | None:
    if not rows:
        return None
    # Plafond de vraisemblance (flag calculé dans core_marches_national) : les
    # montants aberrants sont comptés à part, jamais additionnés ni listés.
    exclus = [r for r in rows if r.get("montant_invraisemblable")]
    rows = [r for r in rows if not r.get("montant_invraisemblable")]
    # Deuxième garde-fou, par exercice : si les contrats notifiés une année
    # dépassent deux années entières de dépenses de la commune ET 20 M€, c'est
    # la publication qui est hors d'échelle (Nice, Annecy : plafonds par lot
    # multipliés), pas l'achat. Le plancher de 20 M€ protège les villages dont
    # une année de gros chantier dépasse naturellement deux budgets annuels.
    # L'année est écartée et nommée dans le fichier.
    dep_commune = next((r["depenses_totales_commune"] for r in rows if r.get("depenses_totales_commune")), None)
    annees_ecartees: list[int] = []
    if dep_commune:
        par_annee = defaultdict(float)
        for r in rows:
            if r["annee"]:
                par_annee[int(r["annee"])] += r["montant"] or 0
        annees_ecartees = sorted(y for y, t in par_annee.items() if t > 2 * dep_commune and t >= 20_000_000)
        if annees_ecartees:
            ecartes = [r for r in rows if r["annee"] and int(r["annee"]) in annees_ecartees]
            exclus.extend(ecartes)
            rows = [r for r in rows if not (r["annee"] and int(r["annee"]) in annees_ecartees)]
    if not rows:
        return None
    total_m = sum(r["montant"] or 0 for r in rows)
    by_year = defaultdict(lambda: {"montant": 0.0, "nb": 0})
    by_cat = defaultdict(lambda: {"montant": 0.0, "nb": 0})
    by_titu = defaultdict(lambda: {"montant": 0.0, "nb": 0})
    for r in rows:
        m = r["montant"] or 0
        y = r["annee"]
        if y:
            by_year[int(y)]["montant"] += m
            by_year[int(y)]["nb"] += 1
        cat = r["categorie_cpv"] or "Autres"
        by_cat[cat]["montant"] += m
        by_cat[cat]["nb"] += 1
        # Vie privée : un entrepreneur individuel est une personne physique,
        # agrégée sous un libellé commun, jamais nommée, jamais de fiche.
        t, t_siren = titulaire_public(r)
        if t:
            by_titu[t]["montant"] += m
            by_titu[t]["nb"] += 1
            if t_siren:
                by_titu[t].setdefault("siren", t_siren)
    # Lots regroupés : une entrée par (objet, titulaire, année), montants sommés.
    lots: dict[tuple, dict] = {}
    for r in rows:
        k = _lot_key(r)
        g = lots.setdefault(k, {"row": r, "rows": [], "montant": 0.0, "nb_lots": 0, "date": None})
        g["rows"].append(r)
        g["montant"] += r["montant"] or 0
        g["nb_lots"] += 1
        # Un marché alloti a une date par lot : on retient la plus récente, celle
        # qui dit quand l'affaire est devenue publique.
        d = r.get("date_notification")
        if d and (g["date"] is None or str(d) > str(g["date"])):
            g["date"] = str(d)[:10]
    # Chaque marché regroupé reçoit son identifiant, son adresse lisible et son
    # rang dans l'année (1 = le plus gros notifié par la commune cette année-là).
    par_annee_groupes: dict[int | None, list[dict]] = defaultdict(list)
    for g in lots.values():
        g["id"] = contrat_id([x.get("marche_id") for x in g["rows"]])
        g["objet_clean"] = restore_nom(trim_objet(clean_objet(g["row"]["objet"]), 200), meta.get("nom"))
        g["slug"] = f"{slugify(g['objet_clean'])}-{g['id']}"
        par_annee_groupes[int(g["row"]["annee"]) if g["row"]["annee"] else None].append(g)
    for groupes in par_annee_groupes.values():
        groupes.sort(key=lambda g: -g["montant"])
        for i, g in enumerate(groupes):
            g["rang_annee"], g["nb_annee"] = i + 1, len(groupes)
    top_marches = sorted(lots.values(), key=lambda g: -g["montant"])[:15]
    # Dernière année publiée, à part : la page ville parle de l'année, pas du
    # cumul depuis 2018 (domaines et fournisseurs de cette année-là).
    # L'année en cours est entamée : le bloc « Ce que la commune achète » titre
    # sur la dernière année complète. En septembre 2026, « 1,2 M€ notifiés en
    # 2026 · 18 marchés » faisait petit et faux ; l'année entamée reste dans
    # by_year et dans le total.
    annee_en_cours = datetime.now(timezone.utc).year
    annees_completes = [y for y in by_year if y < annee_en_cours]
    last_year = max(annees_completes) if annees_completes else (max(by_year) if by_year else None)
    ly_rows = [r for r in rows if r["annee"] and int(r["annee"]) == last_year]
    ly_cat: dict[str, dict] = defaultdict(lambda: {"montant": 0.0, "nb": 0})
    ly_titu: dict[str, dict] = defaultdict(lambda: {"montant": 0.0, "nb": 0})
    for r in ly_rows:
        m = r["montant"] or 0
        ly_cat[r["categorie_cpv"] or "Autres"]["montant"] += m
        ly_cat[r["categorie_cpv"] or "Autres"]["nb"] += 1
        t, t_siren = titulaire_public(r)
        if t:
            ly_titu[t]["montant"] += m
            ly_titu[t]["nb"] += 1
            ly_titu[t].setdefault("objet", restore_nom(trim_objet(clean_objet(r["objet"]), 120), meta.get("nom")))
            if t_siren:
                ly_titu[t].setdefault("siren", t_siren)
    # Fiche fournisseur locale (bloc 3) : par SIREN, tous les marchés (lots
    # regroupés) que la commune lui a notifiés. Jamais pour une personne
    # physique : les entrepreneurs individuels n'ont pas de fiche.
    fourn: dict[str, dict] = {}
    for g in lots.values():
        r = g["row"]
        _, siren = titulaire_public(r)
        if not siren:
            continue
        f = fourn.setdefault(siren, {
            "siren": siren, "nom": (r["titulaire_nom"] or "").strip(), "montant": 0.0, "nb": 0,
            "first_year": None, "last_year": None, "marches": [],
        })
        f["montant"] += g["montant"]
        f["nb"] += g["nb_lots"]
        y = int(r["annee"]) if r["annee"] else None
        if y:
            f["first_year"] = y if f["first_year"] is None else min(f["first_year"], y)
            f["last_year"] = y if f["last_year"] is None else max(f["last_year"], y)
        f["marches"].append({
            "id": g["id"],
            "slug": g["slug"],
            "objet": g["objet_clean"],
            "montant": g["montant"],
            "nb_lots": g["nb_lots"],
            "annee": y,
            "duree_mois": r.get("duree_mois"),
            "procedure": r.get("type_procedure"),
            "categorie": r.get("categorie_cpv"),
        })
    for f in fourn.values():
        f["marches"].sort(key=lambda m: (-(m["annee"] or 0), -m["montant"]))

    def oui(rows_: list[dict], col: str) -> bool | None:
        vals = [x.get(col) for x in rows_ if x.get(col) is not None]
        return any(vals) if vals else None

    def premier(rows_: list[dict], col: str):
        return next((x.get(col) for x in rows_ if x.get(col) not in (None, "")), None)

    # La fiche contrat : un marché regroupé, tout ce que la DECP en dit.
    contrats: dict[str, dict] = {}
    for g in lots.values():
        r, rs = g["row"], g["rows"]
        nom, siren = titulaire_public(r)
        offres = [int(x["offres_recues"]) for x in rs if x.get("offres_recues") is not None]
        contrats[g["id"]] = {
            "id": g["id"],
            "slug": g["slug"],
            "objet": g["objet_clean"],
            "montant": g["montant"],
            "annee": int(r["annee"]) if r["annee"] else None,
            "date": g["date"],
            "duree_mois": premier(rs, "duree_mois"),
            "rang_annee": g["rang_annee"],
            "nb_annee": g["nb_annee"],
            "titulaire": nom,
            "siren": siren,
            "personne_physique": bool(r.get("titulaire_personne_physique")),
            "nb_titulaires": max((int(x["nb_titulaires"]) for x in rs if x.get("nb_titulaires")), default=None),
            "procedure": premier(rs, "type_procedure"),
            "nature": premier(rs, "nature_marche"),
            "categorie": r.get("categorie_cpv"),
            "forme_prix": premier(rs, "forme_prix"),
            "ccag": premier(rs, "ccag"),
            "techniques": premier(rs, "techniques"),
            # Accord-cadre : dit par la nature (« ACCORD-CADRE »), la technique d'achat,
            # ou un marché subséquent qui pointe vers son accord.
            "accord_cadre": bool(
                any(x.get("id_accord_cadre") for x in rs)
                or "ACCORD" in (premier(rs, "nature_marche") or "").upper()
                or "accord-cadre" in (premier(rs, "techniques") or "").lower()
            ),
            "offres_recues": min(offres) if offres else None,
            "offres_recues_max": max(offres) if offres else None,
            "considerations_sociales": premier(rs, "considerations_sociales"),
            "considerations_environnementales": premier(rs, "considerations_environnementales"),
            "sous_traitance_declaree": oui(rs, "sous_traitance_declaree"),
            "nb_modifications": max((int(x["nb_modifications"]) for x in rs if x.get("nb_modifications") is not None), default=None),
            "lieu_execution": {"code": premier(rs, "lieu_execution_code"), "type": premier(rs, "lieu_execution_type")} if premier(rs, "lieu_execution_code") else None,
            "nb_lots": g["nb_lots"],
            "lots": [
                {"montant": x["montant"], "date": str(x["date_notification"])[:10] if x.get("date_notification") else None, "offres_recues": x.get("offres_recues")}
                for x in sorted(rs, key=lambda x: -(x["montant"] or 0))
            ] if g["nb_lots"] > 1 else [],
        }

    return {
        "_contrats": contrats,
        "_fournisseurs": sorted(fourn.values(), key=lambda f: -f["montant"]),
        "generated_at": now,
        "source": SOURCE_LABEL,
        "source_url": SOURCE_URL,
        "source_pipeline": SOURCE_PIPELINE,
        "coverage_note": COVERAGE_NOTE,
        "commune": {"insee": insee, "slug": meta["slug"], "nom": meta["nom"]},
        "total": {
            "montant": total_m,
            "nb_marches": len(rows),
            "nb_titulaires": len(by_titu),
            "nb_exclus_invraisemblables": len(exclus),
            "annees_ecartees": annees_ecartees,
        },
        "by_year": [{"year": y, **v} for y, v in sorted(by_year.items())],
        "last_year": {
            "year": last_year,
            "montant": sum(r["montant"] or 0 for r in ly_rows),
            "nb_marches": len(ly_rows),
            "by_category": sorted(({"categorie": k, **v} for k, v in ly_cat.items()), key=lambda x: -x["montant"]),
            "top_titulaires": sorted(
                ({"nom": k, "personne_physique": k == PERSONNES_LABEL, **v} for k, v in ly_titu.items()),
                key=lambda x: -x["montant"],
            )[:10],
        },
        "by_category": sorted(
            ({"categorie": k, **v} for k, v in by_cat.items()), key=lambda x: -x["montant"]
        ),
        "top_titulaires": sorted(
            (
                {"nom": k, "personne_physique": k == PERSONNES_LABEL, **v}
                for k, v in by_titu.items()
            ),
            key=lambda x: -x["montant"],
        )[:15],
        "top_marches": [
            {
                "id": g["id"],
                "slug": g["slug"],
                "objet": g["objet_clean"],
                "montant": g["montant"],
                "nb_lots": g["nb_lots"],
                "titulaire": titulaire_public(g["row"])[0],
                "siren": titulaire_public(g["row"])[1],
                "annee": g["row"]["annee"],
                # La date de notification : sans elle, impossible de dire ce qui
                # est nouveau depuis la dernière visite, donc impossible de notifier.
                "date": g["date"],
                "procedure": g["row"]["type_procedure"],
                "categorie": g["row"]["categorie_cpv"],
            }
            for g in top_marches
        ],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slugs", nargs="*", default=[])
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()

    idx = load_slug_index()
    slug_to_insee = {v["slug"]: k for k, v in idx.items()}
    insees = None if args.all else [slug_to_insee[s] for s in args.slugs if s in slug_to_insee]
    if not args.all and not insees:
        print("Nothing to export.")
        return 1

    client = get_client()
    by_insee = fetch(client, insees)
    print(f"→ marchés for {len(by_insee)} commune(s)")
    now = datetime.now(timezone.utc).isoformat()

    keys = list(by_insee.keys())[: args.limit] if args.limit else list(by_insee.keys())
    # Empreinte nationale d'un fournisseur : dans combien de communes il est
    # titulaire, pour combien (marchés vraisemblables). Complète en --all,
    # partielle sinon (dev). Sert au second niveau « ailleurs en France ».
    national: dict[str, dict] = {}
    for rows in by_insee.values():
        for r in rows:
            siren = r.get("titulaire_siren")
            if not siren or r.get("titulaire_personne_physique") or r.get("montant_invraisemblable"):
                continue
            n = national.setdefault(siren, {"communes": set(), "montant": 0.0, "nb": 0})
            n["communes"].add(r["code_insee"])
            n["montant"] += r["montant"] or 0
            n["nb"] += 1
    manifest = {}
    for insee in keys:
        meta = idx.get(insee)
        if not meta:
            continue
        payload = build(insee, meta, by_insee[insee], now)
        if not payload:
            continue
        out = OUT_ROOT / meta["slug"]
        out.mkdir(parents=True, exist_ok=True)
        fournisseurs = payload.pop("_fournisseurs")
        contrats = payload.pop("_contrats")
        for f in fournisseurs:
            n = national.get(f["siren"])
            f["national"] = {"communes": len(n["communes"]), "montant": n["montant"], "nb": n["nb"]} if n else None
        json.dump(
            {
                "generated_at": now, "source": SOURCE_LABEL, "source_url": SOURCE_URL,
                "coverage_note": COVERAGE_NOTE, "national_complet": bool(args.all),
                "commune": payload["commune"], "annees_ecartees": payload["total"]["annees_ecartees"],
                "fournisseurs": fournisseurs,
            },
            open(out / "fournisseurs.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"),
        )
        json.dump(payload, open(out / "marches.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        json.dump(
            {
                "generated_at": now, "source": SOURCE_LABEL, "source_url": SOURCE_URL,
                "coverage_note": COVERAGE_NOTE, "commune": payload["commune"], "contrats": contrats,
            },
            open(out / "contrats.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"),
        )
        manifest[meta["slug"]] = {
            "years": [y["year"] for y in payload["by_year"]],
            "montant": round(payload["total"]["montant"]),
            "nb": payload["total"]["nb_marches"],
        }
    print(f"  ✓ wrote {len(manifest)} commune files → {OUT_ROOT}")

    if args.all:
        MANIFEST_FILE.parent.mkdir(parents=True, exist_ok=True)
        json.dump(
            {"source": SOURCE_LABEL, "bucket": BUCKET_BASE, "n_communes": len(manifest), "communes": manifest},
            open(MANIFEST_FILE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"),
        )
        print(f"  ✓ manifest → {MANIFEST_FILE} ({len(manifest)} communes)")
        # Les adresses des fiches contrat, en segments prêts pour le sitemap
        # (dans OUT_ROOT/_sitemap, envoyés au bucket avec le reste).
        from build_contrats_sitemap import collect_paths, write_segments
        paths = collect_paths(OUT_ROOT)
        print(f"  ✓ sitemap des contrats : {len(paths)} adresses en {write_segments(paths, OUT_ROOT, MANIFEST_FILE)} segments")
    return 0


if __name__ == "__main__":
    sys.exit(main())
