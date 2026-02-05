-- =============================================================================
-- Core: Budget Principal (OBT)
--
-- Source: stg_budget_principal + seed_mapping_thematiques
-- Description: Table dénormalisée du budget avec enrichissements thématiques
--
-- Grain: (annee, section, chapitre_code, nature_code, fonction_code, sens_flux)
-- Une ligne = une combinaison budgétaire unique
--
-- Enrichissements (ode_*):
--   - ode_thematique: thématique dashboard basée sur chapitre/fonction
--   - ode_categorie_flux: catégorie de dépense (Personnel, Subventions, etc.)
--
-- Output: ~24k lignes, années 2019-2024
-- =============================================================================

WITH budget AS (
    SELECT * FROM {{ ref('stg_budget_principal') }}
),

mapping_thematiques AS (
    SELECT * FROM {{ ref('seed_mapping_thematiques') }}
),

-- =============================================================================
-- ÉTAPE 1: Trouver LA meilleure thématique pour chaque (chapitre, fonction)
-- Priorité: match fonction_prefix spécifique > match générique (fonction_prefix NULL)
-- =============================================================================
distinct_combos AS (
    SELECT DISTINCT chapitre_code, fonction_code
    FROM budget
),

thematique_matches AS (
    SELECT
        c.chapitre_code,
        c.fonction_code,
        m.thematique,
        m.fonction_prefix,
        ROW_NUMBER() OVER (
            PARTITION BY c.chapitre_code, c.fonction_code
            ORDER BY 
                -- Priorité au match spécifique (fonction_prefix non NULL)
                CASE WHEN m.fonction_prefix IS NOT NULL THEN 0 ELSE 1 END,
                m.fonction_prefix DESC NULLS LAST
        ) AS rn
    FROM distinct_combos c
    INNER JOIN mapping_thematiques m
        ON c.chapitre_code = m.chapitre_code
        AND (m.fonction_prefix IS NULL 
             OR c.fonction_code LIKE CONCAT(m.fonction_prefix, '%'))
),

best_thematique AS (
    SELECT 
        chapitre_code,
        fonction_code,
        thematique AS mapped_thematique
    FROM thematique_matches
    WHERE rn = 1
),

-- =============================================================================
-- ÉTAPE 2: Enrichissement
-- =============================================================================
enriched AS (
    SELECT
        -- =====================================================================
        -- COLONNES ORIGINALES (pas de préfixe)
        -- =====================================================================
        b.annee,
        b.section,
        b.sens_flux,
        b.type_operation,
        b.chapitre_code,
        b.chapitre_libelle,
        b.nature_code,
        b.nature_libelle,
        b.fonction_code,
        b.fonction_libelle,
        b.montant,
        b.cle_technique,
        
        -- =====================================================================
        -- COLONNES ENRICHIES (préfixe ode_)
        -- =====================================================================
        
        -- Thématique dashboard (mapping chapitre → thématique)
        COALESCE(
            bt.mapped_thematique,
            CASE b.chapitre_code
                WHEN '930' THEN 'Administration'
                WHEN '931' THEN 'Sécurité'
                WHEN '932' THEN 'Éducation'
                WHEN '933' THEN 'Culture & Sport'
                WHEN '934' THEN 'Social'
                WHEN '935' THEN 'Urbanisme'
                WHEN '936' THEN 'Économie'
                WHEN '937' THEN 'Environnement'
                WHEN '938' THEN 'Transport'
                WHEN '939' THEN 'Action économique'
                ELSE 'Autre'
            END
        ) AS ode_thematique,
        
        -- Catégorie de flux (basée sur nature comptable)
        CASE
            -- Personnel
            WHEN b.nature_code LIKE '64%' THEN 'Personnel'
            
            -- Subventions
            WHEN b.nature_code LIKE '657%' THEN 'Subventions (fonctionnement)'
            WHEN b.nature_code LIKE '204%' THEN 'Subventions (investissement)'
            
            -- Transferts
            WHEN b.nature_code LIKE '651%' OR b.nature_code LIKE '652%' THEN 'Transferts sociaux'
            WHEN b.nature_code LIKE '655%' OR b.nature_code LIKE '656%' THEN 'Contributions obligatoires'
            
            -- Achats et services
            WHEN b.nature_code LIKE '60%' THEN 'Achats'
            WHEN b.nature_code LIKE '61%' THEN 'Services extérieurs'
            WHEN b.nature_code LIKE '62%' THEN 'Autres services'
            
            -- Charges financières et dette
            WHEN b.nature_code LIKE '66%' THEN 'Charges financières'
            WHEN b.nature_code LIKE '16%' THEN 'Remboursement dette'
            
            -- Dotations
            WHEN b.nature_code LIKE '739%' THEN 'Reversements péréquation'
            WHEN b.nature_code LIKE '748%' THEN 'Dotations arrondissements'
            
            -- Investissements
            WHEN b.nature_code LIKE '21%' THEN 'Immobilisations corporelles'
            WHEN b.nature_code LIKE '23%' THEN 'Immobilisations en cours'
            WHEN b.nature_code LIKE '20%' AND b.nature_code NOT LIKE '204%' THEN 'Études'
            
            -- Recettes
            WHEN b.nature_code LIKE '73%' THEN 'Impôts et taxes'
            WHEN b.nature_code LIKE '74%' THEN 'Dotations et participations'
            WHEN b.nature_code LIKE '75%' THEN 'Autres produits gestion'
            WHEN b.nature_code LIKE '70%' THEN 'Produits services'
            
            ELSE 'Autre'
        END AS ode_categorie_flux,
        
        -- Flag disponibilité subventions pour cette année
        CASE WHEN b.annee IN (2020, 2021) THEN FALSE ELSE TRUE END AS donnees_subv_disponibles,
        
        -- Métadonnées
        CURRENT_TIMESTAMP() AS _dbt_updated_at

    FROM budget b
    LEFT JOIN best_thematique bt
        ON b.chapitre_code = bt.chapitre_code
        AND b.fonction_code = bt.fonction_code
)

SELECT * FROM enriched
