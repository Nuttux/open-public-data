#!/usr/bin/env python3
"""
Post-traitement après merge_subv_pdf_into_opendata : assigne une
`thematique` aux bénéficiaires importés du PDF (qui n'en avaient pas) via
heuristique de mots-clés sur le nom, et regénère treemap_YYYY.json dans le
même format que 2022+ (champ `thematique`, pas `theme`).

Pour les bénéficiaires OpenData existants, leur `thematique` reste celle
fournie par le pipeline original (issue de seed_mapping_thematiques + LLM).
Seuls les bénéficiaires sans thématique reçoivent une attribution heuristique.

Usage :
    python pipeline/scripts/tools/assign_thematique_post_pdf.py --year 2020
    python pipeline/scripts/tools/assign_thematique_post_pdf.py --year 2021
"""
from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SUBV_DIR = ROOT / "pipeline" / "cache" / "subventions_pre_enrichment"

# Heuristique mot-clé → thématique. L'ordre compte : on s'arrête au premier
# match. Les patterns sont appliqués sur le nom normalisé (UPPERCASE +
# accents stripés). Aligné sur la liste de thématiques utilisée par 2022+.
# Note : on utilise des préfixes ouverts (sans \b final strict) pour matcher
# les variations plurielles / dérivées (PUERICULT → PUERICULTURE, RESID → RESIDENCES).
KEYWORDS_TO_THEMATIQUE: list[tuple[str, str]] = [
    # Logement / habitat — d'abord car termes génériques captés par d'autres règles
    (r"\b(HABITAT|LOGEMENT|HLM|RIVP|ELOGIE|SIEMP|SEMAPA|BAILLEUR|COPROPR|FONCIER|BATIMENT|IMMOBIL)", "Logement"),
    (r"\b(PARIS\s*HABITAT|3F\s*RESID|ICF\s*HABITAT|ICF\s*LA\s*SABLI|CDC\s*HABITAT|RATP\s*HABITAT|TOIT\s*ET\s*JOIE|SEQENS|BATIGERE|HSF|1001\s*VIES|VIE\s*HABITAT|REQUALI|REQUALICATION|REQUALIFICATION)", "Logement"),
    # Santé — hôpitaux et fondations médicales
    (r"\b(HOPIT|HOPITAL|HOSPITAL|MEDICAL|MEDICALE|MEDECINE|EHPAD|SANTE|DIACONESSE|ROTHSCHILD|AP[\s\-]?HP|ASSISTANCE\s*PUBLIQUE|MSP\b|PHARMA|CLINIQUE|VOIR\s+ET\s+ENTENDRE|DREPANO|FONDATION\s*OPHT|CROIX\s+SAINT\s+SIMON|CROIX\s+ST\s+SIM|OEUVRE\s+DE\s+LA\s+CROIX)\b", "Santé"),
    # Social - Solidarité
    (r"\b(CASVP)\b", "Social - Solidarité"),
    (r"\bCENTRE(\s+D)?\s*ACTION\s*SOCIAL", "Social - Solidarité"),
    (r"\bACTION\s*SOCIA", "Social - Solidarité"),
    (r"\bAGOSPAP\b", "Social - Solidarité"),
    (r"\b(PERSONNES?\s*AGEES?|RETRAITES?|GERONTOLOG|3EME?\s*AGE)", "Social - Solidarité"),
    (r"\b(SOLIDARIT|SOCIALE?S?\b|SAMU\s*SOCIAL|CROIX[\s\-]?ROUGE|EMMAUS|RESTOS|SECOURS\s*POPULAIRE|SECOURS\s*CATHO|AIDE\s*SOC|ENFANCE|FAMILLE|HANDICAP|REFUGIE|MIGRATION|EXCLUSION|HUMANISME|PRECARIT|HEBERGE|FOYER|AURORE)\b", "Social - Solidarité"),
    # Culture
    (r"\b(MUSEE|MUSEUM|THEATRE|CINEMA|CONSERVATOI|BIBLIOTHEQUE|MEDIATHEQUE|OPERA|ORCHESTRE|PHILHARMONI|CULTUREL|CULTURELL|CULTURE|ARTS?|ARTIST|FESTIVAL|SCENE|EXPOSITION|GALERIE|PATRIMOINE|MEMOI|JUDA[IÏ]SME|HISTOI|CITE\s+DE\s+LA\s+MUSIQUE|ENSEMBLE\s+(VOCAL|MUSICAL))", "Culture"),
    (r"\b(PARIS\s*MUSEES|CNAP|CENTRE\s*NATIONAL\s*DES\s*ARTS\s*PLAS|FORUM\s*DES\s*IMAGES|PHILHARMONIE|GAITE\s*LYRIQUE|CENTQUATRE|104\b|CHATELET|VILLE\s+DE\s+PARIS\s+THEATRE|MAISON\s*DES\s*METALLOS)\b", "Culture"),
    # Sport
    (r"\b(SPORT|STADE|GYMNASE|PISCINE|CLUB|FEDERATION\s*FRAN|JUDO|FOOTBALL|RUGBY|ATHLET|NATATION|CYCLIST|VELO|TENNIS|HANDBALL|VOLLEY|GOLF|JEUNESSE\s*ET\s*SPORTS?|ESCRIME|ARMES\s*DE\s*FRANCE|JEUX\s*OLYM|OLYMPIQUE|OLYMPIQUES|PARALYMPIQUE|OUVRAGES\s*OLYM|SOLIDEO|LIVRAISON\s+OUVRAGES\s+OLYMPIQUES)", "Sport"),
    # Sécurité
    (r"\b(PREFECTURE\s*DE\s*POLICE|POLICE\s*MUNICIPALE|POMPIERS?|BSPP|BRIGADE\s*DES\s*SAPEURS|GENDARMERIE|SECURITE\s*CIVILE|SECURITE\s*PUBLIQUE|PROTECTION\s*CIVILE)", "Sécurité"),
    # Éducation - Jeunesse / Petite enfance
    (r"\b(ECOLE|UNIVERSITE|SCIENCES\s*PO|SORBONNE|LYCEE|COLLEGE|GROUPE\s*SCOLAIRE|EDUCATION|EDUCATIF|EDUCAT|FORMATION|ETUDIANT|JEUNES|JEUNESSE|CRECHE|HALTE\s*GARDERIE|MULTI\s*ACCUEIL|PMI|ENSEIGNEMENT|SCOLAIRE|PUERICULT|PETITE\s*ENFANCE)", "Éducation - Jeunesse"),
    (r"\bCAISSE(S?)\s+(DES?\s+)?ECOLES?\b", "Éducation - Jeunesse"),
    (r"\bREGIE\s+ECOLE", "Éducation - Jeunesse"),
    (r"\b(POP\s*SCHOOL|SIMPLON|WEBFORCE|EPITECH|42|EPSCI|HEC|ESCP|ESSEC|DAUPHINE|INALCO|FONDATION\s+NATIONALE\s+SCIENCES?\s+POLITIQUE|CROUS|CENTRE\s+REGIONAL\s+OEUVRES\s+UNIV|MISSION\s+LOCALE|CRESCENDO)\b", "Éducation - Jeunesse"),
    # Environnement - Climat
    (r"\b(CLIMAT|ENVIRONNEMENT|ENVIRO|ECOLO|VERT|ESPACE\s*VERT|JARDIN|PARC|BIODIVERS|NATURE|AGRICULTURE|FORET|EAU|ASSAINISSEMENT|RECYCL|DECHETS?|ENERG)\b", "Environnement - Climat"),
    # Économie - Emploi
    (r"\b(EMPLOI|ECONOM|ECONOMIQUE|ENTREPRISE|BPI|BPIFRANCE|COMMERCE|MARCHE|ARTISAN|PLIE|EPEC|REINSERTION|INSERTION\s*PRO|JEUNES\s*ENTREPRENEUR|INCUBATEUR|STARTUP|PARIS\s*EUROPLACE|PARIS\s*INITIATIVES|TOURISME|CONGRES)\b", "Économie - Emploi"),
    # Transport
    (r"\b(TRANSPORTS?|RATP|SNCF|METRO|VELIB|AUTOLIB|BUS\b|TRAM|VOIRIE|MOBILIT|CYCLABLE|PIETON|ROUTE|TUNNEL|REGIE\s+AUTONOME\s+TRANSPORTS?)\b", "Transport"),
    # International - Coopération
    (r"\b(INTERNATIONAL|COOPERATION|OIM|UNESCO|REFUGIE|REFUGEES?|MIGRATION|DROITS\s*DE\s*L\s*HOMME|DEVELOPP\s*INTERNATIONAL|ONG|HUMANITAIRE|FRANCO|EUROPE)\b", "International - Coopération"),
    # Démocratie - Vie locale
    (r"\b(DEMOCRATI|CITOYEN|CONSEIL\s*DE\s*QUARTIER|VIE\s*ASSO|VIE\s*LOCALE|MAIRIE|REGION|DEPARTEMENT|COMMUNE\b|SYNDICAT\s*MIXTE|EPCI|CONSEILLERS?\s*MUNICI|RETRAITE\s*CONSEIL)\b", "Démocratie - Vie locale"),
]


def normalize(name: str) -> str:
    if not name:
        return ""
    s = unicodedata.normalize("NFD", name).upper()
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9]+", " ", s)).strip()


def guess_thematique(name: str, nature_juridique: str | None = None) -> str:
    """Retourne la thématique heuristique. Fallback : 'Autre'."""
    norm = normalize(name)
    if not norm:
        return "Autre"
    for pattern, theme in KEYWORDS_TO_THEMATIQUE:
        if re.search(pattern, norm):
            return theme
    # Fallback par nature juridique pour les sous-totaux ou cas non reconnus
    nj = (nature_juridique or "").lower()
    if "personne" in nj and "physique" in nj:
        return "Aide individuelle"
    return "Autre"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    benef_path = SUBV_DIR / f"beneficiaires_{args.year}.json"
    treemap_path = SUBV_DIR / f"treemap_{args.year}.json"

    d = json.load(benef_path.open(encoding="utf-8"))
    rows = d.get("data", [])

    # 1. Compléter / réécraser thematique sur les rows sans valeur OU
    #    déjà attribuée par heuristique (pour pouvoir itérer sur les règles
    #    sans perdre les `thematique` venues du pipeline OpenData d'origine).
    assigned = 0
    for r in rows:
        existing = r.get("thematique")
        is_heuristic = r.get("thematique_source") == "heuristic_keywords"
        if not existing or is_heuristic:
            r["thematique"] = guess_thematique(
                r.get("beneficiaire", ""), r.get("nature_juridique"),
            )
            r["thematique_source"] = "heuristic_keywords"
            assigned += 1
    print(f"  {args.year}: thématique (re)assignée à {assigned} bénéficiaires (sur {len(rows)})")

    if not args.dry_run:
        benef_path.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")

    # 2. Regénérer treemap dans le format 2022+ (annee/thematique/nb_beneficiaires/nb_subventions/montant_total/pct_total)
    agg: dict[str, dict[str, float]] = defaultdict(lambda: {
        "nb_beneficiaires": 0,
        "nb_subventions": 0,
        "montant_total": 0.0,
    })
    for r in rows:
        theme = r.get("thematique") or "Autre"
        agg[theme]["nb_beneficiaires"] += 1
        agg[theme]["nb_subventions"] += r.get("nb_subventions", 1)
        agg[theme]["montant_total"] += r.get("montant_total", 0)
    total = sum(a["montant_total"] for a in agg.values()) or 1
    data = [
        {
            "annee": args.year,
            "thematique": k,
            "nb_beneficiaires": int(v["nb_beneficiaires"]),
            "nb_subventions": int(v["nb_subventions"]),
            "montant_total": round(v["montant_total"], 2),
            "pct_total": round(v["montant_total"] / total * 100, 2),
        }
        for k, v in sorted(agg.items(), key=lambda x: -x[1]["montant_total"])
    ]

    print(f"  {args.year}: treemap regénéré ({len(agg)} thématiques)")
    for d_ in data[:8]:
        print(f"    {d_['thematique']:<30s} {d_['montant_total']/1e6:>7.1f} M€  ({d_['pct_total']:>4.1f} %)")

    if not args.dry_run:
        payload = {
            "year": args.year,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_montant": round(total, 2),
            "nb_thematiques": len(agg),
            "data": data,
        }
        treemap_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
