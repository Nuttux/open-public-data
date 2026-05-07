-- =============================================================================
-- Core: Tension logement social par arrondissement parisien
--
-- Source: seed_drihl_paris_2024 (XLSX DRIHL annuel)
-- Description: Pour chaque arrondissement (INSEE 75101-75120) + Paris global :
--   - demandes_choix1         : file active au 31/12/YYYY (non doublonnée)
--   - attributions            : attributions réalisées dans l'année YYYY
--   - ratio_dem_attrib        : demandes / attributions
--   - delai_median_mois       : délai médian d'attribution (biais survivant, cf. notes)
--   - part_anciennete_5ans+   : part des demandeurs ayant déposé ≥5 ans (proxy attente)
--
-- Notes méthodo:
--   - Le délai médian d'attribution ne compte QUE les ménages ayant été attribués
--     dans l'année (biais survivant : les demandeurs qui renoncent, déménagent
--     ou restent en file n'y sont pas). Interpréter avec prudence.
--   - Le ratio demandes/attributions = mesure de tension non biaisée.
-- =============================================================================

{{ config(materialized='table', schema='analytics', tags=['core','logement']) }}

WITH drihl_src AS (
    SELECT *
    FROM {{ ref('stg_drihl_paris') }}
),

cleaned AS (
    SELECT
        code_insee,
        nom,
        niveau_geo,
        annee,
        demandes_choix1,
        attributions,
        ratio_dem_attrib,
        delai_median_attribution_mois,
        part_anciennete_5ans_plus,

        -- Arrondissement numérique (NULL pour Paris global / générique)
        CASE
            WHEN SAFE_CAST(code_insee AS INT64) BETWEEN 75101 AND 75120
                THEN SAFE_CAST(code_insee AS INT64) - 75100
            ELSE NULL
        END AS arrondissement,

        -- Flag pour distinguer le total Paris des arrondissements individuels
        CASE
            WHEN code_insee = '75' THEN 'paris_total'
            WHEN code_insee = '75056' THEN 'paris_non_precise'
            WHEN SAFE_CAST(code_insee AS INT64) BETWEEN 75101 AND 75120
                THEN 'arrondissement'
            ELSE 'autre'
        END AS scope,

        source,
        source_url
    FROM drihl_src
),

-- Rang de tension (1 = plus tendu) parmi les 20 arrondissements
ranked AS (
    SELECT
        *,
        CASE WHEN scope = 'arrondissement'
             THEN ROW_NUMBER() OVER (
                 PARTITION BY CASE WHEN scope = 'arrondissement' THEN 1 ELSE 0 END
                 ORDER BY ratio_dem_attrib DESC NULLS LAST
             )
             ELSE NULL
        END AS rang_tension
    FROM cleaned
)

SELECT * FROM ranked
