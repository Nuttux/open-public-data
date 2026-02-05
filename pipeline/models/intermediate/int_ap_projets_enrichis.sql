-- =============================================================================
-- Intermediate: AP Projets enrichis
--
-- Sources: stg_ap_projets + seeds
-- Description: Enrichit les projets AP avec géolocalisation et type d'équipement
--
-- Enrichissements (colonnes ode_*):
--   1. Arrondissement regex (déjà extrait en staging)
--   2. Lieux connus (seed_lieux_connus)
--   3. Cache LLM géoloc (seed_cache_geo_ap)
--   4. Type d'équipement (regex sur texte)
--
-- Cascade géoloc: regex → lieu_connu → cache_llm
--
-- Output: ~7k lignes enrichies
-- =============================================================================

WITH projets AS (
    SELECT * FROM {{ ref('stg_ap_projets') }}
),

-- Seeds
lieux_connus AS (
    SELECT * FROM {{ ref('seed_lieux_connus') }}
),

cache_geo AS (
    SELECT * FROM {{ ref('seed_cache_geo_ap') }}
),

-- =============================================================================
-- ÉTAPE 1: Match avec lieux connus
-- =============================================================================
with_lieux AS (
    SELECT
        p.*,
        l.adresse AS adresse_lieu,
        l.arrondissement AS arrondissement_lieu,
        l.latitude AS lat_lieu,
        l.longitude AS lng_lieu,
        l.nom_complet AS nom_lieu
    FROM projets p
    LEFT JOIN lieux_connus l
        ON REGEXP_CONTAINS(UPPER(p.ap_texte), UPPER(l.pattern_match))
),

-- =============================================================================
-- ÉTAPE 2: Match avec cache LLM
-- =============================================================================
with_cache AS (
    SELECT
        w.*,
        c.ode_adresse AS adresse_cache,
        c.ode_arrondissement AS arrondissement_cache,
        c.ode_latitude AS lat_cache,
        c.ode_longitude AS lng_cache,
        c.ode_confiance AS confiance_cache
    FROM with_lieux w
    LEFT JOIN cache_geo c ON w.ap_code = c.ap_code
),

-- =============================================================================
-- ÉTAPE 3: Type d'équipement (regex sur texte AP)
-- =============================================================================
with_type AS (
    SELECT
        *,
        CASE
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'PISCINE|BASSIN|AQUA') THEN 'piscine'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'GYMNASE|SPORT|STADE|TERRAIN') THEN 'equipement_sportif'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'ECOLE|COLLEGE|LYCEE|SCOLAIRE') THEN 'etablissement_scolaire'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'CRECHE|PETITE.ENFANCE|MULTI.ACCUEIL') THEN 'petite_enfance'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'PARC|JARDIN|SQUARE|ESPACE.VERT') THEN 'espace_vert'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'MUSEE|BIBLIOTHEQUE|THEATRE|CONSERVATOIRE') THEN 'equipement_culturel'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'VOIRIE|CHAUSSEE|TROTTOIR|PISTE.CYCLABLE') THEN 'voirie'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'LOGEMENT|HLM|SOCIAL') THEN 'logement'
            WHEN REGEXP_CONTAINS(UPPER(ap_texte), r'MAIRIE|ADMINISTRATIF|HOTEL.DE.VILLE') THEN 'batiment_administratif'
            ELSE NULL
        END AS type_equipement_regex
    FROM with_cache
),

-- =============================================================================
-- ÉTAPE 4: Consolidation finale (cascade)
-- =============================================================================
final AS (
    SELECT
        -- Colonnes originales
        annee,
        section,
        sens_flux,
        type_operation,
        mission_code,
        mission_libelle,
        direction_code,
        direction,
        ap_code,
        ap_texte,
        nature_code,
        fonction_code,
        montant,
        cle_technique,
        
        -- =====================================================================
        -- COLONNES ENRICHIES (ode_*)
        -- =====================================================================
        
        -- Arrondissement : cascade (regex → lieu_connu → cache_llm)
        COALESCE(
            arrondissement_regex,
            arrondissement_lieu,
            arrondissement_cache
        ) AS ode_arrondissement,
        
        -- Adresse
        COALESCE(adresse_lieu, adresse_cache) AS ode_adresse,
        
        -- Coordonnées
        COALESCE(lat_lieu, lat_cache) AS ode_latitude,
        COALESCE(lng_lieu, lng_cache) AS ode_longitude,
        
        -- Type d'équipement
        type_equipement_regex AS ode_type_equipement,
        
        -- Nom lieu connu (si matché)
        nom_lieu AS ode_nom_lieu,
        
        -- Source de la géolocalisation
        CASE
            WHEN arrondissement_regex IS NOT NULL THEN 'regex'
            WHEN arrondissement_lieu IS NOT NULL THEN 'lieu_connu'
            WHEN arrondissement_cache IS NOT NULL THEN 'llm'
            ELSE NULL
        END AS ode_source_geo,
        
        -- Confiance (1.0 pour regex/lieu, variable pour LLM)
        CASE
            WHEN arrondissement_regex IS NOT NULL THEN 1.0
            WHEN arrondissement_lieu IS NOT NULL THEN 0.95
            WHEN confiance_cache IS NOT NULL THEN confiance_cache
            ELSE NULL
        END AS ode_confiance
        
    FROM with_type
)

SELECT * FROM final
