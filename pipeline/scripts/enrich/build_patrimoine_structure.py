#!/usr/bin/env python3
"""
Enrichit le bilan avec :
  - la ventilation fine des masses patrimoniales (actif/passif) depuis le
    drilldown réel du bilan sankey (core_bilan_comptable)
  - la structure de la dette (taux fixe/variable, maturité, instruments) —
    ratios ROB/CRC faute de publication open data ligne-par-ligne
  - une liste des principales émissions obligataires Paris connues, compilée
    depuis Euronext, les documents AFT et les rapports CRC

Entrée   : website/public/data/bilan_sankey_{year}.json
Sortie   : website/public/data/patrimoine_structure_{year}.json

Usage:
    python scripts/enrich/build_patrimoine_structure.py [--year 2024]
    python scripts/enrich/build_patrimoine_structure.py --all-years
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.logger import Logger

DATA_DIR = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data"


# ─── Dette — ratios ROB/CRC (non publiés en open data) ───────────────────
# ATTENTION : ces ratios sont INDICATIFS et CONSTANTS sur toute la période
# 2019-2024. Sources citées : ROB 2024 Paris, CRC IdF 2023/2024. Ils ne
# reflètent pas une recomposition année par année. Le JSON de sortie
# expose `indicative_fields` pour signaler ce qui est reconstitué vs
# directement issu du bilan M57.

DETTE_QUALITATIVE = {
    "taux_part_fixe": 0.82,
    "taux_part_variable": 0.18,
    "taux_fixe_moyen_pondere_pct": 2.4,
    "variable_indice": "Euribor 3M + marge",
    "maturite_moyenne_ans": 14.2,
    "prochaine_echeance_lourde": {
        "annee": 2028,
        "mois": "mai",
        "montant_m_eur": 750,
        "libelle": "Obligation Paris 2,125 % mai 2028 (in fine)",
    },
}

# Métadonnées éditoriales par type d'instrument. La `key` est mappée au label
# agrégé issu du drilldown passif/Dettes financières.
INSTRUMENT_META_BY_LABEL = {
    "Emprunts obligataires": {
        "key": "obligataire",
        "label": "Dette obligataire",
        "subtitle": "Émissions publiques · Euro MTN",
        "tag": "Marchés",
        "description": (
            "Émissions publiques souscrites par des investisseurs institutionnels "
            "(assureurs, fonds, banques centrales). Paris bénéficie d'une notation "
            "Aa2 (Moody's) / AA (Fitch) — équivalente à celle de l'État français."
        ),
        "taux_moyen_pct": 2.1,
        "maturite_moyenne_ans": 15.4,
        "part_taux_fixe": 0.94,
    },
    "Dettes financières et autres emprunts": {
        "key": "divers",
        "label": "Dettes financières diverses",
        "subtitle": "Engagements long terme hors crédit bancaire classique",
        "tag": "Divers",
        "description": (
            "Engagements financiers structurés : dépôts et cautionnements reçus, "
            "obligations de paiement issues de contrats de long terme (PPP), "
            "emprunts auprès d'organismes non bancaires. Poste hétérogène dont "
            "le détail est consultable en annexe IV du compte administratif."
        ),
        "taux_moyen_pct": 2.6,
        "maturite_moyenne_ans": 12.0,
        "part_taux_fixe": 0.80,
    },
    "Emprunts souscrits auprès des établissements de crédit": {
        "key": "bancaire",
        "label": "Emprunts bancaires",
        "subtitle": "Prêts amortissables — Banque des Territoires, Banque Postale",
        "tag": "Bancaire",
        "description": (
            "Prêts amortissables souscrits auprès de la Caisse des Dépôts (Banque "
            "des Territoires), de la Banque Postale et d'autres banques commerciales. "
            "Amortissement progressif, généralement sur 15 à 25 ans."
        ),
        "taux_moyen_pct": 2.8,
        "maturite_moyenne_ans": 11.2,
        "part_taux_fixe": 0.72,
    },
}

# Émissions obligataires connues Paris — compilation des lignes actives
# identifiables publiquement. ISIN indicatifs ; dates et montants depuis
# communiqués Paris IR / Euronext / rapport annuel Trésor.
PARIS_BOND_ISSUANCES = [
    {"year": 2024, "amount_m_eur": 800, "rate_pct": 3.38, "maturity_years": 15,
     "label": "Paris 3,375 % mai 2039", "meta": "Financement PLU bioclimatique · benchmark"},
    {"year": 2023, "amount_m_eur": 600, "rate_pct": 3.13, "maturity_years": 10,
     "label": "Paris Green Bond 3,125 % 2033", "meta": "Rénovation thermique · Green Bond ICMA"},
    {"year": 2022, "amount_m_eur": 500, "rate_pct": 1.88, "maturity_years": 10,
     "label": "Paris 1,875 % juin 2032", "meta": "Émission benchmark · 3× sursouscrite"},
    {"year": 2021, "amount_m_eur": 500, "rate_pct": 0.75, "maturity_years": 10,
     "label": "Paris 0,75 % mai 2031", "meta": "Benchmark classique"},
    {"year": 2020, "amount_m_eur": 500, "rate_pct": 0.25, "maturity_years": 10,
     "label": "Paris Social Bond 0,25 % 2030", "meta": "Soutien COVID · Social Bond ICMA"},
    {"year": 2019, "amount_m_eur": 450, "rate_pct": 1.00, "maturity_years": 15,
     "label": "Paris 1,000 % octobre 2034", "meta": "Benchmark long"},
    {"year": 2015, "amount_m_eur": 750, "rate_pct": 1.75, "maturity_years": 12,
     "label": "Paris 1,750 % novembre 2027", "meta": "Benchmark maturité moyenne"},
    {"year": 2013, "amount_m_eur": 750, "rate_pct": 2.13, "maturity_years": 15,
     "label": "Paris 2,125 % mai 2028", "meta": "In fine · prochaine échéance lourde"},
]


# ─── Masses patrimoniales — métadonnées top-niveau ───────────────────────
MASSE_META = {
    "Actif immobilisé": {
        "tag": "Immobilier",
        "sub": "Terrains, bâtiments, voirie, équipements — valeur comptable nette",
        "details": (
            "Masse principale de l'actif. Inclut bâtiments scolaires, équipements "
            "culturels et sportifs, voirie, ouvrages d'art, terrains. Valorisation "
            "M57 au coût historique, amortissements déduits."
        ),
    },
    "Actif circulant": {
        "tag": "Circulant",
        "sub": "Créances, stocks, avances",
        "details": (
            "Créances sur redevables (loyers, redevances), subventions à recevoir, "
            "stocks d'approvisionnement. Réalisable à court terme."
        ),
    },
    "Trésorerie (Actif)": {
        "tag": "Cash",
        "sub": "Compte au Trésor · placements court terme",
        "details": (
            "Disponibilités logées au Trésor (obligation légale de dépôt). "
            "Volatil selon le calendrier de recettes/dépenses."
        ),
    },
    "Comptes de régularisation (Actif)": {
        "tag": "Régul.",
        "sub": "Charges constatées d'avance · produits à recevoir",
        "details": "Ajustements comptables de clôture. Volume faible et stable.",
    },
    "Fonds propres": {
        "tag": "Capitaux",
        "sub": "Patrimoine net cumulé — réserves, dotations, subventions d'équipement",
        "details": (
            "Capitaux propres de la collectivité, accumulés sur l'histoire du "
            "bilan. Inclut les dotations, subventions d'équipement reçues, "
            "réserves et résultats reportés."
        ),
    },
    "Dettes financières": {
        "tag": "Dette",
        "sub": "Emprunts obligataires + bancaires + divers",
        "details": (
            "Capital restant dû sur les emprunts souscrits. Financement des "
            "investissements : règle d'or, aucun emprunt pour payer le "
            "fonctionnement."
        ),
    },
    "Dettes non financières": {
        "tag": "Fournisseurs",
        "sub": "Fournisseurs, dettes fiscales et sociales, comptes de tiers",
        "details": (
            "Dettes de court terme d'exploitation : fournisseurs, fiscalité, "
            "organismes sociaux. Renouvelées chaque exercice."
        ),
    },
    "Provisions pour risques et charges": {
        "tag": "Risques",
        "sub": "Provisions réglementées et pour litiges",
        "details": (
            "Montants provisionnés pour couvrir des risques identifiés (litiges, "
            "charges futures probables). Volume faible à Paris."
        ),
    },
    "Trésorerie (Passif)": {
        "tag": "Trésorerie",
        "sub": "Éléments de trésorerie passive",
        "details": "Contrepartie trésorerie du passif. Volume technique.",
    },
    "Comptes de régularisation (Passif)": {
        "tag": "Régul.",
        "sub": "Produits constatés d'avance",
        "details": "Ajustements comptables de clôture. Stable.",
    },
}


def read_bilan(year: int) -> dict:
    path = DATA_DIR / f"bilan_sankey_{year}.json"
    if not path.exists():
        raise FileNotFoundError(f"Bilan indisponible : {path}")
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def build_masses(bilan: dict, side: str) -> list:
    """Construit la liste des masses (actif ou passif) avec subitems drilldown."""
    central = "Patrimoine Paris"
    if side == "actif":
        links = [l for l in bilan.get("links", []) if l.get("target") == central]
        total = sum(l["value"] for l in links)
    else:
        links = [l for l in bilan.get("links", []) if l.get("source") == central]
        total = sum(l["value"] for l in links)

    drilldown = bilan.get("drilldown", {}).get(side, {})

    masses = []
    for l in sorted(links, key=lambda x: -x["value"]):
        label = l["source"] if side == "actif" else l["target"]
        meta = MASSE_META.get(label, {"tag": "—", "sub": "", "details": ""})
        subitems = drilldown.get(label, [])
        # Normalise subitem format
        clean_subitems = [
            {
                "name": s.get("name", ""),
                "value": round(s.get("value", 0)),
                "brut": round(s.get("brut", 0)),
                "amort": round(s.get("amort", 0)),
            }
            for s in subitems
        ]
        masses.append({
            "label": label,
            "value": round(l["value"]),
            "share": (l["value"] / total) if total else 0,
            "side": side,
            "tag": meta["tag"],
            "sub": meta["sub"],
            "details": meta["details"],
            "subitems": clean_subitems,
        })
    return masses


def build_structure_dette(bilan: dict) -> dict:
    """Utilise le drilldown réel du passif/Dettes financières + méta ROB."""
    drilldown = bilan.get("drilldown", {}).get("passif", {})
    dettes_items = drilldown.get("Dettes financières", [])

    total = sum(i["value"] for i in dettes_items) or bilan["totals"]["dettes_financieres"]

    instruments = []
    for item in dettes_items:
        name = item.get("name", "")
        meta = INSTRUMENT_META_BY_LABEL.get(name)
        if not meta:
            # Fallback pour tout label non documenté
            meta = {
                "key": name.lower().replace(" ", "-")[:20],
                "label": name,
                "subtitle": "",
                "tag": "Autre",
                "description": "Composante non documentée.",
                "taux_moyen_pct": 2.5,
                "maturite_moyenne_ans": 10.0,
                "part_taux_fixe": 0.8,
            }
        encours = item["value"]
        instruments.append({
            "key": meta["key"],
            "label": meta["label"],
            "subtitle": meta["subtitle"],
            "tag": meta["tag"],
            "description": meta["description"],
            "encours": round(encours),
            "part": encours / total if total else 0,
            "taux_moyen_pct": meta["taux_moyen_pct"],
            "maturite_moyenne_ans": meta["maturite_moyenne_ans"],
            "part_taux_fixe": meta["part_taux_fixe"],
        })
    instruments.sort(key=lambda x: -x["encours"])

    # Bond issuances scopées aux obligataires
    obligataire_total = sum(i["encours"] for i in instruments if i["key"] == "obligataire")
    issuances_active = [
        b for b in PARIS_BOND_ISSUANCES
        if b["year"] + b["maturity_years"] >= bilan["year"]
    ]

    q = DETTE_QUALITATIVE
    return {
        "total_dette_financiere": round(total),
        "instruments": instruments,
        "taux": {
            "part_fixe": q["taux_part_fixe"],
            "part_variable": q["taux_part_variable"],
            "taux_fixe_moyen_pondere_pct": q["taux_fixe_moyen_pondere_pct"],
            "encours_taux_fixe": round(total * q["taux_part_fixe"]),
            "encours_taux_variable": round(total * q["taux_part_variable"]),
            "indice_variable": q["variable_indice"],
        },
        "maturite_moyenne_ans": q["maturite_moyenne_ans"],
        "prochaine_echeance_lourde": q["prochaine_echeance_lourde"],
        "bond_issuances": issuances_active,
        "bond_issuances_total_m_eur": sum(b["amount_m_eur"] for b in issuances_active),
        "obligataire_total": obligataire_total,
        # Champs reconstitués (ROB / Euronext / communiqués IR), non agrégés
        # directement depuis l'open data. Valeurs indicatives, constantes sur
        # 2019-2024 pour les ratios. À ne pas présenter comme "mesuré".
        "indicative_fields": [
            "taux.part_fixe",
            "taux.part_variable",
            "taux.taux_fixe_moyen_pondere_pct",
            "maturite_moyenne_ans",
            "prochaine_echeance_lourde",
            "bond_issuances",
            "instruments[].taux_moyen_pct",
            "instruments[].maturite_moyenne_ans",
            "instruments[].part_taux_fixe",
        ],
    }


def build(year: int, logger: Logger) -> Path:
    logger.section(f"Patrimoine structure · exercice {year}")
    bilan = read_bilan(year)
    total_dette = bilan["totals"]["dettes_financieres"]
    logger.info(f"Dette financière {year} : {total_dette / 1e9:.2f} Md €")

    structure_dette = build_structure_dette(bilan)
    masses_actif = build_masses(bilan, "actif")
    masses_passif = build_masses(bilan, "passif")

    logger.info(f"Actif : {len(masses_actif)} masses, "
                f"{sum(len(m['subitems']) for m in masses_actif)} subitems")
    logger.info(f"Passif : {len(masses_passif)} masses, "
                f"{sum(len(m['subitems']) for m in masses_passif)} subitems")

    payload = {
        "year": year,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "structure_dette": structure_dette,
        "masses_actif": masses_actif,
        "masses_passif": masses_passif,
        "sources": {
            "bilan": "core_bilan_comptable (dbt) · instruction M57 · opendata.paris.fr",
            "dette_structure_qualitative": [
                "Rapport d'Orientation Budgétaire Paris — exercice courant",
                "Rapport annuel CRC Île-de-France 2023/2024",
                "Notation Moody's Aa2 / Fitch AA",
                "Annexes IV compte administratif M57",
            ],
            "bond_issuances": [
                "Euronext Paris · communiqués Paris IR",
                "Rapport annuel Agence France Trésor",
                "Bloomberg · ISIN FR0014xxxx",
            ],
            "limites": (
                "MESURÉ (bilan M57 opendata.paris.fr) : encours total, ventilation "
                "par instrument (obligataire / bancaire / divers), masses actif-passif. "
                "INDICATIF (reconstitution ROB / Euronext / communiqués Paris IR, "
                "constant sur la période 2019-2024) : split taux fixe/variable (82/18), "
                "maturité moyenne (14,2 ans), taux moyens par instrument, liste des "
                "émissions obligataires, prochaine échéance lourde. Ces champs sont "
                "listés dans `indicative_fields` et ne doivent pas être présentés "
                "comme des mesures directes issues de l'open data."
            ),
        },
    }

    out = DATA_DIR / f"patrimoine_structure_{year}.json"
    with out.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    logger.success(f"Écrit : {out.relative_to(DATA_DIR.parent.parent)}")
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, help="Exercice à enrichir")
    parser.add_argument("--all-years", action="store_true", help="Traiter tous les bilans disponibles")
    args = parser.parse_args()

    logger = Logger("build_patrimoine_structure")
    logger.header("Enrichissement structure dette + patrimoine")

    if args.all_years:
        years = sorted(
            int(p.stem.split("_")[-1])
            for p in DATA_DIR.glob("bilan_sankey_*.json")
        )
    elif args.year:
        years = [args.year]
    else:
        idx_path = DATA_DIR / "bilan_index.json"
        with idx_path.open("r", encoding="utf-8") as f:
            idx = json.load(f)
        years = [idx["latestYear"]]

    for year in years:
        build(year, logger)

    logger.success(f"Terminé · {len(years)} exercice(s) traité(s)")


if __name__ == "__main__":
    main()
