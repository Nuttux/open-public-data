-- =============================================================================
-- Core: AP Projets (OBT)
--
-- Source: int_ap_projets_enrichis
-- Description: Table dénormalisée des projets AP avec tous les enrichissements
--
-- Grain: (annee, ap_code)
-- Une ligne = un projet AP unique
--
-- Colonnes ode_* proviennent de l'enrichissement intermediate
--
-- Output: ~7k lignes, années 2018-2022
-- =============================================================================

SELECT
    -- =====================================================================
    -- COLONNES ORIGINALES
    -- =====================================================================
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
    ode_arrondissement,
    ode_adresse,
    ode_latitude,
    ode_longitude,
    ode_type_equipement,
    ode_nom_lieu,
    ode_source_geo,
    ode_confiance,
    
    -- Métadonnées
    CURRENT_TIMESTAMP() AS _dbt_updated_at

FROM {{ ref('int_ap_projets_enrichis') }}
