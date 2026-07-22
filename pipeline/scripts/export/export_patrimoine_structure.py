#!/usr/bin/env python3
"""
Export patrimoine_structure_{year}.json — structure de la dette + masses bilan.

Source données mesurées (M57): mart_bilan_comptable (BigQuery).
Source données indicatives (ROB / Euronext / communiqués Paris IR): constantes
éditoriales en bas de fichier, signalées dans `indicative_fields` du JSON
de sortie. Ces ratios sont CONSTANTS sur 2019-2024 — voir bloc `limites`.

Output: website/public/data/patrimoine_structure_{year}.json

Usage:
    python pipeline/scripts/export/export_patrimoine_structure.py [--year 2024]
    python pipeline/scripts/export/export_patrimoine_structure.py --all-years
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent))
from utils.logger import Logger
from _export_common import get_bigquery_client, data_dir, marts_dataset

PROJECT_ID = "open-data-france-484717"
MARTS_DATASET = marts_dataset()
DATA_DIR = data_dir()


# =============================================================================
# Constantes éditoriales — ratios ROB/CRC (non publiés en open data)
# =============================================================================
# ATTENTION : ces ratios sont INDICATIFS et CONSTANTS sur 2019-2024. Sources :
# ROB 2024 Paris, CRC IdF 2023/2024. Le JSON expose `indicative_fields` pour
# signaler ce qui est reconstitué vs directement issu du bilan M57 mesuré.
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


# =============================================================================
# Lecture des données mesurées depuis mart_bilan_comptable
# =============================================================================

def fetch_bilan_rows(client: bigquery.Client, year: int) -> list[dict]:
    """Récupère les lignes du bilan pour l'année depuis le mart."""
    query = f"""
    SELECT type_bilan, poste, detail, montant_brut, montant_amortissements, montant_net
    FROM `{PROJECT_ID}.{MARTS_DATASET}.mart_bilan_comptable`
    WHERE annee = {year}
    ORDER BY type_bilan, poste, montant_net DESC
    """
    return [dict(r) for r in client.query(query).result()]


def reconstruct_bilan_shape(rows: list[dict], year: int) -> dict:
    """Reconstruit la structure que l'ancien `read_bilan(year)` exposait :
    `links` (Sankey) et `drilldown` (subitems), à partir des lignes core.

    Reproduit le suffixe « (Actif) » / « (Passif) » sur les postes qui
    apparaissent des deux côtés du bilan — comportement requis pour la
    compatibilité byte-equal avec l'ancien build qui lisait
    bilan_sankey_<year>.json.
    """
    central = "Patrimoine Paris"
    postes_actif = defaultdict(lambda: {"net": 0.0, "items": []})
    postes_passif = defaultdict(lambda: {"net": 0.0, "items": []})

    for r in rows:
        net = float(r["montant_net"] or 0)
        brut = float(r["montant_brut"] or 0)
        amort = float(r["montant_amortissements"] or 0)
        target = postes_actif if r["type_bilan"] == "Actif" else postes_passif
        target[r["poste"]]["net"] += net
        if r["detail"] and net > 0:
            target[r["poste"]]["items"].append({
                "name": r["detail"],
                "value": net,
                "brut": brut,
                "amort": amort,
            })

    postes_communs = set(postes_actif.keys()) & set(postes_passif.keys())

    def node_name(poste: str, category: str) -> str:
        if poste in postes_communs:
            return f"{poste} ({category.capitalize()})"
        return poste

    links = []
    drilldown = {"actif": {}, "passif": {}}
    for poste, info in postes_actif.items():
        if info["net"] > 0:
            name = node_name(poste, "actif")
            links.append({"source": name, "target": central, "value": info["net"]})
            if info["items"]:
                drilldown["actif"][name] = sorted(info["items"], key=lambda x: -x["value"])[:20]
    for poste, info in postes_passif.items():
        if info["net"] > 0:
            name = node_name(poste, "passif")
            links.append({"source": central, "target": name, "value": info["net"]})
            if info["items"]:
                drilldown["passif"][name] = sorted(info["items"], key=lambda x: -x["value"])[:20]

    fonds_propres = postes_passif.get("Fonds propres", {}).get("net", 0)
    dettes_financieres = postes_passif.get("Dettes financières", {}).get("net", 0)
    dettes_non_financieres = postes_passif.get("Dettes non financières", {}).get("net", 0)
    provisions = postes_passif.get("Provisions pour risques et charges", {}).get("net", 0)
    total_actif = sum(p["net"] for p in postes_actif.values())
    total_passif = sum(p["net"] for p in postes_passif.values())
    dette_totale = dettes_financieres + dettes_non_financieres

    return {
        "year": year,
        "links": links,
        "drilldown": drilldown,
        "totals": {
            "actif_net": total_actif,
            "passif_net": total_passif,
            "fonds_propres": fonds_propres,
            "dette_totale": dette_totale,
            "dettes_financieres": dettes_financieres,
            "dettes_non_financieres": dettes_non_financieres,
            "provisions": provisions,
        },
    }


# =============================================================================
# Transformations spécifiques (anciennement build_*)
# =============================================================================

def build_masses(bilan: dict, side: str) -> list:
    central = "Patrimoine Paris"
    if side == "actif":
        links = [l for l in bilan.get("links", []) if l.get("target") == central]
    else:
        links = [l for l in bilan.get("links", []) if l.get("source") == central]
    total = sum(l["value"] for l in links)
    drilldown = bilan.get("drilldown", {}).get(side, {})

    masses = []
    for l in sorted(links, key=lambda x: -x["value"]):
        label = l["source"] if side == "actif" else l["target"]
        meta = MASSE_META.get(label, {"tag": "—", "sub": "", "details": ""})
        subitems = drilldown.get(label, [])
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
    drilldown = bilan.get("drilldown", {}).get("passif", {})
    dettes_items = drilldown.get("Dettes financières", [])
    total = sum(i["value"] for i in dettes_items) or bilan["totals"]["dettes_financieres"]

    instruments = []
    for item in dettes_items:
        name = item.get("name", "")
        meta = INSTRUMENT_META_BY_LABEL.get(name) or {
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


# =============================================================================
# Pipeline principal
# =============================================================================

def export_year(client: bigquery.Client, year: int, logger: Logger) -> Path:
    logger.section(f"Patrimoine structure · exercice {year}")
    rows = fetch_bilan_rows(client, year)
    if not rows:
        logger.warning(f"Aucune donnée bilan pour {year}")
        return None
    bilan = reconstruct_bilan_shape(rows, year)
    total_dette = bilan["totals"]["dettes_financieres"]
    logger.info(f"Dette financière {year} : {total_dette / 1e9:.2f} Md €")

    structure_dette = build_structure_dette(bilan)
    masses_actif = build_masses(bilan, "actif")
    masses_passif = build_masses(bilan, "passif")

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
    parser.add_argument("--year", type=int, help="Exercice à traiter")
    parser.add_argument("--all-years", action="store_true", help="Traiter tous les exercices disponibles")
    parser.add_argument("--city", default="paris")
    args = parser.parse_args()

    global DATA_DIR, MARTS_DATASET
    DATA_DIR = data_dir(args.city)
    MARTS_DATASET = marts_dataset(args.city)

    logger = Logger("export_patrimoine_structure")
    logger.header("Export structure dette + patrimoine")

    client = get_bigquery_client()

    if args.all_years or (not args.year):
        years_q = f"SELECT DISTINCT annee FROM `{PROJECT_ID}.{MARTS_DATASET}.mart_bilan_comptable` ORDER BY annee"
        years = [r["annee"] for r in client.query(years_q).result()]
        if not args.all_years:
            # Default: dernier exercice disponible
            years = [max(years)] if years else []
    else:
        years = [args.year]

    for year in years:
        export_year(client, year, logger)

    logger.success(f"Terminé · {len(years)} exercice(s) traité(s)")


if __name__ == "__main__":
    main()
