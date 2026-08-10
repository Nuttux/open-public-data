-- =============================================================================
-- Mart: disponibilité dataset subventions par année
-- =============================================================================

{{ config(materialized='view', schema='marts', tags=['mart','meta','data_availability']) }}

SELECT
    annee,
    CAST(COUNT(*) AS INT64) AS nb_subventions,
    CAST(COUNT(DISTINCT beneficiaire) AS INT64) AS nb_beneficiaires,
    SUM(montant) AS total_montant
FROM {{ ref('core_subventions') }}
GROUP BY annee
ORDER BY annee
