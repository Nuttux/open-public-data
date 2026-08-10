-- =============================================================================
-- Mart: disponibilité dataset AP projets par année
-- =============================================================================

{{ config(materialized='view', schema='marts', tags=['mart','meta','data_availability']) }}

SELECT
    annee,
    CAST(COUNT(*) AS INT64) AS nb_projets,
    CAST(COUNTIF(ode_arrondissement IS NOT NULL) AS INT64) AS nb_geolocalises,
    SUM(montant) AS total_montant
FROM {{ ref('core_ap_projets') }}
GROUP BY annee
ORDER BY annee
