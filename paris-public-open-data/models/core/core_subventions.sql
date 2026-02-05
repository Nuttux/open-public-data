-- =============================================================================
-- Core: Subventions (OBT)
--
-- Source: int_subventions_enrichies
-- Description: Table dénormalisée des subventions avec enrichissements
--
-- Grain: (annee, beneficiaire_normalise, collectivite) ou cle_technique
-- Une ligne = une subvention unique
--
-- NOTE: Pas de géolocalisation - les subventions vont à des organisations, pas des lieux.
-- L'adresse du siège ne reflète pas où l'action est menée.
--
-- Enrichissements:
--   - ode_thematique: Culture, Social, Éducation, etc.
--   - ode_type_organisme: public, association, entreprise, personne_physique, autre
--   - ode_contribution_nature: true si prestations en nature (vs numéraire)
--
-- Output: ~53k lignes, années 2018-2024
-- =============================================================================

SELECT
    -- =====================================================================
    -- COLONNES ORIGINALES
    -- =====================================================================
    annee,
    beneficiaire,
    beneficiaire_normalise,
    categorie,
    nature_juridique,
    montant,
    prestations_nature,
    collectivite,
    donnees_disponibles,
    cle_technique,
    
    -- Depuis jointure associations (pour filtres UI)
    siret,
    direction,
    objet,
    secteurs_activite,
    
    -- =====================================================================
    -- COLONNES ENRICHIES (ode_*)
    -- =====================================================================
    -- Classification thématique
    ode_thematique,
    ode_sous_categorie,
    ode_source_thematique,
    
    -- Segmentation par type d'organisme
    ode_type_organisme,
    
    -- Flag contribution en nature
    ode_contribution_nature,
    
    -- Métadonnées
    CURRENT_TIMESTAMP() AS _dbt_updated_at

FROM {{ ref('int_subventions_enrichies') }}
