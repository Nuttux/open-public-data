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
    
    -- Arrondissement pour affichage (1-4 → Paris Centre)
    CASE 
        WHEN ode_arrondissement IN (1, 2, 3, 4) THEN 0  -- 0 = Paris Centre
        ELSE ode_arrondissement
    END AS ode_arrondissement_affichage,
    
    -- Label texte pour l'affichage
    CASE 
        WHEN ode_arrondissement IN (1, 2, 3, 4) THEN 'Paris Centre'
        WHEN ode_arrondissement IS NOT NULL THEN CONCAT(CAST(ode_arrondissement AS STRING), 'e')
        ELSE NULL
    END AS ode_arrondissement_label,
    
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
