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
    latitude,
    longitude,
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
