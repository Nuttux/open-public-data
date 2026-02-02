-- Modèle intermédiaire : Budget de la mairie centrale (Ville + Département)
-- 
-- CONTEXTE : Les données du budget central sont disponibles à partir de 2019
-- avec la norme comptable M57. Ce modèle prépare les données pour la consolidation.
--
-- RÈGLE 6B : On exclut les dotations versées aux arrondissements (nature 74872)
-- pour éviter le double comptage lors de la consolidation avec le budget local.

WITH source AS (
    SELECT * FROM {{ ref('stg_budget_mairie_centrale') }}
),

-- Filtrage temporel : uniquement les années M57 (2019+)
-- et exclusion des dotations aux arrondissements
filtered AS (
    SELECT *
    FROM source
    WHERE annee >= 2019
      AND nature_code != '74872'  -- Dotations aux mairies d'arrondissement
)

SELECT * FROM filtered
