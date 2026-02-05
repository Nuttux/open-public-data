-- =============================================================================
-- Staging: Autorisations de Programmes (AP) - Projets d'investissement
--
-- Source: comptes_administratifs_autorisations_de_programmes_a_partir_de_2018_m57_ville_de
-- Description: Projets d'équipement nommés (piscines, écoles, parcs...)
--
-- Transformations:
--   - Filtre: type_operation = 'Réel' + sens = 'Dépenses'
--   - Filtre: montant > 0
--   - Extraction: arrondissement depuis texte AP (regex)
--   - Typage: FLOAT64 pour montants
--
-- Output: ~4.7k lignes (après filtres), années 2018-2022
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('paris_raw', 'comptes_administratifs_autorisations_de_programmes_a_partir_de_2018_m57_ville_de') }}
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
        -- MISSION ET DIRECTION
        -- =====================================================================
        SAFE_CAST(mission_ap_cle AS STRING) AS mission_code,
        mission_ap_texte AS mission_libelle,
        
        SAFE_CAST(direction_gestionnaire_cle AS STRING) AS direction_code,
        direction_gestionnaire_texte AS direction,
        
        -- =====================================================================
        -- PROJET AP
        -- =====================================================================
        SAFE_CAST(autorisation_de_programme_cle AS STRING) AS ap_code,
        autorisation_de_programme_texte AS ap_texte,
        
        -- =====================================================================
        -- CODES BUDGÉTAIRES (clés de jointure avec budget principal)
        -- =====================================================================
        SAFE_CAST(nature_budgetaire_cle AS STRING) AS nature_code,
        SAFE_CAST(domaine_fonctionnel_rubrique_reglementaire_cle AS STRING) AS fonction_code,
        
        -- =====================================================================
        -- MONTANTS
        -- =====================================================================
        ABS(SAFE_CAST(mandate_titre_apres_regul AS FLOAT64)) AS montant,
        
        -- =====================================================================
        -- EXTRACTION ARRONDISSEMENT (regex sur texte AP)
        -- BigQuery limite à 1 groupe de capture, donc on utilise des patterns simples
        -- =====================================================================
        CASE
            -- Pattern 75001-75020 (code postal)
            WHEN REGEXP_CONTAINS(autorisation_de_programme_texte, r'7500[1-9]|750[12][0-9]')
            THEN SAFE_CAST(
                REGEXP_REPLACE(
                    REGEXP_EXTRACT(autorisation_de_programme_texte, r'750([012][0-9])'),
                    r'^0', ''
                ) AS INT64)
            -- Pattern (12E), (5E), etc.
            WHEN REGEXP_CONTAINS(UPPER(autorisation_de_programme_texte), r'\(\d{1,2}E\)')
            THEN SAFE_CAST(REGEXP_EXTRACT(UPPER(autorisation_de_programme_texte), r'\((\d{1,2})E\)') AS INT64)
            -- Pattern 15EME, 5EME, etc. (sans espace)
            WHEN REGEXP_CONTAINS(UPPER(autorisation_de_programme_texte), r'\b\d{1,2}E(?:ME)?\b')
            THEN SAFE_CAST(REGEXP_EXTRACT(UPPER(autorisation_de_programme_texte), r'\b(\d{1,2})E') AS INT64)
            -- Pattern "1ER ARRONDISSEMENT"
            WHEN REGEXP_CONTAINS(UPPER(autorisation_de_programme_texte), r'\b1ER\b')
            THEN 1
            ELSE NULL
        END AS arrondissement_regex,
        
        -- =====================================================================
        -- CLÉ TECHNIQUE
        -- =====================================================================
        CONCAT(
            SAFE_CAST(exercice_comptable AS STRING), '-',
            COALESCE(SAFE_CAST(autorisation_de_programme_cle AS STRING), 'X'), '-',
            COALESCE(SAFE_CAST(nature_budgetaire_cle AS STRING), '000')
        ) AS cle_technique
        
    FROM source
    WHERE 
        -- Filtre opérations réelles uniquement
        (type_d_operation_r_o_i_m = 'Réel' OR type_d_operation_r_o_i_m = 'R')
        -- Filtre dépenses uniquement (pas les recettes d'AP)
        AND (UPPER(sens_depense_recette) LIKE '%DÉPENSE%' OR UPPER(sens_depense_recette) LIKE '%DEPENSE%')
        -- Filtre montants positifs
        AND SAFE_CAST(mandate_titre_apres_regul AS FLOAT64) > 0
)

SELECT * FROM cleaned
