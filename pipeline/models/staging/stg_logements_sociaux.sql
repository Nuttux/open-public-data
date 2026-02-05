-- =============================================================================
-- Staging: Logements sociaux financés à Paris
--
-- Source: logements_sociaux_finances_a_paris
-- Description: Programmes de logements sociaux - DÉJÀ GÉOLOCALISÉS
--
-- Transformations:
--   - Parse geo_point_2d JSON → latitude, longitude
--   - Typage: INT64 pour nombres de logements
--
-- Output: ~4k lignes
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('paris_raw', 'logements_sociaux_finances_a_paris') }}
),

cleaned AS (
    SELECT
        -- =====================================================================
        -- IDENTIFIANTS
        -- =====================================================================
        id_livraison,
        SAFE_CAST(annee AS INT64) AS annee,
        
        -- =====================================================================
        -- LOCALISATION
        -- =====================================================================
        adresse_programme AS adresse,
        code_postal,
        SAFE_CAST(arrdt AS INT64) AS arrondissement,
        
        -- Parse geo_point_2d: {"lon": 2.35, "lat": 48.85} ou "48.85, 2.35"
        CASE
            -- Format JSON
            WHEN geo_point_2d LIKE '%lat%' THEN
                SAFE_CAST(JSON_EXTRACT_SCALAR(geo_point_2d, '$.lat') AS FLOAT64)
            -- Format "lat, lon"
            WHEN geo_point_2d LIKE '%,%' THEN
                SAFE_CAST(SPLIT(geo_point_2d, ',')[OFFSET(0)] AS FLOAT64)
            ELSE NULL
        END AS latitude,
        
        CASE
            -- Format JSON
            WHEN geo_point_2d LIKE '%lon%' THEN
                SAFE_CAST(JSON_EXTRACT_SCALAR(geo_point_2d, '$.lon') AS FLOAT64)
            -- Format "lat, lon"
            WHEN geo_point_2d LIKE '%,%' THEN
                SAFE_CAST(SPLIT(geo_point_2d, ',')[OFFSET(1)] AS FLOAT64)
            ELSE NULL
        END AS longitude,
        
        -- =====================================================================
        -- BAILLEUR
        -- =====================================================================
        bs AS bailleur,
        
        -- =====================================================================
        -- LOGEMENTS
        -- =====================================================================
        SAFE_CAST(nb_logmt_total AS INT64) AS nb_logements,
        SAFE_CAST(nb_plai AS INT64) AS nb_plai,      -- Très social
        SAFE_CAST(nb_plus AS INT64) AS nb_plus,      -- Social
        SAFE_CAST(nb_pluscd AS INT64) AS nb_pluscd,  -- Social CD
        SAFE_CAST(nb_pls AS INT64) AS nb_pls,        -- Intermédiaire
        
        -- =====================================================================
        -- CONTEXTE
        -- =====================================================================
        nature_programme,
        mode_real AS mode_realisation,
        commentaires,
        
        -- =====================================================================
        -- CLÉ TECHNIQUE
        -- =====================================================================
        COALESCE(id_livraison, 
            CONCAT(
                COALESCE(adresse_programme, 'X'), '-',
                COALESCE(bs, 'X'), '-',
                COALESCE(annee, 'XXXX')
            )
        ) AS cle_technique
        
    FROM source
)

SELECT * FROM cleaned
