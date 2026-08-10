-- =============================================================================
-- MART: Marseille subventions treemap
--
-- Miroir de mart_subventions_treemap (Paris), lit core_marseille_subventions.
-- Grain: (annee, thematique). Consommé par export_subventions_data.py
-- --city marseille --table-prefix marseille_ (alimente filters.thematiques +
-- treemap_{year}.json).
-- =============================================================================

{{ config(materialized='table', schema='marts', tags=['mart', 'subventions', 'marseille']) }}

WITH subventions AS (
    SELECT *
    FROM {{ ref('core_marseille_subventions') }}
    WHERE donnees_disponibles = TRUE
      AND montant > 0
),

par_thematique AS (
    SELECT
        annee,
        ode_thematique AS thematique,
        COUNT(DISTINCT beneficiaire_normalise) AS nb_beneficiaires,
        COUNT(*) AS nb_subventions,
        SUM(montant) AS montant_total
    FROM subventions
    GROUP BY annee, ode_thematique
),

totaux AS (
    SELECT annee, SUM(montant_total) AS total_annuel
    FROM par_thematique
    GROUP BY annee
)

SELECT
    p.annee,
    p.thematique,
    p.nb_beneficiaires,
    p.nb_subventions,
    p.montant_total,
    ROUND(100 * p.montant_total / t.total_annuel, 2) AS pct_total,
    CURRENT_TIMESTAMP() AS _dbt_updated_at
FROM par_thematique p
LEFT JOIN totaux t ON p.annee = t.annee
ORDER BY p.annee DESC, p.montant_total DESC
