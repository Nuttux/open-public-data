-- =============================================================================
-- Staging: Budget Voté (Budget Primitif)
--
-- Source: budgets_votes_principaux_a_partir_de_2019_m57_ville_departement
-- Description: Budget PRÉVISIONNEL voté par le Conseil de Paris
--              Entité SÉPARÉE du budget exécuté (CA).
--
-- DIFFÉRENCES avec stg_budget_principal:
--   - Colonne montant = budget_vote_pmt (pas mandate_titre_apres_regul)
--   - Filtre etape_budgetaire = 'Budget Primitif' (exclut Budget Suppl.)
--   - Colonnes source différentes (voir mapping ci-dessous)
--   - Couverture: 2019-2021 (dataset stale sur OpenData Paris)
--
-- MAPPING COLONNES (BV → standardisé):
--   groupe_d_autorisation_i_f               → section (déjà en clair)
--   etape_budgetaire                        → filtré sur 'Budget Primitif'
--   chapitre_niveau_vote_cle_non_composee   → chapitre_code
--   chapitre_niveau_vote_texte              → chapitre_libelle
--   nature_reglementaire_cle_non_composee   → nature_code
--   nature_reglementaire_texte              → nature_libelle
--   rubrique_reglementaire_cle              → fonction_code
--   rubrique_reglementaire_texte            → fonction_libelle
--   budget_vote_pmt                         → montant
--
-- Transformations:
--   - Filtre: type_operation = 'Réel' (exclut 'Pour Ordre')
--   - Filtre: etape_budgetaire = 'Budget Primitif' (exclut Budget Suppl.)
--   - Filtre: montant > 0 et non NULL
--   - Typage: FLOAT64 pour montants (source = integer)
--   - Renommage: colonnes standardisées pour compatibilité avec core_budget_vote
--
-- Output: ~3-4k lignes (après filtres), années 2019-2021
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('paris_raw', 'budgets_votes_principaux_a_partir_de_2019_m57_ville_departement') }}
),

cleaned AS (
    SELECT
        -- =====================================================================
        -- IDENTIFIANTS (standardisés comme stg_budget_principal)
        -- =====================================================================
        
        -- Année : format texte "2020" dans la source
        SAFE_CAST(exercice_comptable AS INT64) AS annee,
        
        -- Section : déjà en clair dans le BV ("Fonctionnement", "Investissement")
        groupe_d_autorisation_i_f AS section,
        
        -- Sens du flux (même nettoyage que CA)
        CASE 
            WHEN UPPER(sens_depense_recette) LIKE '%DÉPENSE%' OR UPPER(sens_depense_recette) LIKE '%DEPENSE%' THEN 'Dépense'
            WHEN UPPER(sens_depense_recette) LIKE '%RECETTE%' THEN 'Recette'
            ELSE sens_depense_recette
        END AS sens_flux,
        
        -- Type d'opération
        type_d_operation_r_o_i_m AS type_operation,
        
        -- =====================================================================
        -- CODES BUDGÉTAIRES (noms différents dans la source BV)
        -- =====================================================================
        SAFE_CAST(chapitre_niveau_vote_cle_non_composee AS STRING) AS chapitre_code,
        chapitre_niveau_vote_texte AS chapitre_libelle,
        
        SAFE_CAST(nature_reglementaire_cle_non_composee AS STRING) AS nature_code,
        nature_reglementaire_texte AS nature_libelle,
        
        SAFE_CAST(rubrique_reglementaire_cle AS STRING) AS fonction_code,
        rubrique_reglementaire_texte AS fonction_libelle,
        
        -- =====================================================================
        -- MONTANTS (crédits votés, pas mandatés - INTEGER dans la source)
        -- =====================================================================
        ABS(SAFE_CAST(budget_vote_pmt AS FLOAT64)) AS montant,
        
        -- =====================================================================
        -- CLÉ TECHNIQUE (même structure que CA + suffixe -BV pour unicité)
        -- =====================================================================
        CONCAT(
            SAFE_CAST(exercice_comptable AS STRING), '-',
            COALESCE(SUBSTR(groupe_d_autorisation_i_f, 1, 1), 'X'), '-',
            CASE WHEN UPPER(sens_depense_recette) LIKE '%DÉPENSE%' THEN 'D' ELSE 'R' END, '-',
            COALESCE(SAFE_CAST(chapitre_niveau_vote_cle_non_composee AS STRING), '000'), '-',
            COALESCE(SAFE_CAST(nature_reglementaire_cle_non_composee AS STRING), '000'), '-',
            COALESCE(SAFE_CAST(rubrique_reglementaire_cle AS STRING), '000'), '-',
            SUBSTR(TO_HEX(MD5(COALESCE(nature_reglementaire_texte, ''))), 1, 8),
            '-BV'
        ) AS cle_technique
        
    FROM source
    WHERE 
        -- Filtre opérations réelles uniquement (comme le CA)
        (type_d_operation_r_o_i_m = 'Réel' OR type_d_operation_r_o_i_m = 'R')
        -- Budget Primitif initial uniquement (pas Budget Suppl.)
        AND etape_budgetaire = 'Budget Primitif'
        -- Montants positifs et non NULL
        AND budget_vote_pmt IS NOT NULL
        AND SAFE_CAST(budget_vote_pmt AS FLOAT64) > 0
)

SELECT * FROM cleaned
