-- =============================================================================
-- Core: Logements Sociaux (OBT)
--
-- Source: stg_logements_sociaux
-- Description: Table dénormalisée des logements sociaux (déjà géolocalisés)
--
-- Grain: (id_livraison)
-- Une ligne = un programme de logements unique
--
-- Pas de colonnes ode_* car déjà géolocalisé dans la source
--
-- Output: ~4k lignes
-- =============================================================================

SELECT
    -- =====================================================================
    -- COLONNES (déjà complètes depuis staging)
    -- =====================================================================
    id_livraison,
    annee,
    adresse,
    code_postal,
    arrondissement,
    
    -- =====================================================================
    -- COLONNES ENRICHIES (ode_*)
    -- =====================================================================
    -- Arrondissement pour affichage (1-4 → Paris Centre)
    -- La fusion administrative a eu lieu en 2020, mais pour cohérence
    -- on regroupe toutes les années
    CASE 
        WHEN arrondissement IN (1, 2, 3, 4) THEN 0  -- 0 = Paris Centre
        ELSE arrondissement
    END AS ode_arrondissement_affichage,
    
    -- Label texte pour l'affichage
    CASE 
        WHEN arrondissement IN (1, 2, 3, 4) THEN 'Paris Centre'
        ELSE CONCAT(CAST(arrondissement AS STRING), 'e')
    END AS ode_arrondissement_label,
    
    -- =====================================================================
    -- COLONNES GÉOGRAPHIQUES
    -- =====================================================================
    latitude,
    longitude,
    
    -- =====================================================================
    -- COLONNES MÉTIER
    -- =====================================================================
    bailleur,
    nb_logements,
    nb_plai,
    nb_plus,
    nb_pluscd,
    nb_pls,
    nature_programme,
    mode_realisation,
    commentaires,
    cle_technique,
    
    -- Métadonnées
    CURRENT_TIMESTAMP() AS _dbt_updated_at

FROM {{ ref('stg_logements_sociaux') }}
