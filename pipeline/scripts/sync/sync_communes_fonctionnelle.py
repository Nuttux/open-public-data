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
import shutil
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

class Libelles:
    """Résolution code → libellé, par axe et par nomenclature.

    Les codes de la balance sont parfois plus fins que la nomenclature publiée
    (une commune peut voter « 64111 » quand la table s'arrête à « 6411 ») : on
    remonte au plus long préfixe connu. Jamais l'inverse — on ne descend pas
    d'un code court vers un libellé plus précis qu'on aurait choisi.
    """

    def __init__(self, path: Path) -> None:
        d = json.loads(path.read_text(encoding="utf-8"))
        self.fonction = d["fonction_m57"]
        self.nature_m57 = d["nature_m57"]
        self.nature_m14 = d["nature_m14"]
        self.source_url = d["source_url"]

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

def _top(items: list[dict], n: int, autres_label: str) -> list[dict]:
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
        out.append({"code": "autres", "libelle": autres_label, "montant": reste, "autres": True})
    return out


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

    ventile = total - par_fonction.get("nv", 0.0)

    def natures_rows(counts: dict[str, float], n: int) -> list[dict]:
        rows = [
            {"code": c, "libelle": lib.nature_label(c, nomen) or f"Compte {c}", "montant": round(v)}
            for c, v in counts.items() if v != 0
        ]
        return _top(rows, n, "Autres natures de dépense")

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
            rows = _top(rows, TOP_SOUS_FONCTIONS, "Autres domaines")
            # Un seul poste dont le libellé répète celui de la fonction n'ajoute
            # rien : la commune a voté au niveau de la fonction, sans détail.
            if len(rows) > 1 or (len(rows) == 1 and rows[0]["libelle"] != fr):
                entry["sous_fonctions"] = rows
        fonctions_out.append(entry)

    fonctions_out.sort(key=lambda x: -x["montant"])

    non_ventile = round(par_fonction.get("nv", 0.0))
    out = {
        "total": round(total),
        "total_ventile": round(ventile),
        "non_ventile": non_ventile,
        "nomenclature": nomen,
        "fonctions": fonctions_out,
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
    lib = Libelles(NOMENCLATURE_FILE)
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

    manifest: dict[str, dict] = {}
    sans_slug = 0
    tailles: list[int] = []
    written = 0
    for insee, bucket in sorted(by_insee.items()):
        meta = index.get(insee)
        if not meta:
            sans_slug += 1
            continue
        payload = build_commune(bucket, lib)
        if payload is None or not payload["fonctions"]:
            continue
        slug = meta["slug"]
        doc = {
            "source": SOURCE_LABEL,
            "source_url": DATASET_PAGE,
            "source_libelles": lib.source_url,
            "source_pipeline": SOURCE_PIPELINE,
            "annee": YEAR,
            "scope": SCOPE,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "commune": {"insee": insee, "slug": slug, "nom": meta["nom"]},
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
