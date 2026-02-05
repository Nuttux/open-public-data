-- =============================================================================
-- MART: Carte Investissements (AP)
-- 
-- Vue optimisée pour la carte des investissements (page /carte).
-- Filtre uniquement les projets localisés (arrondissement ou coords).
--
-- Grain: (annee, ap_code)
-- =============================================================================

WITH projets AS (
    SELECT *
    FROM {{ ref('core_ap_projets') }}
),

-- Filtre les projets avec localisation (au moins arrondissement)
localises AS (
    SELECT
        annee,
        ap_code,
        ap_texte AS nom_projet,
        mission_libelle AS mission,
        direction,
        montant,
        ode_arrondissement AS arrondissement,
        ode_latitude AS latitude,
        ode_longitude AS longitude,
        ode_adresse AS adresse,
        ode_type_equipement AS type_equipement,
        ode_source_geo AS source_geo,
        ode_confiance AS confiance_geo
    FROM projets
    WHERE ode_arrondissement IS NOT NULL
      AND montant > 0
),

-- Agrégation par AP et année (normalement unique mais safety)
aggreges AS (
    SELECT
        annee,
        ap_code,
        MAX(nom_projet) AS nom_projet,
        MAX(mission) AS mission,
        MAX(direction) AS direction,
        SUM(montant) AS montant_total,
        MAX(arrondissement) AS arrondissement,
        MAX(latitude) AS latitude,
        MAX(longitude) AS longitude,
        MAX(adresse) AS adresse,
        MAX(type_equipement) AS type_equipement,
        MAX(source_geo) AS source_geo,
        MAX(confiance_geo) AS confiance_geo
    FROM localises
    GROUP BY annee, ap_code
)

SELECT
    *,
    CURRENT_TIMESTAMP() AS _dbt_updated_at
FROM aggreges
ORDER BY annee DESC, montant_total DESC
