-- =============================================================================
-- Mart: disponibilité dataset logements sociaux par année
-- =============================================================================

{{ config(materialized='view', schema='marts', tags=['mart','meta','data_availability']) }}

SELECT
    annee,
    CAST(COUNT(*) AS INT64) AS nb_operations,
    CAST(SUM(nb_logements) AS INT64) AS total_logements,
    CAST(COUNTIF(latitude IS NOT NULL) AS INT64) AS nb_geolocalises
FROM {{ ref('core_logements_sociaux') }}
WHERE annee IS NOT NULL
GROUP BY annee
ORDER BY annee
