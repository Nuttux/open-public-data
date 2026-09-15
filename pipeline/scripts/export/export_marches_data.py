#!/usr/bin/env python3
"""
Script d'export des données marchés publics depuis BigQuery vers JSON.

Exporte les données depuis les marts dbt pour le website:
- marches-publics/index.json : Index des années disponibles et métadonnées filtres
- marches-publics/marches_{year}.json : Liste des marchés pour une année
- marches-publics/marches_tendances.json : Données tendances multi-dimensions

⚠️ Les montants sont des ENVELOPPES PLURIANNUELLES (plafonds contractuels),
   pas des dépenses annuelles. Le wording dans les JSON reflète cela.

Usage:
    python scripts/export_marches_data.py [--year 2024]

Prérequis:
    - Google Cloud credentials configurées
    - Tables dbt existantes (dbt run --select marts)
"""

import json
import argparse
from pathlib import Path
from datetime import datetime
from google.cloud import bigquery

import sys
sys.path.insert(0, str(Path(__file__).parent))
from _export_common import get_bigquery_client, data_dir, marts_dataset

# Configuration
PROJECT_ID = "open-data-france-484717"
DATASET = marts_dataset()
OUTPUT_DIR = data_dir() / "marches-publics"

# Top N catégories à garder (le reste → "Autres")
TOP_CATEGORIES = 12


def _float_or_none(v):
    return float(v) if v is not None else None


# ── Un même contrat publié par deux sources compte une fois ──────────────────
# Constaté le 2026-09-15 sur Paris 2024, l'exercice où la liste de la Ville
# (lots attribués, titulaire nommé) et la DECP (accords-cadres, souvent
# « multi-attributaire ») se recouvrent : 12 paires, 433 M€ comptés deux fois
# sur 3,18 Md€. Les numéros diffèrent (« 20242024T00109 » côté Ville,
# « decp-2024T00118 » côté DECP), donc la fusion par numéro ne les voit pas.
# Même règle que website/src/lib/marches-dedup.ts (le site l'applique aussi
# à la lecture, en filet) : une ligne DECP tombe quand une ligne de la Ville,
# pas encore appariée, porte le même montant maximum, la même date de
# notification (au jour) et au moins un mot significatif commun dans l'objet.
# Appariement un pour un : trois lots de 60 M€ signés le même jour côté Ville
# absorbent au plus trois lignes DECP.
import re
import unicodedata

DEDUP_MIN_AMOUNT = 100_000


def _tokens(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return {w for w in re.split(r"[^a-z]+", s) if len(w) >= 5}


def _is_decp(r):
    return r.get("_source_origin") == "decp" or str(r.get("numero_marche") or "").startswith("decp-")


def _dedup_key(r):
    return f"{round(float(r.get('montant_max') or 0))}|{str(r.get('date_notification') or '')[:10]}"


def dedup_mixed_sources(rows):
    """Retourne (lignes, nb retirées, montant retiré)."""
    has_list = any(not _is_decp(r) for r in rows)
    has_decp = any(_is_decp(r) for r in rows)
    if not has_list or not has_decp:
        return rows, 0, 0.0
    by_key = {}
    for r in rows:
        if not _is_decp(r):
            by_key.setdefault(_dedup_key(r), []).append(r)
    out, dropped, dropped_amount = [], 0, 0.0
    for r in rows:
        if not _is_decp(r) or float(r.get("montant_max") or 0) < DEDUP_MIN_AMOUNT:
            out.append(r)
            continue
        candidates = by_key.get(_dedup_key(r), [])
        words = _tokens(r.get("objet"))
        i = next((k for k, c in enumerate(candidates) if _tokens(c.get("objet")) & words), -1)
        if i == -1:
            out.append(r)
            continue
        candidates.pop(i)
        dropped += 1
        dropped_amount += float(r.get("montant_max") or 0)
    return out, dropped, dropped_amount


def sum_lots(rows):
    """Somme des plafonds où un lot partagé compte une fois : même objet (casse
    et espaces ignorés) + même montant au centime + au moins deux titulaires
    distincts = un lot, sa première ligne compte (website/src/lib/marches-shape.ts)."""
    def holders(r):
        sirens = [x.replace(" ", "")[:9] for x in str(r.get("fournisseur_siret") or "").split("|") if re.match(r"^\s*\d{9}", x)]
        if sirens:
            return sirens
        name = (r.get("fournisseur_nom") or "").strip().lower()
        return [f"name:{name}"] if name and name not in ("marche multiattributaire", "non précisé", "non precise") else []
    groups = {}
    for i, r in enumerate(rows):
        objet = re.sub(r"\s+", " ", (r.get("objet") or "").strip().lower())
        cents = round(float(r.get("montant_max") or 0) * 100)
        if not objet or cents <= 0:
            continue
        groups.setdefault(f"{cents}|{objet}", []).append(i)
    repeat = [False] * len(rows)
    for idx in groups.values():
        if len(idx) < 2:
            continue
        distinct = {h for i in idx for h in holders(rows[i])}
        if len(distinct) < 2:
            continue
        for k in idx[1:]:
            repeat[k] = True
    return sum(float(r.get("montant_max") or 0) for i, r in enumerate(rows) if not repeat[i])


def fetch_marches(client: bigquery.Client, year: int) -> list:
    """Récupère les marchés depuis mart_marches_fournisseurs pour une année.

    Émet les champs Paris + l'enrichissement DECP (NULL quand pas matché).
    """
    # Tri STABLE. `ORDER BY montant_max DESC` seul laissait BigQuery ranger les
    # ex-æquo (montants ronds, NULL) dans un ordre différent à chaque run :
    # le 2026-09-08, ~6 900 lignes changeaient de place entre deux exports
    # identiques en contenu, et le gate de parité — puis chaque refresh auto —
    # y voyait « un chiffre publié a changé ». Les tie-breakers ci-dessous
    # identifient une ligne de façon unique quelle que soit son origine
    # (numero_marche est NULL côté DECP-only).
    query = f"""
    SELECT *
    FROM `{PROJECT_ID}.{DATASET}.mart_marches_fournisseurs`
    WHERE annee = {year}
    ORDER BY montant_max DESC, numero_marche, fournisseur_siret, date_notification, objet
    """
    results = []
    for row in client.query(query).result():
        rec = {
            # Colonnes Paris (historique, conservées)
            "numero_marche": row.numero_marche,
            "objet": row.objet,
            "nature": row.nature,
            "fournisseur_nom": row.fournisseur_nom,
            "fournisseur_siret": row.fournisseur_siret,
            "montant_min": float(row.montant_min) if row.montant_min else 0,
            "montant_max": float(row.montant_max) if row.montant_max else 0,
            "date_notification": str(row.date_notification) if row.date_notification else None,
            "duree_jours": row.duree_jours,
            "categorie_libelle": row.categorie_libelle,
            "perimetre_financier": row.perimetre_financier,
            "is_multiattributaire": row.is_multiattributaire,

            # Origine ligne (paris | decp)
            "_source_origin": row._source_origin,

            # Enrichissement DECP — affichés dans le drawer
            "decp_ccag": row.decp_ccag,
            "decp_cpv_famille": row.decp_cpv_famille,
            "decp_procedure": row.decp_procedure,
            "decp_montant_notifie": _float_or_none(row.decp_montant_notifie),
            "decp_duree_mois": row.decp_duree_mois,
            "decp_offres_recues": row.decp_offres_recues,
            "decp_lieu_execution_lisible": row.decp_lieu_execution_lisible,
            "decp_titulaires_count": row.decp_titulaires_count,
            "decp_nb_modifications": row.decp_nb_modifications,
            "decp_sous_traitance_declaree": row.decp_sous_traitance_declaree,
            "decp_has_consideration_sociale": row.decp_has_consideration_sociale,
            "decp_has_consideration_environnementale": row.decp_has_consideration_environnementale,
            "ecart_plafond_vs_notifie": _float_or_none(row.ecart_plafond_vs_notifie),
            "afficher_deux_montants": row.afficher_deux_montants,
        }
        results.append(rec)
    return results


def get_available_years(client: bigquery.Client) -> list:
    """Récupère les années disponibles."""
    query = f"""
    SELECT DISTINCT annee
    FROM `{PROJECT_ID}.{DATASET}.mart_marches_par_nature`
    ORDER BY annee DESC
    """
    return [row.annee for row in client.query(query).result()]


def get_filter_options(client: bigquery.Client) -> dict:
    """Récupère les options de filtrage disponibles."""
    # Natures
    natures = []
    query = f"""
    SELECT DISTINCT nature
    FROM `{PROJECT_ID}.{DATASET}.mart_marches_fournisseurs`
    WHERE nature IS NOT NULL
    ORDER BY nature
    """
    for row in client.query(query).result():
        natures.append(row.nature)

    # Top catégories
    categories = []
    query = f"""
    SELECT DISTINCT categorie_libelle, COUNT(*) as cnt
    FROM `{PROJECT_ID}.{DATASET}.mart_marches_fournisseurs`
    WHERE categorie_libelle IS NOT NULL
    GROUP BY categorie_libelle
    ORDER BY cnt DESC
    LIMIT 30
    """
    for row in client.query(query).result():
        categories.append(row.categorie_libelle)

    # Périmètres
    perimetres = []
    query = f"""
    SELECT DISTINCT perimetre_financier, COUNT(*) as cnt
    FROM `{PROJECT_ID}.{DATASET}.mart_marches_fournisseurs`
    WHERE perimetre_financier IS NOT NULL
    GROUP BY perimetre_financier
    ORDER BY cnt DESC
    """
    for row in client.query(query).result():
        perimetres.append(row.perimetre_financier)

    return {
        "natures": natures,
        "categories": categories,
        "perimetres": perimetres,
    }


def export_index(client: bigquery.Client, totals_from_rows: dict | None = None):
    """Exporte l'index des données marchés publics.

    Les totaux par année viennent des lignes exportées quand on les a
    (`totals_from_rows`, un contrat publié par deux sources compté une fois,
    un lot partagé compté une fois) : le site lit les mêmes fichiers et doit
    afficher le même chiffre. Sinon, les marts."""
    print("  Génération de l'index...")

    years = get_available_years(client)
    filters = get_filter_options(client)

    # Totaux par année
    totals_by_year = {}
    query = f"""
    SELECT annee, SUM(nb_marches) as nb, SUM(enveloppe_max_totale) as total
    FROM `{PROJECT_ID}.{DATASET}.mart_marches_par_nature`
    GROUP BY annee
    ORDER BY annee DESC
    """
    for row in client.query(query).result():
        totals_by_year[row.annee] = {
            "nb_marches": row.nb,
            "enveloppe_max_totale": float(row.total),
        }
    for year, t in (totals_from_rows or {}).items():
        totals_by_year[year] = t

    index = {
        "generated_at": datetime.now().isoformat(),
        "source": "dbt marts (mart_marches_par_nature, mart_marches_fournisseurs)",
        "note": "Les montants sont des enveloppes pluriannuelles (plafonds contractuels), pas des dépenses annuelles. Un contrat publié par la liste de la Ville et par la DECP compte une fois.",
        "availableYears": years,
        "totalsByYear": totals_by_year,
        "filters": filters,
    }

    output_file = OUTPUT_DIR / "index.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    print(f"    → {output_file.name}")
    return index


def export_marches_year(client: bigquery.Client, year: int):
    """Exporte les marchés pour une année."""
    print(f"  Marchés {year}...")

    data, dropped, dropped_amount = dedup_mixed_sources(fetch_marches(client, year))
    total = sum_lots(data)

    output = {
        "year": year,
        "generated_at": datetime.now().isoformat(),
        "enveloppe_max_totale": total,
        "nb_marches": len(data),
        "note": "montant_max = enveloppe pluriannuelle (plafond contractuel), pas une dépense annuelle. Un lot partagé compte une fois dans le total ; un contrat publié par la liste de la Ville et par la DECP compte une fois.",
        "data": data,
    }
    if dropped:
        output["dedup"] = {"dropped": dropped, "dropped_amount": dropped_amount}

    output_file = OUTPUT_DIR / f"marches_{year}.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    extra = f", {dropped} jumeaux Ville/DECP retirés ({dropped_amount/1e6:.0f}M€)" if dropped else ""
    print(f"    → {output_file.name} ({len(data)} marchés, {total/1e6:.0f}M€ enveloppe{extra})")
    return {"nb_marches": len(data), "enveloppe_max_totale": total}


def export_tendances(client: bigquery.Client, years: list):
    """Exporte les données de tendances multi-dimensions."""
    print("  Tendances multi-dimensions...")

    years_data = []
    for year in sorted(years):
        data = fetch_marches(client, year)

        enveloppe_totale = sum(d["montant_max"] for d in data)
        nb_marches = len(data)

        # Agrégation par nature
        by_nature = {}
        for m in data:
            key = m.get("nature") or "Non renseigné"
            if key not in by_nature:
                by_nature[key] = {"label": key, "montant": 0, "count": 0}
            by_nature[key]["montant"] += m["montant_max"]
            by_nature[key]["count"] += 1

        # Agrégation par catégorie (top N + Autres)
        by_cat_raw = {}
        for m in data:
            key = m.get("categorie_libelle") or "Non renseigné"
            if key not in by_cat_raw:
                by_cat_raw[key] = {"label": key, "montant": 0, "count": 0}
            by_cat_raw[key]["montant"] += m["montant_max"]
            by_cat_raw[key]["count"] += 1

        sorted_cats = sorted(by_cat_raw.values(), key=lambda x: -x["montant"])
        by_categorie = sorted_cats[:TOP_CATEGORIES]
        if len(sorted_cats) > TOP_CATEGORIES:
            autres = {"label": "Autres", "montant": 0, "count": 0}
            for c in sorted_cats[TOP_CATEGORIES:]:
                autres["montant"] += c["montant"]
                autres["count"] += c["count"]
            by_categorie.append(autres)

        # Agrégation par périmètre financier
        by_perimetre = {}
        for m in data:
            key = m.get("perimetre_financier") or "Non renseigné"
            if key not in by_perimetre:
                by_perimetre[key] = {"label": key, "montant": 0, "count": 0}
            by_perimetre[key]["montant"] += m["montant_max"]
            by_perimetre[key]["count"] += 1

        years_data.append({
            "year": year,
            "enveloppe_totale": enveloppe_totale,
            "nb_marches": nb_marches,
            "par_nature": sorted(by_nature.values(), key=lambda x: -x["montant"]),
            "par_categorie": by_categorie,
            "par_perimetre": sorted(by_perimetre.values(), key=lambda x: -x["montant"]),
        })

    output = {
        "generated_at": datetime.now().isoformat(),
        "source": "dbt marts (mart_marches_fournisseurs)",
        "note": "Les montants sont des enveloppes pluriannuelles (plafonds contractuels).",
        "years": years_data,
    }

    output_file = OUTPUT_DIR / "marches_tendances.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"    → {output_file.name} ({len(years_data)} années)")


def main():
    """Point d'entrée principal."""
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from utils.logger import Logger

    parser = argparse.ArgumentParser(description="Export données marchés publics depuis dbt")
    parser.add_argument('--year', type=int, help="Année spécifique (sinon toutes)")
    parser.add_argument('--city', default='paris')
    args = parser.parse_args()

    global OUTPUT_DIR, DATASET
    OUTPUT_DIR = data_dir(args.city) / "marches-publics"
    DATASET = marts_dataset(args.city)

    log = Logger("export_marches")
    log.header("Export Marchés Publics → JSON")

    log.info("Dossier de sortie", extra=str(OUTPUT_DIR))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    log.section("Connexion BigQuery")
    client = get_bigquery_client()
    log.success("Connecté", extra=PROJECT_ID)

    years = [args.year] if args.year else get_available_years(client)

    # Les années d'abord : l'index reprend leurs totaux (dédoublonnés, lots comptés une fois).
    log.section(f"Export des données ({len(years)} années)")
    totals_from_rows = {}
    for i, year in enumerate(years, 1):
        log.progress(i, len(years), f"Année {year}")
        totals_from_rows[year] = export_marches_year(client, year)
        log.success(f"Année {year}")

    log.section("Génération de l'index")
    index = export_index(client, totals_from_rows)
    log.success("Index créé", extra=f"{len(index['availableYears'])} années disponibles")

    log.section("Export des tendances")
    export_tendances(client, years)
    log.success("Tendances", extra="nature + catégorie + périmètre")

    log.summary()


if __name__ == "__main__":
    main()
