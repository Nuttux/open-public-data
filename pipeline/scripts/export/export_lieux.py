#!/usr/bin/env python3
"""Export des fiches lieux → website/public/data/lieux/.

Piloté par `pipeline/seeds/seed_lieux_v1.csv` (identité, coordonnées, famille) :
la taxonomie et la liste des lieux vivent dans le seed, pas dans du code.
OVERRIDES ne porte que ce qui est curaté à la main pour un lieu donné (KPI
vedette, extraits BMO retenus, exploitant connu) — et chaque entrée dit
pourquoi elle existe.

Assemble par lieu : identité + Wikipédia (présentation sourcée), moments et
montants issus de la lecture des délibérations (pipeline/cache/lieux/*_enrich.json),
extraits vérifiés du BMO (Gallica, dates OAIRecord), subventions de l'exploitant,
lignes d'investissement des annexes CA. Contrat d'export habituel :
generated_at, source_pipeline, sources par bloc — zéro chiffre sans source_url.

Usage : python pipeline/scripts/export/export_lieux.py
"""
from __future__ import annotations

import csv
import glob
import json
import re
import shutil
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "pipeline" / "seeds" / "seed_lieux_v1.csv"
CACHE = ROOT / "pipeline" / "cache" / "lieux"
OUT = ROOT / "website" / "public" / "data" / "lieux"
IMG = ROOT / "website" / "public" / "img" / "lieux"

KIND_EN = {
    "Piscine": "Swimming pool", "Gymnase": "Gym", "Stade": "Stadium",
    "Parc": "Park", "Jardin": "Garden", "Square": "Square", "Cimetière": "Cemetery",
    "Théâtre": "Theatre", "Équipement culturel": "Cultural venue",
    "Salle de concert": "Concert hall", "Bibliothèque": "Library",
    "Place": "Square", "Monument": "Monument",
    "Marché": "Market", "Marché couvert": "Covered market",
    "Équipement": "Public facility", "Quartier-équipement": "District facility",
    "Mairie": "Town hall", "Infrastructure": "Infrastructure",
}

# Curation manuelle, par lieu. Tout ce qui est ici a demandé un jugement humain
# (ou une vérification) et ne peut pas être dérivé du seed.
OVERRIDES: dict[str, dict] = {
    "piscine-des-amiraux": {
        # KPI manuel retiré (était « seul montant chiffré » avant les vraies
        # données ; la fiche a désormais mandaté 2013-2017 + marchés).
        "bmo_picks": [("1897-10-28", 22), ("1921-06-08", 6), ("1923-03-04", 11),
                      ("1926-01-08", 22), ("1927-04-29", 6), ("1928-01-01", 11),
                      ("1930-01-01", 16), ("1943-05-27", 2), ("1945-06-07", 3),
                      ("1948-08-28", 1)],
    },
    "philharmonie-de-paris": {
        # KPI « charge d'emprunt » retiré : les vraies données couvrent désormais
        # l'argent (construction mandatée 2014-2017, subventions 2018-2024), et ce
        # KPI décrivait les remboursements 16x exclus du Dépensé — triple
        # redondance. Le fait vit dans les moments (« la dette bascule »).
        "exploitant": ["LA CITE DE LA MUSIQUE", "CITE DE LA MUSIQUE"],
    },
    "theatre-de-la-ville": {
        # Pas de KPI montant : le tableau « subventions versées » EST le chiffre
        # argent du théâtre ; un KPI « votées » séparé, transcrit à la main, le
        # concurrencerait (13,5 vs 14,4). On garde le KPI curaté seulement là où
        # il porte un fait unique et sourcé absent des tableaux (Amiraux, Philh.).
        "exploitant": ["THEATRE DE LA VILLE"],
        "bmo_picks": [("1967-01-18", 6)],
        # Le lieu a changé de nom : Théâtre Sarah-Bernhardt (1899-1968). Les extraits
        # d'avant 1968 viennent donc d'un slug de sync dédié.
        "bmo_extra": ("theatre-sarah-bernhardt",
                      [("1899-07-14", 7), ("1907-12-17", 16), ("1911-12-31", 35),
                       ("1920-01-13", 14), ("1922-02-08", 14), ("1926-01-10", 10)]),
    },
}

SOURCES = {
    # La racine du portail (a06-v7.apps.paris.fr/a06/) est un formulaire de
    # recherche sans résultats — une page vide pour le lecteur. L'URL réelle
    # est posée par fiche dans main() : la recherche pré-remplie avec la
    # requête du sync, donc le corpus exact dont sortent les lignes affichées.
    "delibs": {"name": "Débat-Délibs — Conseil de Paris",
               "url": "https://a06-v7.apps.paris.fr/a06/"},
    "bmo": {"name": "Bulletin municipal officiel de la Ville de Paris — Gallica/BnF",
            "url": "https://gallica.bnf.fr/ark:/12148/cb343512457/date"},
    "invest": {"name": "Annexes du compte administratif, Ville de Paris (extraction pipeline)",
               "url": "https://opendata.paris.fr/"},
    "wiki": {"name": "Wikipédia", "url": "https://fr.wikipedia.org/"},
}


def delibs_search_url(query: str) -> str:
    """Recherche Débat-Délib pré-remplie — même prédicat que sync_debat_delibs.py."""
    return ("https://a06-v7.apps.paris.fr/a06/jsp/site/Portal.jsp?"
            + urllib.parse.urlencode({"page": "search-solr", "query": query}))


def bmo_search_url(query: str) -> str:
    """Recherche Gallica dans les numéros du BMO, pré-remplie — même prédicat que
    sync_gallica_bmo.py (l'URL que produit la boîte « Rechercher dans tous les
    numéros » du calendrier). Première visite : Gallica peut poser sa case
    « je ne suis pas un robot », puis affiche les fascicules du lieu."""
    return ("https://gallica.bnf.fr/services/engine/search/sru?"
            + urllib.parse.urlencode({
                "operation": "searchRetrieve", "version": "1.2",
                "startRecord": "0", "maximumRecords": "15", "page": "1",
                "collapsing": "disabled",
                "query": f'arkPress all "cb343512457_date" and (gallica all "{query}")',
            }))

# Documents que la lecture a classés hors périmètre du lieu lui-même.
OFF_CLASSES = {"hors-sujet", "mention-liste", "immeuble/rue", "abords"}


def norm_key(s: str) -> str:
    """Clé de rapprochement pour l'index inverse : minuscules, sans accents ni
    ponctuation. Le lien lui-même vient du juge ; ceci ne fait que retrouver la
    même entité écrite pareil sur une autre fiche."""
    import unicodedata
    s = "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


_VULG_MARCHES: dict | None = None


def vulgarisation_marches() -> dict:
    """Libellés de marché en français clair, indexés par numéro — le même cache
    que celui des fiches contrat (`objet_clair`). Évite de republier le libellé
    administratif brut sur la fiche du lieu."""
    global _VULG_MARCHES
    if _VULG_MARCHES is None:
        p = ROOT / "website" / "public" / "data" / "enrichment" / "vulgarization_marches.json"
        try:
            _VULG_MARCHES = json.load(open(p)).get("items") or {}
        except Exception:
            _VULG_MARCHES = {}
    return _VULG_MARCHES


_AP_MART: list | None = None


def ap_operations_mart() -> list:
    global _AP_MART
    if _AP_MART is None:
        p = ROOT / "website" / "public" / "data" / "ca" / "ap_operations.json"
        try:
            _AP_MART = json.load(open(p)).get("operations") or []
        except Exception:
            _AP_MART = []
    return _AP_MART


_PROJET_ID_INDEX: dict | None = None


def projet_id_index() -> dict:
    """Index (nom_projet normalisé, année) → id de projet et (nom → id) en repli.
    Sert à rendre les lignes d'investissement d'un lieu CLIQUABLES vers leur fiche
    projet (`/investissements/projet/[id]`). Le rattachement projet↔lieu a déjà
    été jugé en amont (money_resolved) ; ici on ne fait que retrouver l'id."""
    global _PROJET_ID_INDEX
    if _PROJET_ID_INDEX is not None:
        return _PROJET_ID_INDEX
    by_key: dict[tuple, str] = {}
    by_name: dict[str, str] = {}
    files = (glob.glob(str(ROOT / "website/public/data/map/investissements_complet_*.json"))
             + glob.glob(str(ROOT / "website/public/data/map/investissements_localises_*.json")))
    for f in sorted(files):
        if "index" in f:
            continue
        for r in json.load(open(f)).get("data") or []:
            pid, nom = r.get("id"), r.get("nom_projet")
            if not (pid and nom):
                continue
            nk = norm_key(nom)
            by_key.setdefault((nk, str(r.get("annee"))), pid)
            by_name.setdefault(nk, pid)
    _PROJET_ID_INDEX = {"by_key": by_key, "by_name": by_name}
    return _PROJET_ID_INDEX


def projet_id_for(nom: str, annee) -> str | None:
    """id de fiche projet pour un projet nommé — année exacte d'abord, nom seul en repli."""
    if not (nom or "").strip():
        return None
    idx = projet_id_index()
    nk = norm_key(nom)
    return idx["by_key"].get((nk, str(annee))) or idx["by_name"].get(nk)


_ENTETE = re.compile(r"BULLETIN\s+MUNICIPAL\s+OFFICIEL", re.I)


def lisible(txt: str) -> bool:
    """Dernier garde-fou, volontairement MINCE : la lisibilité est jugée en amont
    par judge_bmo_snippets (un modèle distingue « groupa d'habitations » d'un
    français correct, ce qu'une regex ne sait pas faire). L'heuristique de
    plausibilité qui vivait ici coupait 57 extraits jugés bons à 41 — elle
    supprimait des citations parfaitement lisibles (Balzac 4→1). On ne garde donc
    que ce qui est certain : un titre courant de page n'est pas une citation."""
    t = (txt or "").strip()
    return len(t) >= 40 and not _ENTETE.search(t)


def jsonl(path: Path) -> list[dict]:
    return [json.loads(l) for l in path.open()] if path.exists() else []


def clean(txt):
    """Artefacts d'encodage du portail : d?euros -> d’euros."""
    return re.sub(r"([a-zà-ÿA-ZÀ-Ÿ])\?([a-zà-ÿ])", r"\1’\2", txt) if isinstance(txt, str) else txt


def fr_num(txt):
    """Prose de synthèse uniquement, jamais les citations : 117.167.610 -> 117 167 610."""
    return re.sub(r"(?<=\d)\.(?=\d{3}\b)", " ", txt) if isinstance(txt, str) else txt


_LECTURE_MODE_PATTERNS = [
    (re.compile(r"^titre nommant le lieu \((\d+) trouvés\)$"),
     lambda m: f"title naming the place ({m.group(1)} found)"),
    (re.compile(r"^tête du classement Solr \((\d+) documents au total\)$"),
     lambda m: f"top of the Solr ranking ({m.group(1)} documents total)"),
    (re.compile(r"^corpus complet \((\d+) documents\)$"),
     lambda m: f"full corpus ({m.group(1)} documents)"),
]


def lecture_mode_en(mode_fr):
    """Traduit la mini-phrase de couverture de lecture (prep_lieu_contexts.py) --
    un jeu ferme de 3 gabarits, donc un template suffit, pas une traduction
    par lieu. Repli sur le francais si un gabarit inconnu apparait."""
    if not mode_fr:
        return None
    for pattern, render in _LECTURE_MODE_PATTERNS:
        m = pattern.match(mode_fr)
        if m:
            return render(m)
    return mode_fr


def load_en_translations(slug: str) -> dict:
    """Traductions editoriales anglaises, faites en session (meme convention que
    la lecture/synthese elles-memes). Fichier optionnel : sans lui la fiche EN
    replie sur le francais, comme n'importe quel champ _en absent ailleurs sur
    le site."""
    p = CACHE / f"{slug}_en.json"
    if not p.exists():
        return {}
    try:
        return json.load(open(p))
    except Exception:
        return {}


def apply_en_translations(fiche: dict, slug: str) -> None:
    """Fusionne les traductions anglaises dans la fiche deja assemblee. Cle sur
    des identifiants stables (id de moment, date+source_url d'extrait BMO, nom
    de beneficiaire) plutot que sur la position dans la liste : la fiche
    francaise reste la seule verite pour l'ordre et le contenu, l'anglais ne
    fait qu'ajouter un double _en a cote de chaque champ traduisible."""
    en = load_en_translations(slug)
    if not en:
        return
    if en.get("synthese_en"):
        fiche["synthese_en"] = en["synthese_en"]
    if en.get("wiki_extract_en") and fiche.get("wiki"):
        fiche["wiki"]["extract_en"] = en["wiki_extract_en"]
    if en.get("bmo_recit_en"):
        fiche["bmo_recit_en"] = en["bmo_recit_en"]
    if en.get("note_publique_en") and fiche.get("subventions_exploitant"):
        fiche["subventions_exploitant"]["note_publique_en"] = en["note_publique_en"]
    # Certains lieux ont plusieurs moments qui PARTAGENT le même id (même
    # délibération source, plusieurs faits distincts jugés marquants
    # séparément — ex. fontaine-saint-michel : 4 moments, un seul id). Le
    # traducteur peut alors fournir une LISTE de traductions sous cet id, une
    # par occurrence dans l'ordre où elles apparaissent — on consomme un
    # élément de la liste par occurrence rencontrée. Repli sur le dict simple
    # (un seul moment pour cet id) partout ailleurs.
    moments_en = en.get("moments_en") or {}
    moment_occurrence: dict[str, int] = {}
    for m in fiche.get("moments", []):
        me = moments_en.get(m["id"])
        if isinstance(me, list):
            i = moment_occurrence.get(m["id"], 0)
            moment_occurrence[m["id"]] = i + 1
            me = me[i] if i < len(me) else None
        if me:
            if me.get("fait_en"):
                m["fait_en"] = me["fait_en"]
            if me.get("pourquoi_en"):
                m["pourquoi_en"] = me["pourquoi_en"]
    bmo_en = en.get("bmo_extraits_en") or {}
    for b in fiche.get("bmo_extraits", []):
        key = f"{b['date']}|{b['source_url']}"
        if bmo_en.get(key):
            b["extrait_en"] = bmo_en[key]
    residents_en = en.get("residents_en") or {}
    for r in fiche.get("residents", []):
        if residents_en.get(r["beneficiaire"]):
            r["preuve_en"] = residents_en[r["beneficiaire"]]


def subvention_par_annee(names: list[str]) -> dict | None:
    """Ventile par exercice les subventions versées à des bénéficiaires CONFIRMÉS
    (noms résolus par le juge). La confirmation est faite en amont — ici on ne
    fait qu'agréger par année pour l'affichage."""
    if not names:
        return None
    targets = {n.lower() for n in names}
    rows = []
    for f in sorted(glob.glob(str(ROOT / "website/public/data/**/beneficiaires_*.json"), recursive=True)):
        if "/marseille/" in f or "search" in f:
            continue
        for b in json.load(open(f)).get("data", []):
            name = str(b.get("beneficiaire") or "").strip()
            if name.lower() in targets:
                rows.append({"annee": f[-9:-5], "montant_eur": b.get("montant_total") or b.get("montant") or 0,
                             "beneficiaire": name, "thematique": b.get("thematique")})
    if not rows:
        return None
    rows.sort(key=lambda r: r["annee"], reverse=True)
    return {"nom_fiche": rows[0]["beneficiaire"], "total_eur": sum(r["montant_eur"] for r in rows),
            "annees": [rows[-1]["annee"], rows[0]["annee"]], "rows": rows}


def resolve_argent(slug: str) -> dict:
    """Assemble le bloc « argent public » d'un lieu à partir des données résolues
    par le juge (gather → juge → résolu) et du périmètre de l'exploitant.

    Ne publie que ce qui est prouvé : exploitants (rôle « exploitant ») avec leur
    ventilation par exercice et la mention de périmètre (mono/multi-lieu),
    résidents (« aussi financés ici »), projets « au-lieu ». Homonymes, voisins et
    incertains sont écartés. Voir docs/paris-lieux/PLAN.md."""
    rp = CACHE / f"{slug}_money_resolved.json"
    if not rp.exists():
        return {"exploitant": None, "residents": [], "investissements": [], "invest_total_eur": 0,
                "marches": [], "marches_total_eur": 0,
                "ap_operations": [], "mandate_par_annee": {}, "mandate_total_eur": 0}
    r = json.load(open(rp))

    exploitant_names = [s["beneficiaire"] for s in r.get("subventions", []) if s.get("role") == "exploitant"]
    exploitant = subvention_par_annee(exploitant_names)
    if exploitant:
        perim_p = CACHE / f"{slug}_perimetre.json"
        if perim_p.exists():
            perim = json.load(open(perim_p))
            exploitant["perimetre"] = perim.get("perimetre")
            exploitant["note_publique"] = perim.get("note_publique") or None
            exploitant["autres_sites"] = perim.get("autres_sites") or []

    residents = [
        {"beneficiaire": s["beneficiaire"], "montant_total": s.get("montant_total") or 0,
         "preuve": s.get("preuve")}
        for s in r.get("subventions", []) if s.get("role") == "resident"
    ]
    residents.sort(key=lambda x: -x["montant_total"])

    invest = [
        {"annee": p.get("annee"), "montant_eur": p.get("montant_eur") or 0,
         "nom_projet": p.get("nom_projet") or "", "preuve": p.get("preuve"),
         "id": projet_id_for(p.get("nom_projet") or "", p.get("annee"))}
        for p in r.get("projets", [])
        if p.get("role") == "au-lieu" and (p.get("nom_projet") or "").strip()
        # « PROV SUB EQUIP … » = subvention d'équipement : quand le lieu a un
        # exploitant subventionné, cette ligne est DÉJÀ dans ses « subventions
        # versées » (vérifié Philharmonie 2022 : 11,0 M€ ⊂ 11,1 M€) — la garder
        # doublerait le même versement.
        and not (exploitant and re.search(r"PROV\.?\s*SUB\.?\s*EQUIP", p.get("nom_projet") or "", re.I))
    ]
    invest.sort(key=lambda x: (str(x["annee"]), -x["montant_eur"]))

    # Marchés publics rattachés au lieu (jugés « au-lieu ») : c'est de l'argent
    # public au même titre qu'une subvention ou un investissement, et il manquait
    # à la fiche. Chaque ligne renvoie à sa fiche contrat.
    # `objet_clair` : le libellé en français clair déjà produit pour les fiches
    # contrat (vulgarization_marches.json). Sans lui la fiche affichait le libellé
    # brut du marché, codes de section compris (« Csp4:ma sub_ac:mission moe … ») —
    # illisible. Repli côté front sur normalizeObjet(), comme la fiche contrat.
    vulg = vulgarisation_marches()
    marches = [
        {"numero_marche": m.get("numero_marche"), "objet": (m.get("objet") or "")[:200],
         "objet_clair": (vulg.get(str(m.get("numero_marche"))) or {}).get("objet_clair"),
         "fournisseur": m.get("fournisseur"), "montant_max": m.get("montant_max") or 0,
         "date_notification": m.get("date_notification"), "preuve": m.get("preuve")}
        for m in r.get("marches", [])
        if m.get("role") == "au-lieu" and m.get("numero_marche")
    ]
    marches.sort(key=lambda m: -(m["montant_max"] or 0))

    # Opérations AP/CP jugées « au-lieu » : la dépense d'investissement RÉELLEMENT
    # mandatée, par exercice (2009-2017, niveau opération). C'est l'autre moitié
    # du diptyque payé/engagé — jamais sommée avec les plafonds de marchés.
    ap_ops = []
    # Montants pris dans le MART (source unique de vérité), pas dans la copie du
    # juge : un correctif amont (ex. exclusion des chapitres financiers) doit se
    # propager sans re-jugement — le juge ne porte que le rattachement + preuve.
    mart_ops = {o.get("ap_cle"): o for o in ap_operations_mart()}
    for a in r.get("ap", []):
        if a.get("role") != "au-lieu":
            continue
        m = mart_ops.get(a.get("ap_cle"))
        par_annee = ({str(k): float(v) for k, v in (m.get("mandate_par_annee") or {}).items() if v}
                     if m else {})
        if not par_annee:
            continue
        ap_ops.append({
            "ap_cle": a.get("ap_cle"), "ap_texte": a.get("ap_texte"),
            "mandate_par_annee": par_annee,
            "total_mandate": round(sum(par_annee.values()), 2),
            "preuve": a.get("preuve"),
            "source_url": ("https://opendata.paris.fr/explore/dataset/"
                           "comptes-administratifs-autorisations-de-programmes-ap-ville-departement/table/"
                           "?refine.autorisation_de_programme_cle=" + urllib.parse.quote(str(a.get("ap_cle") or ""))),
        })
    ap_ops.sort(key=lambda o: -o["total_mandate"])
    mandate_par_annee: dict[str, float] = {}
    for o in ap_ops:
        for an, v in o["mandate_par_annee"].items():
            mandate_par_annee[an] = round(mandate_par_annee.get(an, 0) + v, 2)

    return {"exploitant": exploitant, "residents": residents[:8],
            "investissements": invest, "invest_total_eur": sum(p["montant_eur"] for p in invest),
            "marches": marches, "marches_total_eur": sum(m["montant_max"] or 0 for m in marches),
            "ap_operations": ap_ops,
            "mandate_par_annee": dict(sorted(mandate_par_annee.items())),
            "mandate_total_eur": round(sum(mandate_par_annee.values()), 2)}
    # NB : on publie TOUS les marchés jugés. Tronquer la liste à 10 tout en
    # sommant la liste complète rendait le total invérifiable depuis la fiche
    # (Charléty : carte 31,0 M€, lignes visibles 27,2 M€). Le repli visuel
    # au-delà de 6 lignes est fait côté fiche, pas côté données.


# Types de lieux : un projet « Gymnase … rue des Amiraux » nomme la rue, pas la
# piscine — il ne doit pas être attribué à la piscine des Amiraux.
LIEU_TYPES = re.compile(
    r"\b(piscine|gymnase|stade|cr[eè]che|[eé]cole|coll[eè]ge|lyc[eé]e|biblioth[eè]que|"
    r"m[eé]diath[eè]que|square|jardin|parc|th[eé][aâ]tre|mus[eé]e|halte|conservatoire)\b",
    re.I)


def invest_rows(pat: str, kind_fr: str) -> list[dict]:
    """Projets d'investissement rapprochés du lieu par nom.

    Garde-fou : si le projet nomme un type d'équipement DIFFÉRENT de celui du
    lieu (« Gymnase … rue des Amiraux » pour une piscine), c'est un voisin de
    rue, pas le lieu — on l'écarte. Jointure de nom : fragile, à remplacer par
    adresse/SIRET en amont (docs/paris-lieux/PLAN.md)."""
    import unicodedata
    def _n(x):  # minuscules sans accents — « théâtre » et « theatre » doivent matcher
        return "".join(c for c in unicodedata.normalize("NFD", x.lower()) if unicodedata.category(c) != "Mn")
    kind_word = _n(kind_fr.split()[0])  # « Salle de concert » -> « salle »
    out = []
    for f in sorted(glob.glob(str(ROOT / "website/public/data/map/investissements_complet_*.json"))):
        year = f[-9:-5]
        for r in json.load(open(f)).get("data") or []:
            n = str(r.get("nom_projet") or "")
            if not (re.search(pat, n, re.I) and r.get("montant")):
                continue
            types = {_n(m) for m in LIEU_TYPES.findall(n)}
            # Le projet nomme un type d'équipement, et pas celui du lieu → voisin.
            if types and not any(kind_word[:5] in ty or ty[:5] in kind_word for ty in types):
                continue
            out.append({"annee": r.get("annee") or year, "montant_eur": r["montant"],
                        "nom_projet": n, "source_pdf": r.get("source_pdf")})
    return out


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    IMG.mkdir(parents=True, exist_ok=True)
    wiki = json.load(open(CACHE / "wiki_summaries.json")) if (CACHE / "wiki_summaries.json").exists() else {}
    # Crédit photo : les vignettes d'article viennent de Wikipédia, les repêchages
    # de Commons — licences et auteurs différents, on ne crédite pas au hasard.
    pmeta = json.load(open(CACHE / "photos_meta.json")) if (CACHE / "photos_meta.json").exists() else {}
    generated = datetime.now(timezone.utc).isoformat()
    index = []

    for seed_row in csv.DictReader(SEED.open()):
        slug = seed_row["slug"]
        delibs = jsonl(CACHE / f"{slug}_delibs.jsonl")
        if not delibs:
            continue  # pas encore synchronisé — le lieu n'existe pas pour le site
        cfg = OVERRIDES.get(slug, {})
        bmo_raw = jsonl(CACHE / f"{slug}_bmo.jsonl")
        snippets = jsonl(CACHE / f"{slug}_bmo_snippets.jsonl")
        enrich_p = CACHE / f"{slug}_enrich.json"
        enrich = json.load(open(enrich_p)) if enrich_p.exists() else {}
        # Un lieu entre sur le site quand sa lecture existe : sans moments, la
        # fiche n'offre qu'une photo et un résumé Wikipédia — un cul-de-sac.
        # Mieux vaut 22 lieux qui tiennent que 24 dont 2 vides.
        if not enrich.get("moments"):
            print(f"{slug:<30} — lecture manquante, non publié")
            continue
        ctx_p = CACHE / f"{slug}_ctx.json"
        ctx = json.load(open(ctx_p)) if ctx_p.exists() else {}
        w = wiki.get(slug, {})

        photo = None
        photo_credit = None
        src_img = CACHE / "photos" / f"{slug}.jpg"
        if src_img.exists():
            shutil.copy(src_img, IMG / f"{slug}.jpg")
            photo = f"/img/lieux/{slug}.jpg"
            pc = pmeta.get(slug)
            photo_credit = (
                {"licence": pc.get("license"), "auteur": pc.get("artist"),
                 "url": pc.get("page"), "source": "Wikimedia Commons"}
                if pc else
                {"licence": None, "auteur": None, "url": w.get("url"), "source": "Wikipédia"}
            )

        id2 = {d["id_document"]: d for d in delibs}
        # Saillance : quels moments mettre en avant (les 3-6 plus marquants, jugés
        # à part dans {slug}_saillance.json). N'altère pas les faits vérifiés — on
        # ne fait qu'ajouter un drapeau `vedette` que la fiche utilise pour plier
        # le reste. Sans fichier, tous restent vedette (repli chronologique côté UI).
        sp = CACHE / f"{slug}_saillance.json"
        forte = set(json.load(open(sp)).get("forte", [])) if sp.exists() else None
        moments = [{**m, "fait": fr_num(m.get("fait")),
                    "vedette": (m["id"] in forte) if forte is not None else True,
                    "source_url": id2.get(m["id"], {}).get("source_url")}
                   for m in enrich.get("moments", [])]
        montants = []
        for doc in enrich.get("docs", []):
            if doc.get("classe") in OFF_CLASSES:
                continue
            d = id2.get(doc["id"], {})
            for mt in doc.get("montants", []):
                montants.append({"seance": d.get("seance"), "montant": clean(mt["montant"]),
                                 "objet": clean(mt["objet"]), "citation": mt.get("citation"),
                                 "source_url": d.get("source_url")})

        bmo_extraits = []
        # Un lieu qui a changé de nom a plusieurs corpus BMO (Théâtre de la Ville
        # = Sarah-Bernhardt avant 1968). On compte et on cite les mêmes corpus,
        # sinon le KPI contredit les extraits affichés juste en dessous.
        picks = [(slug, cfg.get("bmo_picks", []))]
        if cfg.get("bmo_extra"):
            picks.append(cfg["bmo_extra"])
        pools = {slug: snippets}
        for src_slug, _ in picks[1:]:
            pools[src_slug] = jsonl(CACHE / f"{src_slug}_bmo_snippets.jsonl")

        # Source des extraits : le JUGE de pertinence ({slug}_bmo_keep.json) fait
        # AUTORITÉ dès qu'il existe. Les `bmo_picks` codés à la main lui étaient
        # prioritaires au départ — à tort : ces listes datent d'avant le juge et
        # contenaient justement le bruit de rue (piscine des Amiraux : « percement
        # de la rue » en 1897, trente ans avant la piscine). Un seul mécanisme,
        # sinon la cohérence promise n'existe pas. Repli sur les picks seulement
        # là où aucun jugement n'a été produit.
        keep_p = CACHE / f"{slug}_bmo_keep.json"
        if keep_p.exists():
            try:
                keep = json.load(open(keep_p)).get("keep", [])
            except Exception:
                keep = []
            for k in keep:
                for s in snippets:
                    if s.get("ark") == k.get("ark") and s.get("page") == k.get("page"):
                        bmo_extraits.append({
                            "date": s.get("issue_date"),
                            "extrait": re.sub(r"\(\.\.\.\)", " … ", s["snippet"][:280]),
                            "source_url": s["page_url"]})
                        break
        else:
            for src_slug, plist in picks:
                for date, page in plist:
                    for s in pools[src_slug]:
                        if s.get("issue_date") == date and s["page"] == page:
                            bmo_extraits.append({
                                "date": date,
                                "extrait": re.sub(r"\(\.\.\.\)", " … ", s["snippet"][:280]),
                                "source_url": s["page_url"]})
                            break
        bmo_extraits = [b for b in bmo_extraits if b.get("date") and lisible(b["extrait"])]
        bmo_extraits.sort(key=lambda b: b["date"])
        # Seuil de publication : une section d'archive n'a de sens que si elle
        # RACONTE quelque chose. Une ou deux citations isolées de 1890 sur une
        # fiche, c'est du bruit décoratif et de l'incohérence d'une fiche à
        # l'autre. En dessous de 3 extraits retenus, pas de section.
        BMO_MIN = 3
        if len(bmo_extraits) < BMO_MIN:
            bmo_extraits = []
        recit_p = CACHE / f"{slug}_bmo_recit.json"
        bmo_recit = None
        if bmo_extraits and recit_p.exists():
            try:
                bmo_recit = (json.load(open(recit_p)).get("recit") or "").strip() or None
            except Exception:
                bmo_recit = None

        # Nombre honnête : les documents qui portent réellement sur le lieu,
        # tels que la lecture les a classés. `n_delibs` est le total brut
        # renvoyé par le Solr du portail — 99 % de bruit sur les noms courants
        # (« tour AND Saint-Jacques » : 1499 résultats, 7 sur le monument).
        # Ne jamais l'afficher comme un compte de délibérations.
        docs_lus = enrich.get("docs", [])
        n_lieu = sum(1 for d in docs_lus if d.get("classe") not in OFF_CLASSES) if docs_lus else None

        # Période : celle des documents qui portent sur le lieu, pas du corpus
        # brut — « 32 délibérations 1996–2026 » laisserait croire que les 32
        # couvrent 30 ans alors que c'est l'étendue des 310 résultats bruts.
        ids_lieu = {d["id"] for d in docs_lus if d.get("classe") not in OFF_CLASSES}
        source_years = [d for d in delibs if d["id_document"] in ids_lieu] if ids_lieu else delibs
        years = sorted({int(y) for d in source_years
                        for y in [str(d.get("seance") or "").split()[-1]] if y.isdigit()})
        bmo_arks = {sn["ark"] for pool in pools.values() for sn in pool}
        # Argent public : issu du juge (gather → juge → résolu), plus fiable et
        # plus complet que l'ancien rapprochement par nom (qui ratait le Châtelet
        # et confondait crèche/gymnase avec la piscine des Amiraux).
        argent = resolve_argent(slug)
        invest = argent["investissements"]
        subv = argent["exploitant"]
        kpi = cfg.get("kpi_montant")
        # Sources par fiche : les liens délibs et BMO mènent à la recherche
        # pré-remplie du lieu (la requête vit dans chaque ligne du cache sync),
        # pas à la racine vide du portail ni au calendrier générique. Sans
        # corpus BMO (cache vide : zéro fascicule), on garde le calendrier —
        # une recherche à zéro résultat serait une suggestion morte.
        query = delibs[0].get("query")
        bmo_query = bmo_raw[0].get("query") if bmo_raw else None
        sources = {**SOURCES,
                   "delibs": {**SOURCES["delibs"],
                              **({"url": delibs_search_url(query)} if query else {})},
                   "bmo": {**SOURCES["bmo"],
                           **({"url": bmo_search_url(bmo_query)} if bmo_query else {})}}

        fiche = {
            "generated_at": generated,
            "source_pipeline": "run_lieux_seed.py → sync_debat_delibs.py + sync_gallica_bmo.py "
                               "→ prep_lieu_contexts.py → lecture in-session → curate_bmo_snippets.py "
                               "+ fix_bmo_dates.py → export_lieux.py",
            "slug": slug, "name": seed_row["name"],
            "kind_fr": seed_row["kind_fr"], "kind_en": KIND_EN.get(seed_row["kind_fr"], seed_row["kind_fr"]),
            "famille": seed_row["famille"],
            "arrondissement": int(seed_row["arr"]), "lat": float(seed_row["lat"]), "lon": float(seed_row["lon"]),
            "photo": photo,
            "photo_credit": photo_credit,
            "wiki": {"extract": w.get("extract"), "url": w.get("url"), "source": SOURCES["wiki"]},
            "stats": {
                "n_delibs": len(delibs),
                "delibs_span": [years[0], years[-1]] if years else None,
                "n_bmo_brut": len(bmo_raw),
                "n_bmo_verifies": (len(bmo_arks) if bmo_arks else None),
                "invest_total_eur": sum(r["montant_eur"] for r in invest),
                "invest_annees": sorted({str(r["annee"]) for r in invest}),
                # Couverture de lecture : ce que l'agent a réellement lu sur le corpus.
                "lecture_mode": ctx.get("selection_mode"),
                "lecture_mode_en": lecture_mode_en(ctx.get("selection_mode")),
                "n_lus": ctx.get("n_lus"),
                "n_lieu": n_lieu,
            },
            "subventions_exploitant": subv,
            "residents": argent["residents"],
            "kpi_montant": ({**kpi, "source_url": id2.get(kpi["doc_id"], {}).get("source_url")}
                            if kpi else None),
            "synthese_fr": enrich.get("synthese"),
            "moments": moments,
            "montants": montants,
            "bmo_extraits": bmo_extraits,
            "bmo_recit": bmo_recit,
            "invest": invest,
            "marches": argent["marches"],
            "mandate": ({"par_annee": argent["mandate_par_annee"],
                         "total_eur": argent["mandate_total_eur"],
                         "operations": argent["ap_operations"],
                         "periode": [min(argent["mandate_par_annee"]), max(argent["mandate_par_annee"])],
                         "source": {"name": "Comptes administratifs — autorisations de programme, Ville de Paris",
                                    "url": "https://opendata.paris.fr/explore/dataset/comptes-administratifs-autorisations-de-programmes-ap-ville-departement/"}}
                        if argent["mandate_par_annee"] else None),
            "sources": sources,
        }
        apply_en_translations(fiche, slug)
        (OUT / f"lieu_{slug}.json").write_text(json.dumps(fiche, ensure_ascii=False, indent=1))
        # Métrique citoyenne pour les cartes : l'argent si connu, sinon la
        # profondeur d'archive — pas « N délibérations » (jargon de process).
        # Métrique de carte tranchée (option B) : « identifié » = Dépensé (réel) +
        # Engagé (plafonds) — l'ordre de grandeur du lieu, réconciliable à l'euro
        # près avec les deux KPI de la fiche. Un euro engagé peut se retrouver
        # mandaté plus tard : « identifié » n'est PAS un cumul de dépense, et la
        # fiche l'explicite en le décomposant.
        argent_total = ((subv["total_eur"] if subv else 0) + argent["invest_total_eur"]
                        + argent["mandate_total_eur"] + argent["marches_total_eur"])
        depuis = int(bmo_extraits[0]["date"][:4]) if bmo_extraits else (years[0] if years else None)
        index.append({"slug": slug, "name": seed_row["name"], "kind_fr": seed_row["kind_fr"],
                      "famille": seed_row["famille"], "arrondissement": int(seed_row["arr"]),
                      "lat": float(seed_row["lat"]), "lon": float(seed_row["lon"]),
                      "n_lieu": n_lieu, "n_moments": len(moments),
                      "argent_total_eur": round(argent_total),
                      "depense_reelle_eur": round((subv["total_eur"] if subv else 0)
                                                  + argent["invest_total_eur"]
                                                  + argent["mandate_total_eur"]),
                      "engage_eur": round(argent["marches_total_eur"]),
                      "depuis": depuis, "photo": photo})
        print(f"{slug:<30} {len(delibs):>4} délibs | {len(moments)} moments | {len(montants)} montants | "
              f"{len(bmo_extraits)} BMO | {len(invest)} invest")

    (OUT / "index.json").write_text(json.dumps(
        {"generated_at": generated, "lieux": index}, ensure_ascii=False, indent=1))

    # ── Index inverse : bénéficiaire/projet → lieu ──
    # C'est le tissu conjonctif : sur une fiche subvention ou projet ailleurs sur
    # le site, permet d'afficher « ↗ Voir le lieu ». Construit en INVERSANT les
    # liens que le juge a établis (exploitant/résident → lieu, projet → lieu) —
    # donc reposant sur les mêmes preuves, jamais sur une ressemblance de nom.
    rev_benef: dict[str, dict] = {}
    rev_projet: dict[str, dict] = {}
    for slug in [l["slug"] for l in index]:
        name = next(l["name"] for l in index if l["slug"] == slug)
        rp = CACHE / f"{slug}_money_resolved.json"
        if not rp.exists():
            continue
        r = json.load(open(rp))
        for sv in r.get("subventions", []):
            if sv.get("role") in ("exploitant", "resident"):
                key = norm_key(sv["beneficiaire"])
                rev_benef[key] = {"slug": slug, "lieu": name, "role": sv["role"]}
        for pj in r.get("projets", []):
            if pj.get("role") == "au-lieu" and (pj.get("nom_projet") or "").strip():
                rev_projet[norm_key(pj["nom_projet"])] = {"slug": slug, "lieu": name}
    (OUT / "reverse_index.json").write_text(json.dumps(
        {"generated_at": generated, "beneficiaires": rev_benef, "projets": rev_projet},
        ensure_ascii=False, indent=1))
    print(f"→ {OUT.relative_to(ROOT)} — {len(index)} lieux · "
          f"index inverse : {len(rev_benef)} bénéficiaires, {len(rev_projet)} projets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
