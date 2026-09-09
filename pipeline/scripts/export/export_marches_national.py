#!/usr/bin/env python3
"""
Export National Marchés Publics (DECP) → per-commune JSON.

Reads mart_marches_national (row-level, all commune buyers) and produces, for
each commune with procurement, a JSON aggregate (total, by year, by CPV theme,
top titulaires, biggest marchés + coverage note). Deterministic — no enrichment.

  website/public/data/communes-marches/{slug}/marches.json   (→ private bucket)
  website/src/data/communes-marches-manifest.json            (committed, slug→years)

Coverage: DECP publishes marchés ≥ 40 k€ HT (~50-70% national). Shown, not hidden.

Usage:
    python scripts/export/export_marches_national.py --slugs pantin albi
    python scripts/export/export_marches_national.py --all
"""
from __future__ import annotations

import argparse
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
_MARTS = os.environ.get("PARIS_MARTS_DATASET", "dbt_paris_marts")
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
        SELECT code_insee, commune_nom, population, annee, montant, categorie_cpv,
               type_procedure, objet, titulaire_nom, titulaire_siren,
               titulaire_personne_physique, montant_invraisemblable, depenses_totales_commune, marche_id, duree_mois
        FROM `{MART}` {where}
    """
    job = client.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=params))
    by_insee = defaultdict(list)
    for r in job.result():
        by_insee[r["code_insee"]].append(dict(r))
    return by_insee


_APOS = re.compile(r"(?<=[A-Za-zÀ-ÿœŒ])\?(?=[A-Za-zÀ-ÿœŒ])")
PERSONNES_LABEL = "Entrepreneurs individuels"

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


def _strip_accents(w: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", w) if unicodedata.category(c) != "Mn").lower()


def _lower_word(m: re.Match) -> str:
    w = m.group(0)
    if w in _SIGLES or (len(w) <= 3 and w.isupper() and w.lower() not in _OBJET_ACCENTS and len(w) > 1 and w not in {"DES", "LES", "DES", "SUR", "AUX", "ET", "DE", "LA", "LE", "DU", "EN", "UN"}):
        return w
    return _OBJET_ACCENTS.get(_strip_accents(w), w.lower())


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
    # Comparaison sans accent : la source écrit « SAINT-ETIENNE » là où la
    # commune s'appelle « Saint-Étienne ».
    parts = {_strip_accents(p): p for p in re.split(r"[\s'’-]+", nom) if len(p) >= 3}
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
    return _sentence_case(t)


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
        if r.get("titulaire_personne_physique"):
            t = PERSONNES_LABEL
        else:
            t = (r["titulaire_nom"] or "").strip()
        if t:
            by_titu[t]["montant"] += m
            by_titu[t]["nb"] += 1
            if t != PERSONNES_LABEL and r.get("titulaire_siren"):
                by_titu[t].setdefault("siren", r["titulaire_siren"])
    # Lots regroupés : une entrée par (objet, titulaire, année), montants sommés.
    lots: dict[tuple, dict] = {}
    for r in rows:
        k = _lot_key(r)
        g = lots.setdefault(k, {"row": r, "montant": 0.0, "nb_lots": 0})
        g["montant"] += r["montant"] or 0
        g["nb_lots"] += 1
    top_marches = sorted(lots.values(), key=lambda g: -g["montant"])[:15]
    # Dernière année publiée, à part : la page ville parle de l'année, pas du
    # cumul depuis 2018 (domaines et fournisseurs de cette année-là).
    last_year = max(by_year) if by_year else None
    ly_rows = [r for r in rows if r["annee"] and int(r["annee"]) == last_year]
    ly_cat: dict[str, dict] = defaultdict(lambda: {"montant": 0.0, "nb": 0})
    ly_titu: dict[str, dict] = defaultdict(lambda: {"montant": 0.0, "nb": 0})
    for r in ly_rows:
        m = r["montant"] or 0
        ly_cat[r["categorie_cpv"] or "Autres"]["montant"] += m
        ly_cat[r["categorie_cpv"] or "Autres"]["nb"] += 1
        t = PERSONNES_LABEL if r.get("titulaire_personne_physique") else (r["titulaire_nom"] or "").strip()
        if t:
            ly_titu[t]["montant"] += m
            ly_titu[t]["nb"] += 1
            ly_titu[t].setdefault("objet", restore_nom(trim_objet(clean_objet(r["objet"]), 120), meta.get("nom")))
            if t != PERSONNES_LABEL and r.get("titulaire_siren"):
                ly_titu[t].setdefault("siren", r["titulaire_siren"])
    # Fiche fournisseur locale (bloc 3) : par SIREN, tous les marchés (lots
    # regroupés) que la commune lui a notifiés. Jamais pour une personne
    # physique : les entrepreneurs individuels n'ont pas de fiche.
    fourn: dict[str, dict] = {}
    for g in lots.values():
        r = g["row"]
        siren = r.get("titulaire_siren")
        if not siren or r.get("titulaire_personne_physique"):
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
            "objet": restore_nom(trim_objet(clean_objet(r["objet"]), 200), meta.get("nom")),
            "montant": g["montant"],
            "nb_lots": g["nb_lots"],
            "annee": y,
            "duree_mois": r.get("duree_mois"),
            "procedure": r.get("type_procedure"),
            "categorie": r.get("categorie_cpv"),
        })
    for f in fourn.values():
        f["marches"].sort(key=lambda m: (-(m["annee"] or 0), -m["montant"]))
    return {
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
                "objet": restore_nom(trim_objet(clean_objet(g["row"]["objet"]), 200), meta.get("nom")),
                "montant": g["montant"],
                "nb_lots": g["nb_lots"],
                "titulaire": (
                    PERSONNES_LABEL if g["row"].get("titulaire_personne_physique") else g["row"]["titulaire_nom"]
                ),
                "siren": None if g["row"].get("titulaire_personne_physique") else g["row"].get("titulaire_siren"),
                "annee": g["row"]["annee"],
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
    return 0


if __name__ == "__main__":
    sys.exit(main())
