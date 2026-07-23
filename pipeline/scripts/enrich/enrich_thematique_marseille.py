#!/usr/bin/env python3
"""
Thematique classification for Marseille subventions beneficiaries.

Writes the dbt seed `seeds/cities/marseille/seed_marseille_cache_thematique.csv`
(beneficiaire_normalise → ode_thematique), consumed by
stg_marseille_cache_thematique → core_marseille_subventions.

Marseille SCDL carries no SIRET / direction / catégorie, so the theme is derived
in-session (no external API by default — cf. memory feedback_enrichment_in_session)
from three signals, in priority order:

  1. grounded  — the in-session `secteur` already produced for the top orgs
                 (website/public/data/marseille/enrichment/beneficiaire_grounded.json,
                 model claude-code-in-session). Covers ~490 orgs / ~93% of the money.
  2. keyword   — ordered keyword rules on (beneficiary name + subvention objet),
                 authored by reading the corpus (the long tail is mostly sport
                 clubs — decisive objet "équipements sportifs" — culture, social).
  3. nature    — fallback on nature_juridique (Entreprises→Économie, public→Administration).
  4. default   — 'Non classifié' when nothing matches.

Taxonomy = the Paris THEMATIQUES set (shared vocabulary across French cities).

Usage:
  python scripts/enrich/enrich_thematique_marseille.py [--staging-dataset DS] [--use-llm]

--use-llm is a documented option (default OFF): the deterministic in-session
classifier above is the default path; an API classifier can be plugged in later.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import unicodedata
from pathlib import Path

PIPELINE_ROOT = Path(__file__).resolve().parents[2]
SEED_PATH = PIPELINE_ROOT / "seeds" / "cities" / "marseille" / "seed_marseille_cache_thematique.csv"
GROUNDED_PATH = (
    PIPELINE_ROOT.parent
    / "website" / "public" / "data" / "marseille" / "enrichment"
    / "beneficiaire_grounded.json"
)
PROJECT_ID = "open-data-france-484717"

# Paris taxonomy (shared). Keep labels byte-identical to enrich_thematique_llm.py.
THEME_SOCIAL = "Social"
THEME_EDUC = "Éducation"
THEME_CULTURE = "Culture"
THEME_SPORT = "Sport"
THEME_ECO = "Économie"
THEME_SANTE = "Santé"
THEME_ENV = "Environnement"
THEME_LOG = "Logement"
THEME_INTL = "International"
THEME_SECU = "Sécurité"
THEME_ADMIN = "Administration"
THEME_NC = "Non classifié"

# grounded secteur → Paris theme (the six real sectors; "autre" falls through).
GROUNDED_MAP = {
    "social": THEME_SOCIAL,
    "education": THEME_EDUC,
    "culture": THEME_CULTURE,
    "sport": THEME_SPORT,
    "economie": THEME_ECO,
    "sante": THEME_SANTE,
}

# Ordered keyword rules on (name + " " + objet), uppercased & accent-stripped.
# First match wins, so order encodes precedence (specific → generic).
KEYWORD_RULES: list[tuple[str, str]] = [
    # Sport — decisive objet signal + club vocabulary
    (r"EQUIPEMENTS? SPORTIF|\bSPORT|OLYMPIQUE|\bCLUB\b|FOOTBALL|\bRUGBY|\bTENNIS|BASKET|"
     r"HANDBALL|VOLLEY|NATATION|\bNAUTIQUE|\bAVIRON|CANOE|KAYAC|\bBOXE|BOXING|\bJUDO|"
     r"KARATE|ARTS MARTIAUX|\bGYM|GYMNIQUE|ATHLET|PETANQUE|ESCRIME|CYCL|TRIATHLON|"
     r"\bECHECS|EQUITATION|\bVOILE|PLONGEE|\bJEUNESSE SPORTIVE|OMNISPORT|\bUFOLEP\b", THEME_SPORT),
    # Culture
    (r"THEATRE|\bDANSE|MUSIQUE|MUSICAL|\bCHORALE|ORCHESTRE|\bOPERA|BALLET|\bCINEMA|"
     r"\bFILM\b|AUDIOVISUEL|CULTUREL|\bCULTURE|\bART\b|\bARTS\b|ARTISTIQUE|\bMUSEE|"
     r"PATRIMOINE|\bFESTIVAL|SPECTACLE|COMPAGNIE|\bLIVRE|LECTURE|\bMEDIATHEQUE|"
     r"BIBLIOTHEQUE|GALERIE|\bEXPO|PRODUCTIONS?\b|\bSCENE|CIRQUE|\bCHANT", THEME_CULTURE),
    # Petite enfance / éducation
    (r"\bCRECHE|HALTE.?GARDERIE|PETITE ENFANCE|MULTI.?ACCUEIL", THEME_SOCIAL),
    (r"\bECOLE|SCOLAIRE|PERISCOLAIRE|ENSEIGNEMENT|EDUCATI|\bUNIVERSIT|ETUDIANT|"
     r"\bFORMATION|PARENTS? D.?ELEVES|CAISSE DES ECOLES|\bLYCEE|\bCOLLEGE|"
     r"APPRENTISSAGE|\bSAVOIR", THEME_EDUC),
    # Santé
    (r"\bSANTE|MEDICAL|\bSOINS?\b|\bHOPITAL|HANDICAP|\bCANCER|\bSIDA\b|ADDICTION|"
     r"HANDICAPE|MALADIE|\bAUTIS|MEDECIN|SECOURIS", THEME_SANTE),
    # Social / solidarité
    (r"SOLIDARIT|\bSOCIAL|SECOURS|CROIX.?ROUGE|BANQUE ALIMENTAIRE|RESTOS DU C|"
     r"INSERTION|MISSION LOCALE|MAISON POUR TOUS|\bMPT\b|CENTRE SOCIAL|MAISON DE QUARTIER|"
     r"\bFAMILLE|FAMILIAL|\bENFANCE|JEUNESSE|PERSONNES AGEES|SENIOR|MIGRANT|REFUGIE|"
     r"PRECARITE|SANS ABRI|\bAIDE\b|ENTRAIDE|\bEMMAUS|LEO LAGRANGE|PLANNING FAMILIAL|"
     r"\bMJC\b|\bIFAC\b|EPISEC|ANIMATION", THEME_SOCIAL),
    # Environnement
    (r"ENVIRONNEMENT|ECOLOG|\bNATURE|BIODIVERSIT|\bJARDIN|\bDECHET|\bCLIMAT|"
     r"DEVELOPPEMENT DURABLE|\bPARC NATIONAL|NATUROSCOPE", THEME_ENV),
    # Logement
    (r"\bLOGEMENT|\bHABITAT|\bHLM\b|BAILLEUR|\bFONCIER", THEME_LOG),
    # International
    (r"INTERNATIONAL|COOPERATION|JUMELAGE|\bMONDE\b|FRANCOPHONIE|SOS MEDITERRANEE|"
     r"AMITIE|SANS FRONTIERE", THEME_INTL),
    # Sécurité / prévention
    (r"SECURITE|PREVENTION|\bPOMPIER|CIVIQUE|MEDIATION", THEME_SECU),
    # Économie
    (r"ENTREPRISE|COMMERCE|ARTISAN|\bEMPLOI|ECONOMI|INCUBATEUR|\bSTARTUP|\bTOURISME|"
     r"AMENAGEMENT|RENOVATION URBAINE|COMMERCANT", THEME_ECO),
]

NATURE_FALLBACK = {
    "Entreprises": THEME_ECO,
    "Etablissements de droit public": THEME_ADMIN,
    "Etablissements publics": THEME_ADMIN,
    "Autres personnes de droit public": THEME_ADMIN,
    "Communes": THEME_ADMIN,
    "Etat": THEME_ADMIN,
    "Régions": THEME_ADMIN,
    "Départements": THEME_ADMIN,
}


def strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def norm_key(s: str) -> str:
    s = (s or "").upper()
    s = re.sub(r"^(L'|LA |LE |LES |D'|DU |DE LA |DE L'|DES )", "", s)
    s = re.sub(r"[^A-Z0-9À-ÿ\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def keyword_theme(name: str, objet: str) -> str | None:
    hay = strip_accents(f"{name} {objet}".upper())
    for pattern, theme in KEYWORD_RULES:
        if re.search(pattern, hay):
            return theme
    return None


def classify(name: str, objet: str, nature: str, grounded_secteur: str | None) -> tuple[str, str]:
    """Return (theme, source)."""
    if grounded_secteur and grounded_secteur in GROUNDED_MAP:
        return GROUNDED_MAP[grounded_secteur], "grounded"
    kw = keyword_theme(name, objet)
    if kw:
        return kw, "keyword"
    if nature in NATURE_FALLBACK:
        return NATURE_FALLBACK[nature], "nature"
    return THEME_NC, "default"


def load_grounded() -> dict[str, str]:
    if not GROUNDED_PATH.exists():
        return {}
    items = json.load(open(GROUNDED_PATH)).get("items", {})
    return {norm_key(k): v.get("secteur") for k, v in items.items()}


def fetch_orgs(staging_dataset: str) -> list[dict]:
    from google.cloud import bigquery

    client = bigquery.Client(project=PROJECT_ID)
    q = f"""
        SELECT
            beneficiaire_normalise AS nb,
            MAX(beneficiaire) AS name,
            ANY_VALUE(nature_juridique) AS nature,
            STRING_AGG(DISTINCT NULLIF(objet, ''), ' ' LIMIT 5) AS objets,
            SUM(montant) AS montant
        FROM `{PROJECT_ID}.{staging_dataset}.stg_marseille_subventions`
        WHERE beneficiaire_normalise IS NOT NULL AND beneficiaire_normalise != ''
        GROUP BY 1
    """
    return [dict(r) for r in client.query(q).result()]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--staging-dataset",
        default=f"dbt_paris_dev_{os.environ.get('DBT_USER', 'local')}_staging",
        help="BQ dataset holding stg_marseille_subventions",
    )
    ap.add_argument("--use-llm", action="store_true",
                    help="(documented option, default OFF) use an API classifier instead")
    args = ap.parse_args()

    if args.use_llm:
        raise SystemExit(
            "--use-llm not wired: the default in-session deterministic classifier "
            "is the supported path (feedback_enrichment_in_session)."
        )

    grounded = load_grounded()
    orgs = fetch_orgs(args.staging_dataset)

    rows, stats = [], {}
    for o in orgs:
        theme, source = classify(
            o["name"] or "", o["objets"] or "", o["nature"] or "", grounded.get(o["nb"])
        )
        stats[source] = stats.get(source, 0) + 1
        rows.append({
            "beneficiaire_normalise": o["nb"],
            "ode_thematique": theme,
            "ode_sous_categorie": "",
            "ode_confiance": {"grounded": 0.9, "keyword": 0.7, "nature": 0.4, "default": 0.1}[source],
            "ode_source": source,
        })

    SEED_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SEED_PATH, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["beneficiaire_normalise", "ode_thematique",
                        "ode_sous_categorie", "ode_confiance", "ode_source"],
        )
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: r["beneficiaire_normalise"]))

    # coverage report
    money = {o["nb"]: o["montant"] for o in orgs}
    tot = sum(money.values()) or 1
    nc_money = sum(money[r["beneficiaire_normalise"]] for r in rows if r["ode_thematique"] == THEME_NC)
    print(f"wrote {len(rows)} rows → {SEED_PATH.relative_to(PIPELINE_ROOT)}")
    print("by source:", stats)
    print(f"Non classifié: {sum(1 for r in rows if r['ode_thematique']==THEME_NC)} orgs, "
          f"{nc_money/tot*100:.1f}% of money")


if __name__ == "__main__":
    main()
