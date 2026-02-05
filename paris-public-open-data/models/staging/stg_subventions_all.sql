-- =============================================================================
-- Staging: Subventions versées (Annexe Compte Administratif)
--
-- Source: subventions_versees_annexe_compte_administratif_a_partir_de_2018
-- Description: TOUTES les subventions versées (associations, entreprises, EP...)
--
-- Transformations:
--   - Parse année depuis 'publication' ("CA 2023" → 2023)
--   - Normalisation nom bénéficiaire (pour jointures)
--   - Typage: FLOAT64 pour montants
--   - Flag données disponibles (2020-2021 = noms NULL)
--
-- Output: ~47k lignes, années 2018-2024
-- ⚠️ ATTENTION: 2020-2021 ont des noms bénéficiaires NULL
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('paris_raw', 'subventions_versees_annexe_compte_administratif_a_partir_de_2018') }}
),

cleaned AS (
    SELECT
        -- =====================================================================
        -- IDENTIFIANTS
        -- =====================================================================
        
        -- Année extraite de "CA 2023" ou "2023" ou "2024"
        SAFE_CAST(
            REGEXP_EXTRACT(COALESCE(publication, ''), r'(\d{4})')
            AS INT64
        ) AS annee,
        
        -- Collectivité
        collectivite,
        
        -- =====================================================================
        -- BÉNÉFICIAIRE
        -- =====================================================================
        nom_de_l_organisme_beneficiaire AS beneficiaire,
        
        -- Bénéficiaire normalisé (pour jointures avec associations)
        -- Supprime articles, espaces multiples, met en majuscules
        UPPER(TRIM(REGEXP_REPLACE(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    COALESCE(nom_de_l_organisme_beneficiaire, ''),
                    r"^(L'|LA |LE |LES |D'|DU |DE LA |DE L'|DES )", ''
                ),
                r'[^A-Za-zÀ-ÿ0-9\s]', ' '
            ),
            r'\s+', ' '
        ))) AS beneficiaire_normalise,
        
        -- Catégorie et nature juridique
        categorie_du_beneficiaire AS categorie,
        nature_juridique_du_beneficiaire AS nature_juridique,
        
        -- =====================================================================
        -- MONTANTS
        -- =====================================================================
        ABS(SAFE_CAST(montant_de_la_subvention AS FLOAT64)) AS montant,
        SAFE_CAST(prestations_en_nature AS FLOAT64) AS prestations_nature,
        
        -- =====================================================================
        -- FLAGS QUALITÉ DONNÉES
        -- =====================================================================
        -- En 2020 et 2021, les noms bénéficiaires sont NULL (données non publiées)
        CASE 
            WHEN SAFE_CAST(REGEXP_EXTRACT(publication, r'(\d{4})') AS INT64) IN (2020, 2021) 
                 AND nom_de_l_organisme_beneficiaire IS NULL
            THEN FALSE 
            ELSE TRUE 
        END AS donnees_disponibles,
        
        -- =====================================================================
        -- CLÉ TECHNIQUE
        -- =====================================================================
        CONCAT(
            COALESCE(REGEXP_EXTRACT(publication, r'(\d{4})'), 'XXXX'), '-',
            COALESCE(collectivite, 'X'), '-',
            COALESCE(
                UPPER(TRIM(REGEXP_REPLACE(
                    COALESCE(nom_de_l_organisme_beneficiaire, 'INCONNU'),
                    r'\s+', ' '
                ))),
                'INCONNU'
            ), '-',
            COALESCE(SAFE_CAST(montant_de_la_subvention AS STRING), '0')
        ) AS cle_technique
        
    FROM source
    WHERE 
        -- Filtre montants positifs
        ABS(SAFE_CAST(montant_de_la_subvention AS FLOAT64)) > 0
)

SELECT * FROM cleaned
