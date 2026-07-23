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

-- Agrégation par AP et année (normalement unique mais safety). On choisit UNE
-- ligne représentative (plus gros montant, tie-break déterministe) et on en tire
-- TOUS les attributs — sinon MAX(latitude) et MAX(longitude) indépendants
-- pouvaient fabriquer une coordonnée appartenant à AUCUNE ligne source. Le
-- montant_total reste la somme du groupe (fenêtre SUM).
aggreges AS (
    SELECT
        annee,
        ap_code,
        nom_projet,
        mission,
        direction,
        SUM(montant) OVER (PARTITION BY annee, ap_code) AS montant_total,
        arrondissement,
        latitude,
        longitude,
        adresse,
        type_equipement,
        source_geo,
        confiance_geo
    FROM localises
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY annee, ap_code
        ORDER BY montant DESC, adresse, latitude, longitude
    ) = 1
)

SELECT
    *,
    CURRENT_TIMESTAMP() AS _dbt_updated_at
FROM aggreges
ORDER BY annee DESC, montant_total DESC
