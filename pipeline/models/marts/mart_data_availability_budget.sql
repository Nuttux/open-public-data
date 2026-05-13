-- =============================================================================
-- Mart: disponibilité dataset budget par année
-- Schéma typé spécifique au dataset budget (vs polymorphe avec NULL).
-- =============================================================================

{{ config(materialized='view', schema='marts', tags=['mart','meta','data_availability']) }}

SELECT
    annee,
    CAST(COUNT(*) AS INT64) AS nb_lignes,
    SUM(montant) AS total_montant
FROM {{ ref('core_budget') }}
GROUP BY annee
ORDER BY annee
