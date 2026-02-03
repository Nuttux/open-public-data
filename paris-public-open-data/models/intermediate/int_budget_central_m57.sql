-- Modèle intermédiaire : Budget de la mairie centrale (Ville + Département)
-- 
-- CONTEXTE : Les données du budget central sont disponibles à partir de 2019
-- avec la norme comptable M57. Ce modèle prépare les données pour l'analyse.

WITH source AS (
    SELECT * FROM {{ ref('stg_budget_mairie_centrale') }}
),

-- Filtrage temporel : uniquement les années M57 (2019+)
filtered AS (
    SELECT *
    FROM source
    WHERE annee >= 2019
)

SELECT * FROM filtered
