-- Modèle intermédiaire : Budget des arrondissements filtré pour la période M57
-- 
-- CONTEXTE : Le budget de la mairie centrale n'est disponible qu'à partir de 2019
-- avec la norme comptable M57. Pour avoir une vue consolidée cohérente,
-- on filtre les données des arrondissements à la même période.
--
-- TODO FUTUR : Créer un mapping entre l'ancienne norme et M57 pour inclure
-- les années antérieures à 2019.

WITH source AS (
    SELECT * FROM {{ ref('stg_budget_arrondissements') }}
),

-- Filtrage temporel : uniquement les années où on a aussi le budget central (M57)
filtered AS (
    SELECT *
    FROM source
    WHERE annee >= 2019
)

SELECT * FROM filtered
