#!/usr/bin/env python3
"""
DGFiP « présentation croisée nature-fonction » → à quoi sert l'argent, commune
par commune, jusqu'au grain que le fichier autorise.

Ce que la source est vraiment :
    Chaque ligne de la balance porte À LA FOIS une FONCTION (la politique
    publique : écoles, culture, voirie) et un COMPTE (la nature : personnel,
    achats, subventions versées). Le grain réel est donc
    `commune × fonction × compte`, soit 1,8 million de lignes pour 3 384
    communes — 534 couples par commune en moyenne, 3 153 au maximum.

    La première version de ce script ne gardait que le PREMIER CHIFFRE du code
    fonction et sommait tous les comptes : neuf lignes plates par commune. Elle
    transformait une table croisée en camembert. On garde désormais l'arbre :

        fonction principale  →  sous-fonction (le code tel que la commune le
                                vote : « Écoles primaires », « Crèches »)
                             →  nature (« Personnel titulaire », « Subventions
                                aux associations »)

Trois pièges, tous payés une fois :

 1. LES CODES M14 ET M57 NE DÉSIGNENT PAS LA MÊME CHOSE. Le jeu est à 99 % en
    M57. Appliquer les libellés M14 à des codes M57 faisait apparaître Paris
    avec « 27 % de sport et jeunesse » là où il s'agit de santé et action
    sociale. On agrège sur des clés NEUTRES et le libellé se choisit d'après la
    nomenclature dominante de chaque commune.

 2. LA RUBRIQUE 01 N'EST PAS LA FONCTION 0. La nomenclature officielle la
    nomme « Opérations non ventilables » : dette, fiscalité, opérations
    générales, rattachées à AUCUNE politique. La replier dans « administration
    générale » faisait lire 48 % à Pantin quand 23,3 M€ sur 68,5 M€ n'étaient
    simplement pas ventilés. Elle sort en ligne propre, avec sa propre
    ventilation par nature, et les parts se calculent sur le ventilé seul.

 3. CLASSE 6 UNIQUEMENT. Les comptes de classe 2 sont de l'investissement ;
    les additionner gonflait les totaux d'environ 20 % (Nemours 21,4 M€ au
    lieu des 17,8 M€ de sa maquette).

Sources :
    Balance   https://data.economie.gouv.fr/explore/dataset/balances-comptables-
              des-collectivites-et-des-etablissements-publics-locaux-avec-la-
              presentation-croisee-nature-fonction-2024/
    Libellés  pipeline/data/nomenclature-budgetaire.json
              (voir sync_nomenclature_budgetaire.py — la balance n'a QUE des
              codes, et on n'invente pas le sens d'un code)

Sortie :
    website/public/data/communes-fonctions/{slug}/fonctions.json  (→ bucket privé)
    website/src/data/communes-fonctions-manifest.json             (engagé)

Idempotent : oui (re-télécharge le ZIP seulement s'il manque ou si --force).
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import unicodedata
import statistics
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

# ---------------------------------------------------------------------------
# Constantes

ROOT = Path(__file__).resolve().parents[3]
CACHE_DIR = ROOT / "pipeline" / "cache" / "dgfip"
NOMENCLATURE_FILE = ROOT / "pipeline" / "data" / "nomenclature-budgetaire.json"
TRADUCTIONS_FILE = ROOT / "pipeline" / "data" / "nomenclature-libelles-en.json"
INDEX_FILE = ROOT / "website" / "public" / "data" / "communes-all" / "index.json"
OUT_ROOT = ROOT / "website" / "public" / "data" / "communes-fonctions"
MANIFEST_FILE = ROOT / "website" / "src" / "data" / "communes-fonctions-manifest.json"

DATASET_ID = (
    "balances-comptables-des-collectivites-et-des-etablissements-publics-"
    "locaux-avec-la-presentation-croisee-nature-fonction-2024"
)
ATTACHMENT_URL = (
    f"https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/"
    f"{DATASET_ID}/attachments/balancespl_fonction_2024_dec2025_zip"
)
DATASET_PAGE = f"https://data.economie.gouv.fr/explore/dataset/{DATASET_ID}/"
BUCKET_BASE = "https://storage.googleapis.com/qipu-communes-budget/communes-fonctions"
ZIP_NAME = "BalanceSPL_Fonction_2024_Dec2025.zip"
CSV_NAME = "BalanceSPL_Fonction_2024_Dec2025.csv"
YEAR = 2024

SOURCE_LABEL = "DGFiP — balances comptables, présentation croisée nature-fonction"
SOURCE_PIPELINE = "balance DGFiP (ZIP) → sync_communes_fonctionnelle.py"
SCOPE = "dépenses de fonctionnement (comptes de classe 6)"

# Combien de lignes on garde à chaque niveau avant de replier le reste dans une
# ligne « Autres ». Le reste est une VRAIE ligne portant son montant : les
# totaux se recomposent au centime, on ne perd rien, on n'affiche pas 3 000
# lignes dans un navigateur.
TOP_SOUS_FONCTIONS = 12
TOP_NATURES = 12
TOP_NATURES_SOUS = 8

# Fonctions principales : clés NEUTRES (voir piège 1), libellés M57 par défaut.
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
# Reversements à d'autres collectivités : de l'argent que la commune encaisse et
# transmet, pas un service qu'elle rend. La nomenclature les range en fonction 0
# faute de politique publique à laquelle les rattacher, ce qui faisait ressortir
# les communes d'un établissement public territorial à 43 % d'« administration »
# — 22 M€ sur 56 à Pantin — pour une raison de structure et non de gestion.
# Ils sortent en compartiment PROPRE, comme le non-ventilé : une ligne, c'est
# une politique que la commune délivre, et un transfert n'en est pas une. Le
# total ne bouge pas, rien n'est caché, le premier regard dit enfin la vérité.
REVERSEMENTS = ("6554", "6556")
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


# Les familles de natures : la seconde lecture du budget, « sous quelle forme
# l'argent sort ». Elles suivent les préfixes officiels de la classe 6 — c'est la
# structure des chapitres M57 (011 = 60-62, 012 = 64, 65, 66…), pas une grille
# maison. Chaque famille a sa fiche pour les communes qui ont l'axe fonction :
# c'est là qu'elle porte le croisement « les salaires, dans quelles politiques ».
NATURES = [
    ("salaires", "salaires", ("64",), "Salaires et charges de personnel", "Staff pay and costs"),
    ("achats", "achats-et-services", ("60", "61", "62"), "Achats et services extérieurs", "Purchases and external services"),
    ("gestion", "subventions-et-contributions", ("65",), "Subventions et contributions", "Grants and contributions"),
    ("dette", "interets-de-la-dette", ("66",), "Intérêts de la dette", "Debt interest"),
    ("impots", "impots-et-taxes", ("63",), "Impôts et taxes payés", "Taxes paid"),
    ("exceptionnel", "charges-exceptionnelles", ("67",), "Charges exceptionnelles", "Exceptional charges"),
    ("dotations", "amortissements-et-provisions", ("68",), "Amortissements et provisions", "Depreciation and provisions"),
]
NATURE_DE_PREFIXE = {pfx: n[0] for n in NATURES for pfx in n[2]}

NV_FR = "Non ventilé"
NV_EN = "Not allocated"

# Colonnes du CSV (positions vérifiées contre l'en-tête au démarrage)
COL_NDEPT = 2
COL_LBUDG = 3
COL_INSEE = 5
COL_CBUDG = 6
COL_NOMEN = 9
COL_CATEG = 16
COL_BAL = 17
COL_FONCTION = 18
COL_COMPTE = 19
COL_OBNETDEB = 22


def _log(msg: str) -> None:
    print(msg, flush=True)


# ---------------------------------------------------------------------------
# Téléchargement

def download_zip(force: bool = False) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    target = CACHE_DIR / ZIP_NAME
    if target.exists() and not force:
        _log(f"  = ZIP en cache ({target.stat().st_size / 1e6:.0f} Mo)")
        return target
    _log(f"  ↓ {ATTACHMENT_URL}")
    req = Request(ATTACHMENT_URL, headers={"User-Agent": "qipu-pipeline/1.0"})
    with urlopen(req, timeout=600) as resp, open(target, "wb") as f:
        while chunk := resp.read(1 << 20):
            f.write(chunk)
    _log(f"  ✓ {target.name} ({target.stat().st_size / 1e6:.0f} Mo)")
    return target


def parse_montant(s: str) -> float:
    if not s:
        return 0.0
    try:
        return float(s.replace(",", "."))
    except ValueError:
        return 0.0


# ---------------------------------------------------------------------------
# Codes fonction

def reference_fonctionnelle(code: str) -> str | None:
    """Le code fonction de la balance → la référence de la nomenclature.

    La balance mélange deux écritures du même axe :
      - vote par nature   : la référence nue — « 020 », « 212 », « 4212 »
      - vote par fonction : « 9 » + chiffre de section + référence — « 93020 »,
        « 934212 ». Les préfixes observés vont de 90 à 96 ; les deux premiers
        caractères se retirent dans tous les cas.
    Une seule normalisation en tête, et tout le reste du script ne voit plus
    qu'une référence de nomenclature.
    """
    if not code:
        return None
    ref = code[2:] if code[0] == "9" else code
    return ref if ref and ref[0].isdigit() else None


def fonction_principale(ref: str) -> str | None:
    """Fonction principale (chiffre 0-9) d'une référence, ou "nv".

    « 01 », « 010 »…« 019 » sont la rubrique « Opérations non ventilables »
    (piège 2) ; « 020 », « 022 »… sont bien l'administration générale.
    """
    if not ref:
        return None
    return "nv" if ref[:2] == "01" else ref[0]


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
# Agrégation

def stream_aggregate(zip_path: Path) -> tuple[dict[str, dict], dict[str, float], int, int]:
    """Une seule passe sur les 835 Mo de CSV.

    Par commune on conserve le couple (référence fonctionnelle, compte) — le
    grain du fichier, rien de moins. Le repliement en arbre se fait après, où
    il est relisible, pas dans la boucle chaude.
    """
    by_insee: dict[str, dict] = {}
    national: dict[str, float] = defaultdict(float)
    kept = skipped = 0
    key_by_digit = {str(i): FONCTIONS[i][0] for i in range(10)}
    key_by_digit["nv"] = "nv"

    with zipfile.ZipFile(zip_path) as zf, zf.open(CSV_NAME, "r") as raw:
        text = (line.decode("latin-1", errors="replace") for line in raw)
        reader = csv.reader(text, delimiter=";")
        header = next(reader, None)
        if header is None:
            raise RuntimeError("CSV vide")
        assert header[COL_FONCTION].lower() == "fonction", f"colonne FONCTION déplacée : {header}"
        assert header[COL_COMPTE].lower() == "compte", f"colonne COMPTE déplacée : {header}"
        assert header[COL_OBNETDEB].lower() == "obnetdeb", f"colonne OBNETDEB déplacée : {header}"

        for row in reader:
            if len(row) <= COL_OBNETDEB:
                skipped += 1
                continue
            if row[COL_CATEG] not in ("Commune", "PARIS") or row[COL_CBUDG] != "1" or row[COL_BAL] != "DEF":
                skipped += 1
                continue
            compte = row[COL_COMPTE]
            # Fonctionnement SEULEMENT (piège 3).
            if not compte or compte[0] != "6":
                skipped += 1
                continue
            ref = reference_fonctionnelle(row[COL_FONCTION])
            if ref is None:
                skipped += 1
                continue
            fkey = key_by_digit.get(fonction_principale(ref) or "")
            if fkey is None:
                skipped += 1
                continue
            # Un reversement n'est pas une politique : il quitte sa fonction ici,
            # avant toute agrégation, pour que natures, domaines et totaux suivent.
            if compte.startswith(REVERSEMENTS):
                fkey = "rev"
            montant = parse_montant(row[COL_OBNETDEB])
            if montant == 0.0:
                skipped += 1
                continue

            ndept, ins3 = row[COL_NDEPT], row[COL_INSEE]
            if not ndept or not ins3:
                skipped += 1
                continue
            # INSEE complet = NDEPT sans son zéro de tête + rang dans le
            # département. « 075 » + « 056 » → « 75056 ». La Corse (02A/02B)
            # n'a pas de zéro à retirer.
            short = ndept[1:] if ndept[0] == "0" and ndept[1:].isdigit() else ndept
            insee = f"{short}{ins3}".zfill(5)

            bucket = by_insee.setdefault(insee, {
                "libelle": row[COL_LBUDG],
                "cellules": defaultdict(float),   # (fkey, ref, compte) → montant
                "nomen": defaultdict(float),
                "total": 0.0,
            })
            bucket["cellules"][(fkey, ref, compte)] += montant
            bucket["nomen"][row[COL_NOMEN] or "?"] += montant
            bucket["total"] += montant
            national[fkey] += montant
            kept += 1
    return by_insee, dict(national), kept, skipped


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
    nomen = max(bucket["nomen"], key=bucket["nomen"].get)
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
        fam = NATURE_DE_PREFIXE.get(compte[:2])
        if not fam:
            continue
        fam_montant[fam] += montant
        fam_comptes[fam][compte] += montant
        fam_fonctions[fam][fkey] += montant
    base_natures = total - par_fonction.get("rev", 0.0)
    lib_fonction = {cle: (fr, en) for cle, fr, en in FONCTIONS}
    lib_fonction["nv"] = (NV_FR, NV_EN)
    natures_out: list[dict] = []
    for key, slug_n, _pfx, fr_n, en_n in NATURES:
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
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true", help="re-télécharger le ZIP")
    ap.add_argument("--limit", type=int, default=0, help="n'écrire que N communes (mise au point)")
    args = ap.parse_args()

    _log("→ À quoi sert l'argent : ventilation fonction × nature, par commune")
    if not NOMENCLATURE_FILE.exists():
        _log(f"✗ {NOMENCLATURE_FILE.relative_to(ROOT)} manquant — lancer d'abord "
             "pipeline/scripts/sync/sync_nomenclature_budgetaire.py")
        return 1
    lib = Libelles(NOMENCLATURE_FILE, TRADUCTIONS_FILE)
    _log(f"  = libellés : {len(lib.fonction)} fonctions, {len(lib.nature_m57)} comptes M57, "
         f"{len(lib.nature_m14)} comptes M14")

    index = json.loads(INDEX_FILE.read_text(encoding="utf-8"))["communes"]
    zip_path = download_zip(force=args.force)

    _log("  → lecture du CSV (835 Mo) …")
    by_insee, national, kept, skipped = stream_aggregate(zip_path)
    _log(f"  ✓ cellules retenues : {kept:,} · écartées : {skipped:,}")
    _log(f"  ✓ communes avec fonction renseignée : {len(by_insee):,}")

    if OUT_ROOT.exists():
        shutil.rmtree(OUT_ROOT)
    OUT_ROOT.mkdir(parents=True, exist_ok=True)

    # Passe 1 : construire tous les documents. Passe 2 : comparer chaque commune
    # à sa strate — impossible avant d'avoir lu toutes les communes.
    docs: dict[str, dict] = {}
    metas: dict[str, dict] = {}
    pops: dict[str, int] = {}
    sans_slug = 0
    for insee, bucket in sorted(by_insee.items()):
        meta = index.get(insee)
        if not meta:
            sans_slug += 1
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
            "source_url": DATASET_PAGE,
            "source_libelles": lib.source_url,
            "source_pipeline": SOURCE_PIPELINE,
            "annee": YEAR,
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
            "source_url": DATASET_PAGE,
            "bucket": BUCKET_BASE,
            "annee": YEAR,
            "scope": SCOPE,
            "n_communes": len(manifest),
            "communes": manifest,
        }, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    _log(f"  ✓ {written:,} fichiers dans {OUT_ROOT.relative_to(ROOT)}")
    if sans_slug:
        _log(f"  • {sans_slug} communes de la balance absentes de l'index (ignorées)")
    if tailles:
        _log(f"  • poids par commune : médiane {statistics.median(tailles)/1024:.1f} Ko · "
             f"max {max(tailles)/1024:.1f} Ko · total {sum(tailles)/1e6:.1f} Mo")
    _log(f"  ✓ {MANIFEST_FILE.relative_to(ROOT)} ({MANIFEST_FILE.stat().st_size/1024:.0f} Ko)")

    if lib.manquants:
        # La liste COMPLÈTE part dans un fichier : vingt lignes à l'écran ne
        # suffisent pas pour compléter la table de traduction en une passe.
        dump = ROOT / "pipeline" / "cache" / "libelles-manquants.json"
        dump.write_text(json.dumps(sorted(lib.manquants), ensure_ascii=False, indent=1), encoding="utf-8")
        _log(f"✗ {len(lib.manquants)} libellés sans traduction anglaise "
             f"(pipeline/data/nomenclature-libelles-en.json) — liste dans {dump.relative_to(ROOT)} :")
        for axe, fr in sorted(lib.manquants)[:20]:
            _log(f"      [{axe}] {fr}")
        return 1
    _log("  ✓ tous les libellés affichés ont une traduction anglaise")

    nat_total = sum(national.values())
    nat_nv = national.get("nv", 0.0)
    nat_ventile = nat_total - nat_nv
    _log(f"  • national : {nat_total/1e9:.1f} Md€ dont {nat_nv/1e9:.1f} Md€ non ventilés "
         f"({nat_nv/nat_total:.1%})")
    _log(f"  • somme des parts nationales sur le ventilé : "
         f"{sum(v for k, v in national.items() if k != 'nv')/nat_ventile:.3f} (attendu 1.000)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
