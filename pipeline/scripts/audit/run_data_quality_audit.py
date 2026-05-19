#!/usr/bin/env python3
"""
Audit data quality re-jouable.

Reconciliation + completeness + freshness checks sur les tables core / stg /
mart de BigQuery. Résultat écrit en JSON pour consommation frontend
(/methode) et committé pour transparence/audit externe.

Sortie :
    website/public/data/data_quality_audit.json

Exit code :
    0 si aucun fail (warns autorisés)
    1 si au moins un fail

Usage :
    python pipeline/scripts/audit/run_data_quality_audit.py
    python pipeline/scripts/audit/run_data_quality_audit.py --dry-run  # n'écrit pas
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import bigquery

PROJECT_ID = "open-data-france-484717"
DS_STG = "dbt_paris_staging"
DS_CORE = "dbt_paris_analytics"
DS_MARTS = "dbt_paris_marts"

OUTPUT_PATH = (
    Path(__file__).resolve().parents[3]
    / "website"
    / "public"
    / "data"
    / "data_quality_audit.json"
)

# Seuils documentés — toute modification doit être justifiée et trackée
# dans docs/data-quality.md.
THRESHOLDS = {
    "reconciliation_diff_pct": 0.01,  # %
    "uniqueness_dup_pct_warn": 0.5,   # %
    "uniqueness_dup_pct_fail": 2.0,
    "completeness_thematique_subv_warn": 95.0,  # %
    "completeness_thematique_subv_fail": 80.0,
    "completeness_geoloc_ap_warn": 40.0,
    "completeness_geoloc_ap_fail": 20.0,
    "budget_yoy_variation_warn": 20.0,  # %
    "budget_yoy_variation_fail": 35.0,
    "freshness_warn_days": 90,
    "freshness_fail_days": 180,
}


def _row(client: bigquery.Client, sql: str) -> dict:
    return dict(next(iter(client.query(sql).result())))


def _val(client: bigquery.Client, sql: str):
    return next(iter(client.query(sql).result()))[0]


def check_budget_total_reconciliation(client: bigquery.Client) -> dict:
    """Total Budget Principal : core doit refléter staging filtré (sens dépense/recette)."""
    core_total = _val(client, f"SELECT SUM(montant) FROM `{PROJECT_ID}.{DS_CORE}.core_budget`")
    stg_total = _val(
        client,
        f"SELECT SUM(montant) FROM `{PROJECT_ID}.{DS_STG}.stg_budget_principal`",
    )
    diff_pct = abs(core_total - stg_total) / max(abs(stg_total), 1) * 100
    status = "pass" if diff_pct < THRESHOLDS["reconciliation_diff_pct"] else "fail"
    return {
        "id": "budget_total_reconciliation",
        "category": "reconciliation",
        "label": "Budget : total core_budget = stg_budget_principal",
        "status": status,
        "threshold": f"diff < {THRESHOLDS['reconciliation_diff_pct']}%",
        "actual": f"diff = {diff_pct:.4f}%",
        "details": {
            "core_total_eur": round(core_total, 2),
            "stg_total_eur": round(stg_total, 2),
        },
        "sources": [
            f"{DS_CORE}.core_budget",
            f"{DS_STG}.stg_budget_principal",
        ],
    }


def check_subventions_total_reconciliation(client: bigquery.Client) -> dict:
    core_total = _val(client, f"SELECT SUM(montant) FROM `{PROJECT_ID}.{DS_CORE}.core_subventions`")
    stg_total = _val(client, f"SELECT SUM(montant) FROM `{PROJECT_ID}.{DS_STG}.stg_subventions_all`")
    diff_pct = abs(core_total - stg_total) / max(abs(stg_total), 1) * 100
    status = "pass" if diff_pct < THRESHOLDS["reconciliation_diff_pct"] else "fail"
    return {
        "id": "subventions_total_reconciliation",
        "category": "reconciliation",
        "label": "Subventions : total core = staging",
        "status": status,
        "threshold": f"diff < {THRESHOLDS['reconciliation_diff_pct']}%",
        "actual": f"diff = {diff_pct:.4f}%",
        "details": {
            "core_total_eur": round(core_total, 2),
            "stg_total_eur": round(stg_total, 2),
        },
        "sources": [
            f"{DS_CORE}.core_subventions",
            f"{DS_STG}.stg_subventions_all",
        ],
    }


def check_row_counts(client: bigquery.Client) -> dict:
    """Row count parity entre core et staging pour les tables 1:1."""
    pairs = [
        ("core_budget", "stg_budget_principal"),
        ("core_ap_projets", "stg_ap_projets"),
        ("core_logements_sociaux", "stg_logements_sociaux"),
    ]
    rows = []
    has_fail = False
    for core_t, stg_t in pairs:
        c = _val(client, f"SELECT COUNT(*) FROM `{PROJECT_ID}.{DS_CORE}.{core_t}`")
        s = _val(client, f"SELECT COUNT(*) FROM `{PROJECT_ID}.{DS_STG}.{stg_t}`")
        diff = abs(c - s) / max(s, 1) * 100
        ok = diff < THRESHOLDS["reconciliation_diff_pct"]
        if not ok:
            has_fail = True
        rows.append({"core": core_t, "stg": stg_t, "core_rows": c, "stg_rows": s, "diff_pct": round(diff, 4)})
    return {
        "id": "row_count_parity",
        "category": "reconciliation",
        "label": "Row count parity core ↔ staging",
        "status": "fail" if has_fail else "pass",
        "threshold": f"diff < {THRESHOLDS['reconciliation_diff_pct']}% par table",
        "actual": "OK sur 3 tables" if not has_fail else "divergence détectée",
        "details": rows,
        "sources": [f"{DS_CORE}.core_*", f"{DS_STG}.stg_*"],
    }


def check_subventions_classification(client: bigquery.Client) -> dict:
    sql = f"""
    SELECT
      SUM(CASE WHEN ode_thematique IS NULL OR ode_thematique = 'Non classifié' THEN 0 ELSE montant END) AS classified,
      SUM(montant) AS total
    FROM `{PROJECT_ID}.{DS_CORE}.core_subventions`
    """
    row = _row(client, sql)
    pct = row["classified"] / max(row["total"], 1) * 100
    warn = THRESHOLDS["completeness_thematique_subv_warn"]
    fail = THRESHOLDS["completeness_thematique_subv_fail"]
    if pct >= warn:
        status = "pass"
    elif pct >= fail:
        status = "warn"
    else:
        status = "fail"
    return {
        "id": "subventions_thematique_coverage",
        "category": "completeness",
        "label": "Subventions : % montants classifiés par thématique",
        "status": status,
        "threshold": f"pass ≥ {warn}%, warn ≥ {fail}%",
        "actual": f"{pct:.2f}%",
        "details": {
            "classified_eur": round(row["classified"], 2),
            "total_eur": round(row["total"], 2),
        },
        "sources": [f"{DS_CORE}.core_subventions"],
    }


def check_ap_geoloc(client: bigquery.Client) -> dict:
    """Mesure 2 niveaux : arrondissement (gros grain) et lat/lng (point précis)."""
    sql = f"""
    SELECT
      ROUND(SUM(CASE WHEN ode_arrondissement IS NOT NULL THEN montant ELSE 0 END) / SUM(montant) * 100, 2) AS pct_arr,
      ROUND(SUM(CASE WHEN ode_latitude IS NOT NULL THEN montant ELSE 0 END) / SUM(montant) * 100, 2) AS pct_latlng,
      ROUND(SUM(montant), 2) AS total_eur
    FROM `{PROJECT_ID}.{DS_CORE}.core_ap_projets`
    """
    row = _row(client, sql)
    pct_arr = row["pct_arr"] or 0
    warn = THRESHOLDS["completeness_geoloc_ap_warn"]
    fail = THRESHOLDS["completeness_geoloc_ap_fail"]
    if pct_arr >= warn:
        status = "pass"
    elif pct_arr >= fail:
        status = "warn"
    else:
        status = "fail"
    return {
        "id": "ap_geoloc_coverage",
        "category": "completeness",
        "label": "AP Projets : % montants localisés (arrondissement)",
        "status": status,
        "threshold": f"pass ≥ {warn}% (arrondissement), warn ≥ {fail}%",
        "actual": f"{pct_arr:.2f}% arrondissement, {row['pct_latlng']:.2f}% point précis",
        "details": dict(row),
        "sources": [f"{DS_CORE}.core_ap_projets"],
        "note": "Localisation par arrondissement = grain communiqué. Point précis (lat/lng) réservé aux projets mono-site.",
    }


def check_budget_yoy_variation(client: bigquery.Client) -> dict:
    """Variation YoY du total budget annuel (sens 'Dépenses' uniquement) — détection rupture."""
    sql = f"""
    WITH agg AS (
      SELECT annee, SUM(montant) AS total
      FROM `{PROJECT_ID}.{DS_CORE}.core_budget`
      WHERE sens_flux = 'Dépense'
      GROUP BY annee
    ),
    var AS (
      SELECT
        annee,
        total,
        LAG(total) OVER (ORDER BY annee) AS prev_total
      FROM agg
    )
    SELECT
      MAX(ABS(total - prev_total) / NULLIF(prev_total, 0) * 100) AS max_variation_pct,
      ARRAY_AGG(STRUCT(annee, ROUND((total - prev_total) / NULLIF(prev_total, 0) * 100, 2) AS variation_pct) ORDER BY ABS(total - prev_total) / NULLIF(prev_total, 0) DESC LIMIT 3) AS top_changes
    FROM var
    WHERE prev_total IS NOT NULL
    """
    row = _row(client, sql)
    max_var = row["max_variation_pct"] or 0
    warn = THRESHOLDS["budget_yoy_variation_warn"]
    fail = THRESHOLDS["budget_yoy_variation_fail"]
    if max_var < warn:
        status = "pass"
    elif max_var < fail:
        status = "warn"
    else:
        status = "fail"
    return {
        "id": "budget_yoy_variation",
        "category": "anomaly",
        "label": "Budget Dépenses : variation YoY max",
        "status": status,
        "threshold": f"pass < {warn}%, warn < {fail}%",
        "actual": f"max {max_var:.2f}%",
        "details": {"top_changes": [dict(t) for t in row["top_changes"]]},
        "sources": [f"{DS_CORE}.core_budget"],
    }


def _uniqueness_check(client: bigquery.Client, table: str, key: str, ds: str) -> dict:
    sql = f"""
    SELECT
      COUNT(*) AS total_rows,
      COUNT(DISTINCT {key}) AS unique_keys
    FROM `{PROJECT_ID}.{ds}.{table}`
    WHERE {key} IS NOT NULL
    """
    row = _row(client, sql)
    dup_pct = (row["total_rows"] - row["unique_keys"]) / max(row["total_rows"], 1) * 100
    warn = THRESHOLDS["uniqueness_dup_pct_warn"]
    fail = THRESHOLDS["uniqueness_dup_pct_fail"]
    if dup_pct < warn:
        status = "pass"
    elif dup_pct < fail:
        status = "warn"
    else:
        status = "fail"
    return {
        "id": f"uniqueness_{table}_{key}",
        "category": "schema",
        "label": f"Unicité {key} dans {table}",
        "status": status,
        "threshold": f"pass < {warn}% doublons",
        "actual": f"{dup_pct:.4f}% doublons ({row['total_rows'] - row['unique_keys']}/{row['total_rows']})",
        "details": dict(row),
        "sources": [f"{ds}.{table}"],
    }


def check_paris_centre_aggregation(client: bigquery.Client) -> dict:
    """Vérifie que les arrondissements 1-4 sont agrégés en Paris Centre (code 0)."""
    sql = f"""
    SELECT
      COUNTIF(ode_arrondissement_affichage = 0) AS centre_rows,
      COUNTIF(arrondissement BETWEEN 1 AND 4) AS source_rows_1_4
    FROM `{PROJECT_ID}.{DS_CORE}.core_logements_sociaux`
    """
    row = _row(client, sql)
    # Centre rows doivent égaler la somme des sources 1-4
    ok = row["centre_rows"] == row["source_rows_1_4"] and row["centre_rows"] > 0
    return {
        "id": "paris_centre_aggregation",
        "category": "business_rule",
        "label": "Paris Centre : agrégation arrondissements 1-4 → 0",
        "status": "pass" if ok else "fail",
        "threshold": "centre_rows == sum(arr 1-4)",
        "actual": f"{row['centre_rows']} rows en Paris Centre, {row['source_rows_1_4']} rows arr 1-4 source",
        "details": dict(row),
        "sources": [f"{DS_CORE}.core_logements_sociaux"],
    }


def check_casvp_dedup(client: bigquery.Client) -> dict:
    """CASVP doit être dédupliqué via ode_beneficiaire_canonique."""
    sql = f"""
    SELECT
      COUNT(DISTINCT beneficiaire_normalise) AS variants_source,
      COUNT(DISTINCT ode_beneficiaire_canonique) AS variants_canonique,
      SUM(montant) AS total_eur
    FROM `{PROJECT_ID}.{DS_CORE}.core_subventions`
    WHERE LOWER(beneficiaire_normalise) LIKE '%casvp%'
       OR LOWER(ode_beneficiaire_canonique) = 'casvp'
    """
    row = _row(client, sql)
    ok = (row["variants_canonique"] or 0) <= 1 and (row["variants_source"] or 0) >= 1
    return {
        "id": "casvp_dedup",
        "category": "business_rule",
        "label": "CASVP : variantes de nom dédupliquées en 1 entité canonique",
        "status": "pass" if ok else "warn",
        "threshold": "variants_canonique <= 1",
        "actual": f"{row['variants_source']} variantes source → {row['variants_canonique']} canonique(s)",
        "details": {
            "variants_source": row["variants_source"],
            "variants_canonique": row["variants_canonique"],
            "total_eur": round(row["total_eur"] or 0, 2),
        },
        "sources": [f"{DS_CORE}.core_subventions"],
    }


def check_budget_vote_coverage(client: bigquery.Client) -> dict:
    """core_budget_vote couvre 2023-2026, totaux non-nuls."""
    sql = f"""
    SELECT
      annee,
      ROUND(SUM(montant), 2) AS total_eur,
      COUNT(*) AS n_rows
    FROM `{PROJECT_ID}.{DS_CORE}.core_budget_vote`
    GROUP BY annee
    ORDER BY annee
    """
    rows = [dict(r) for r in client.query(sql).result()]
    years = [r["annee"] for r in rows]
    expected = {2023, 2024, 2025, 2026}
    missing = expected - set(years)
    has_zero = any((r["total_eur"] or 0) == 0 for r in rows)
    if not missing and not has_zero:
        status = "pass"
    elif missing == {2023} or missing == {2026}:
        status = "warn"
    else:
        status = "fail"
    return {
        "id": "budget_vote_coverage",
        "category": "completeness",
        "label": "core_budget_vote : couverture années 2023-2026",
        "status": status,
        "threshold": "années 2023-2026 toutes présentes, totaux > 0",
        "actual": f"années présentes : {years}",
        "details": {"per_year": rows, "missing": sorted(missing)},
        "sources": [f"{DS_CORE}.core_budget_vote"],
    }


def check_source_max_year(client: bigquery.Client) -> dict:
    """MAX(annee) par dataset source annuel — détecte un dataset upstream gelé.

    C'est le check qui aurait alerté sur l'AP gelé depuis 2022 si on l'avait eu.
    Plus utile que dbt source freshness sur ce projet (les datasets OpenData
    sont annuels et la fraîcheur table = fraîcheur de notre sync, pas de la
    source).
    """
    from datetime import date
    current_year = date.today().year
    sources = [
        ("comptes_administratifs_budgets_principaux_a_partir_de_2019_m57_ville_departement", "exercice_comptable"),
        ("comptes_administratifs_autorisations_de_programmes_a_partir_de_2018_m57_ville_de", "exercice_comptable"),
        ("subventions_versees_annexe_compte_administratif_a_partir_de_2018", "publication"),
        ("subventions_associations_votees", "annee_budgetaire"),
        ("logements_sociaux_finances_a_paris", "annee"),
        ("budgets_votes_principaux_a_partir_de_2019_m57_ville_departement", "exercice_comptable"),
        ("liste_des_marches_de_la_collectivite_parisienne", "annee_de_notification"),
        ("bilan_comptable", "exercice_comptable"),
    ]
    rows = []
    max_gap = 0
    errors = []
    for table, col in sources:
        col_q = f"`{col}`" if " " in col else col
        sql = f"""
        SELECT MAX(CAST(REGEXP_EXTRACT(CAST({col_q} AS STRING), r'(\\d{{4}})') AS INT64)) AS max_year
        FROM `{PROJECT_ID}.raw.{table}`
        """
        try:
            max_year = _val(client, sql) or 0
        except Exception as e:  # noqa: BLE001
            errors.append({"table": table, "error": f"{type(e).__name__}: {e}"})
            continue
        gap = current_year - max_year
        rows.append({"table": table, "max_year": max_year, "gap_years": gap})
        max_gap = max(max_gap, gap)

    # Seuils :
    # - pass : tous les datasets ≤ 2 ans de gap (CA N publié en juin N+1, donc 1-2 normal)
    # - warn : au moins un dataset gelé (gap ≥ 3 ans) — surface la limitation pour
    #   transparence ; le frontend doit confirmer que l'écart est documenté
    #   (cf. data-quality.md). C'est volontairement non-bloquant car certains
    #   datasets gelés sont compensés par d'autres sources (PDFs).
    # - fail : erreur SQL (config audit cassée)
    if errors:
        status = "fail"
    elif max_gap <= 2:
        status = "pass"
    else:
        status = "warn"
    return {
        "id": "source_max_year_coverage",
        "category": "freshness",
        "label": "Sources upstream : MAX(annee) vs année courante",
        "status": status,
        "threshold": f"pass ≤ 2 ans, warn ≤ 3 ans (année courante : {current_year})",
        "actual": f"gap max : {max_gap} an(s)" + (f", {len(errors)} erreur(s)" if errors else ""),
        "details": {"per_source": rows, "errors": errors},
        "sources": [f"raw.{t}" for t, _ in sources],
        "note": "Détection d'un dataset OpenData gelé : si MAX(annee) ne progresse plus, l'upstream a cessé de publier (ex: AP gelé à 2022).",
    }


def check_partial_year_detection(client: bigquery.Client) -> dict:
    """Détecte l'arrivée d'une année *partielle* dans les sources annuelles.

    Concrètement : pour chaque dataset annuel, on compare le row count de
    MAX(annee) à la médiane des 3 années précédentes complètes. Si la
    dernière année a < 60% de la médiane → flag potentielle année partielle
    (la Ville a probablement commencé à publier mais pas encore terminé
    pour cette année fiscale).

    Pourquoi 60% : pour le budget CA Paris, les volumes annuels sont stables
    à ±5% YoY ; un drop > 40% n'est pas du bruit normal, c'est soit un
    changement de périmètre soit une publication en cours.
    """
    sources = [
        ("comptes_administratifs_budgets_principaux_a_partir_de_2019_m57_ville_departement", "exercice_comptable"),
        ("subventions_versees_annexe_compte_administratif_a_partir_de_2018", "publication"),
        ("subventions_associations_votees", "annee_budgetaire"),
        ("logements_sociaux_finances_a_paris", "annee"),
        ("liste_des_marches_de_la_collectivite_parisienne", "annee_de_notification"),
        ("bilan_comptable", "exercice_comptable"),
    ]
    rows = []
    flagged = []
    for table, col in sources:
        col_q = f"`{col}`" if " " in col else col
        sql = f"""
        WITH years AS (
          SELECT
            CAST(REGEXP_EXTRACT(CAST({col_q} AS STRING), r'(\\d{{4}})') AS INT64) AS y,
            COUNT(*) AS n_rows
          FROM `{PROJECT_ID}.raw.{table}`
          WHERE {col_q} IS NOT NULL
          GROUP BY y
          HAVING y IS NOT NULL
        ),
        ranked AS (
          SELECT y, n_rows, ROW_NUMBER() OVER (ORDER BY y DESC) AS rk
          FROM years
        )
        SELECT
          MAX(IF(rk = 1, y, NULL)) AS max_year,
          MAX(IF(rk = 1, n_rows, NULL)) AS max_year_rows,
          APPROX_QUANTILES(IF(rk BETWEEN 2 AND 4, n_rows, NULL) IGNORE NULLS, 2)[OFFSET(1)] AS median_prev_rows,
          ARRAY_AGG(STRUCT(y, n_rows) ORDER BY y DESC LIMIT 5) AS recent
        FROM ranked
        """
        try:
            row = _row(client, sql)
        except Exception as e:  # noqa: BLE001
            rows.append({"table": table, "error": str(e)[:120]})
            continue
        max_year = row["max_year"]
        cur = row["max_year_rows"] or 0
        median_prev = row["median_prev_rows"] or 0
        recent = [dict(r) for r in row["recent"]]
        ratio = (cur / median_prev) if median_prev else None
        is_partial = ratio is not None and ratio < 0.6
        rows.append({
            "table": table,
            "max_year": max_year,
            "max_year_rows": cur,
            "median_prev_rows": median_prev,
            "ratio_vs_median": round(ratio, 3) if ratio is not None else None,
            "suspected_partial": is_partial,
            "recent_years": recent,
        })
        if is_partial:
            flagged.append(f"{table}: année {max_year} a {cur} lignes ({round(ratio*100)}% de la médiane des 3 années précédentes)")

    if flagged:
        status = "warn"
    else:
        status = "pass"
    return {
        "id": "partial_year_detection",
        "category": "freshness",
        "label": "Détection année partielle (row count vs médiane historique)",
        "status": status,
        "threshold": "warn si dernière année < 60% de la médiane des 3 années précédentes",
        "actual": f"{len(flagged)} dataset(s) avec dernière année suspecte" if flagged else "aucune année partielle détectée",
        "details": {"per_source": rows, "flagged": flagged},
        "sources": [f"raw.{t}" for t, _ in sources],
        "note": "Détection conservative : un drop > 40% YoY signale une publication en cours. À confirmer avant exposition publique (la dbt mart peut filtrer cette année si confirmé partiel).",
    }


def check_table_freshness_bq(client: bigquery.Client) -> dict:
    """INFORMATION_SCHEMA : quand nos tables raw ont-elles été touchées par sync_opendata ?

    Complémentaire à check_source_max_year : ce check détecte un sync cassé,
    pas un upstream gelé. Les deux ensemble = couverture complète.
    """
    sql = f"""
    SELECT
      table_id,
      TIMESTAMP_MILLIS(last_modified_time) AS last_mod,
      TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), TIMESTAMP_MILLIS(last_modified_time), DAY) AS age_days
    FROM `{PROJECT_ID}.raw.__TABLES__`
    WHERE table_id IN (
      'comptes_administratifs_budgets_principaux_a_partir_de_2019_m57_ville_departement',
      'comptes_administratifs_autorisations_de_programmes_a_partir_de_2018_m57_ville_de',
      'subventions_versees_annexe_compte_administratif_a_partir_de_2018',
      'subventions_associations_votees',
      'logements_sociaux_finances_a_paris',
      'budgets_votes_principaux_a_partir_de_2019_m57_ville_departement',
      'liste_des_marches_de_la_collectivite_parisienne',
      'bilan_comptable'
    )
    ORDER BY age_days DESC
    """
    rows = [dict(r) for r in client.query(sql).result()]
    # Convert timestamp to ISO string for JSON
    for r in rows:
        r["last_mod"] = r["last_mod"].isoformat() if r["last_mod"] else None
    max_age = max((r["age_days"] or 0) for r in rows) if rows else 0
    # Seuils larges : les datasets OpenData sont annuels, un sync mensuel suffit.
    if max_age < 35:
        status = "pass"
    elif max_age < 90:
        status = "warn"
    else:
        status = "fail"
    return {
        "id": "raw_table_freshness",
        "category": "freshness",
        "label": "Tables raw : âge du dernier sync OpenData → BigQuery",
        "status": status,
        "threshold": "pass < 35j, warn < 90j",
        "actual": f"max {max_age}j",
        "details": rows,
        "sources": [f"{PROJECT_ID}.raw.*"],
        "note": "Mesure quand sync_opendata.py a touché la table pour la dernière fois (≠ fraîcheur upstream OpenData).",
    }


def check_freshness(client: bigquery.Client) -> dict:
    """Âge max des tables core (via _dbt_updated_at)."""
    tables = [
        "core_budget",
        "core_budget_vote",
        "core_subventions",
        "core_ap_projets",
        "core_logements_sociaux",
    ]
    rows = []
    max_age = 0
    for t in tables:
        sql = f"""
        SELECT TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(_dbt_updated_at), DAY) AS age_days,
               FORMAT_TIMESTAMP('%Y-%m-%d', MAX(_dbt_updated_at)) AS last_run
        FROM `{PROJECT_ID}.{DS_CORE}.{t}`
        """
        r = _row(client, sql)
        rows.append({"table": t, "age_days": r["age_days"], "last_run": r["last_run"]})
        max_age = max(max_age, r["age_days"] or 0)
    warn = THRESHOLDS["freshness_warn_days"]
    fail = THRESHOLDS["freshness_fail_days"]
    if max_age < warn:
        status = "pass"
    elif max_age < fail:
        status = "warn"
    else:
        status = "fail"
    return {
        "id": "core_freshness",
        "category": "freshness",
        "label": "Fraîcheur tables core (dernier dbt run)",
        "status": status,
        "threshold": f"pass < {warn}j, warn < {fail}j",
        "actual": f"max {max_age}j",
        "details": rows,
        "sources": [f"{DS_CORE}.core_*"],
    }


def check_subventions_2020_2021_warning(client: bigquery.Client) -> dict:
    """Sanity : limitation documentée 2020-2021 absentes du core."""
    sql = f"""
    SELECT
      annee,
      COUNT(*) AS n_rows
    FROM `{PROJECT_ID}.{DS_CORE}.core_subventions`
    WHERE annee BETWEEN 2019 AND 2022
    GROUP BY annee
    ORDER BY annee
    """
    rows = [dict(r) for r in client.query(sql).result()]
    years_present = {r["annee"] for r in rows}
    missing = sorted({2020, 2021} - years_present)
    has_known_gap = bool(missing)
    return {
        "id": "subventions_2020_2021_known_gap",
        "category": "known_limitation",
        "label": "Subventions 2020-2021 : années absentes (source dégradée)",
        "status": "warn" if has_known_gap else "pass",
        "threshold": "limitation source OpenData Paris documentée",
        "actual": f"années manquantes : {missing}" if missing else "couverture complète",
        "details": {"per_year": rows, "missing": missing},
        "sources": [f"{DS_CORE}.core_subventions"],
        "note": "Bénéficiaires non publiés par la Ville pour ces années — années entières filtrées du core. Affichées comme warning dans le frontend.",
    }


def check_ap_2023_2024_gap(client: bigquery.Client) -> dict:
    """Sanity : AP gelé depuis 2022."""
    sql = f"""
    SELECT annee, COUNT(*) AS n_rows
    FROM `{PROJECT_ID}.{DS_CORE}.core_ap_projets`
    WHERE annee BETWEEN 2018 AND 2024
    GROUP BY annee
    ORDER BY annee
    """
    rows = [dict(r) for r in client.query(sql).result()]
    years_present = {r["annee"] for r in rows}
    missing_recent = sorted({2023, 2024} - years_present)
    return {
        "id": "ap_2023_2024_known_gap",
        "category": "known_limitation",
        "label": "AP Projets : dataset OpenData gelé depuis 2022",
        "status": "warn" if missing_recent else "pass",
        "threshold": "limitation source documentée",
        "actual": f"années manquantes : {missing_recent}",
        "details": rows,
        "sources": [f"{DS_CORE}.core_ap_projets"],
        "note": "Dataset OpenData Paris non mis à jour depuis 2019-11-28. Complété par PDF Investissements Localisés (couverture partielle).",
    }


CHECKS = [
    check_budget_total_reconciliation,
    check_subventions_total_reconciliation,
    check_row_counts,
    check_subventions_classification,
    check_ap_geoloc,
    check_budget_yoy_variation,
    lambda c: _uniqueness_check(c, "core_budget", "cle_technique", DS_CORE),
    lambda c: _uniqueness_check(c, "core_subventions", "cle_technique", DS_CORE),
    lambda c: _uniqueness_check(c, "core_ap_projets", "cle_technique", DS_CORE),
    lambda c: _uniqueness_check(c, "core_logements_sociaux", "cle_technique", DS_CORE),
    check_paris_centre_aggregation,
    check_casvp_dedup,
    check_budget_vote_coverage,
    check_source_max_year,
    check_partial_year_detection,
    check_table_freshness_bq,
    check_freshness,
    check_subventions_2020_2021_warning,
    check_ap_2023_2024_gap,
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="N'écrit pas le JSON")
    parser.add_argument("--output", default=str(OUTPUT_PATH))
    args = parser.parse_args()

    client = bigquery.Client(project=PROJECT_ID)

    results = []
    for fn in CHECKS:
        try:
            results.append(fn(client))
        except Exception as e:  # noqa: BLE001
            results.append({
                "id": getattr(fn, "__name__", "unknown"),
                "category": "error",
                "label": "Check failed to execute",
                "status": "fail",
                "actual": f"{type(e).__name__}: {e}",
            })

    summary = {"total": len(results), "pass": 0, "warn": 0, "fail": 0}
    for r in results:
        summary[r["status"]] = summary.get(r["status"], 0) + 1

    output = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "project": PROJECT_ID,
        "summary": summary,
        "thresholds": THRESHOLDS,
        "checks": results,
    }

    if not args.dry_run:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")

    print(json.dumps(summary, indent=2))
    print("---")
    for r in results:
        icon = {"pass": "✓", "warn": "⚠", "fail": "✗"}.get(r["status"], "?")
        print(f"  {icon} [{r['category']}] {r['label']} — {r.get('actual', '')}")

    return 0 if summary["fail"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
