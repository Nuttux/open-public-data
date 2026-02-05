-- =============================================================================
-- Staging: Budget Principal (Compte Administratif)
--
-- Source: comptes_administratifs_budgets_principaux_a_partir_de_2019_m57_ville_departement
-- Description: Budget exécuté de la Ville de Paris - SOURCE DE VÉRITÉ macro
--
-- Transformations:
--   - Filtre: type_operation = 'Réel' (exclut 'Pour Ordre')
--   - Filtre: montant > 0
--   - Typage: FLOAT64 pour montants
--   - Renommage: colonnes standardisées en français
--
-- Output: ~23k lignes (après filtres), années 2019-2024
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('paris_raw', 'comptes_administratifs_budgets_principaux_a_partir_de_2019_m57_ville_departement') }}
),

cleaned AS (
    SELECT
        -- =====================================================================
        -- IDENTIFIANTS
        -- =====================================================================
        SAFE_CAST(exercice_comptable AS INT64) AS annee,
        
        -- Section budgétaire
        CASE section_budgetaire_i_f
            WHEN 'I' THEN 'Investissement'
            WHEN 'F' THEN 'Fonctionnement'
            ELSE section_budgetaire_i_f
        END AS section,
        
        -- Sens du flux
        CASE 
            WHEN UPPER(sens_depense_recette) LIKE '%DÉPENSE%' OR UPPER(sens_depense_recette) LIKE '%DEPENSE%' THEN 'Dépense'
            WHEN UPPER(sens_depense_recette) LIKE '%RECETTE%' THEN 'Recette'
            ELSE sens_depense_recette
        END AS sens_flux,
        
        -- Type d'opération
        type_d_operation_r_o_i_m AS type_operation,
        
        -- =====================================================================
        -- CODES BUDGÉTAIRES (clés de jointure)
        -- =====================================================================
        SAFE_CAST(chapitre_budgetaire_cle AS STRING) AS chapitre_code,
        chapitre_niveau_vote_texte_descriptif AS chapitre_libelle,
        
        SAFE_CAST(nature_budgetaire_cle AS STRING) AS nature_code,
        nature_budgetaire_texte AS nature_libelle,
        
        SAFE_CAST(fonction_cle AS STRING) AS fonction_code,
        fonction_texte AS fonction_libelle,
        
        -- =====================================================================
        -- MONTANTS
        -- =====================================================================
        ABS(SAFE_CAST(mandate_titre_apres_regul AS FLOAT64)) AS montant,
        
        -- =====================================================================
        -- CLÉ TECHNIQUE
        -- =====================================================================
        CONCAT(
            SAFE_CAST(exercice_comptable AS STRING), '-',
            COALESCE(section_budgetaire_i_f, 'X'), '-',
            CASE WHEN UPPER(sens_depense_recette) LIKE '%DÉPENSE%' THEN 'D' ELSE 'R' END, '-',
            COALESCE(SAFE_CAST(chapitre_budgetaire_cle AS STRING), '000'), '-',
            COALESCE(SAFE_CAST(nature_budgetaire_cle AS STRING), '000'), '-',
            COALESCE(SAFE_CAST(fonction_cle AS STRING), '000')
        ) AS cle_technique
        
    FROM source
    WHERE 
        -- Filtre opérations réelles uniquement
        (type_d_operation_r_o_i_m = 'Réel' OR type_d_operation_r_o_i_m = 'R')
        -- Filtre montants positifs
        AND SAFE_CAST(mandate_titre_apres_regul AS FLOAT64) > 0
)

SELECT * FROM cleaned
