-- =============================================================================
-- Staging: Subventions aux associations (avec SIRET)
--
-- Source: subventions_associations_votees_
-- Description: Détail des subventions aux associations avec SIRET et direction
--
-- Transformations:
--   - SIRET: padding à 14 caractères (était FLOAT dans la source)
--   - Normalisation nom bénéficiaire (pour jointure avec stg_subventions_all)
--   - Typage: FLOAT64 pour montants
--   - Déduplication: la source contient des paires (ligne vide + ligne
--     avec bénéficiaire) pour le même dossier — on garde la plus complète
--
-- Output: ~102k lignes, années 2013-2025
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('paris_raw', 'subventions_associations_votees') }}
),

cleaned AS (
    SELECT
        -- =====================================================================
        -- IDENTIFIANTS
        -- =====================================================================
        SAFE_CAST(annee_budgetaire AS INT64) AS annee,
        numero_de_dossier AS dossier_id,
        collectivite,
        
        -- =====================================================================
        -- BÉNÉFICIAIRE
        -- =====================================================================
        nom_beneficiaire AS beneficiaire,
        
        -- Bénéficiaire normalisé (même logique que stg_subventions_all pour JOIN)
        UPPER(TRIM(REGEXP_REPLACE(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    COALESCE(nom_beneficiaire, ''),
                    r"^(L'|LA |LE |LES |D'|DU |DE LA |DE L'|DES )", ''
                ),
                r'[^A-Za-zÀ-ÿ0-9\s]', ' '
            ),
            r'\s+', ' '
        ))) AS beneficiaire_normalise,
        
        -- =====================================================================
        -- SIRET (clé pour géolocalisation)
        -- Le SIRET est stocké comme STRING, on le nettoie et pad à 14 chars
        -- =====================================================================
        CASE
            WHEN numero_siret IS NOT NULL 
                 AND TRIM(numero_siret) != ''
                 AND SAFE_CAST(TRIM(numero_siret) AS INT64) > 0
            THEN LPAD(TRIM(numero_siret), 14, '0')
            ELSE NULL
        END AS siret,
        
        -- =====================================================================
        -- CONTEXTE (direction, objet, nature)
        -- =====================================================================
        direction,
        objet_du_dossier AS objet,
        nature_de_la_subvention AS nature_subvention,
        secteurs_d_activites_definies_par_l_association AS secteurs_activite,
        
        -- =====================================================================
        -- MONTANTS
        -- =====================================================================
        ABS(SAFE_CAST(montant_vote AS FLOAT64)) AS montant,
        
        -- =====================================================================
        -- CLÉ TECHNIQUE (inclut hash bénéficiaire pour éviter les collisions
        -- quand le numéro de dossier est absent ou partagé)
        -- =====================================================================
        CONCAT(
            COALESCE(SAFE_CAST(annee_budgetaire AS STRING), 'XXXX'), '-',
            COALESCE(numero_de_dossier, 'X'), '-',
            COALESCE(direction, 'X'), '-',
            SUBSTR(TO_HEX(MD5(COALESCE(nom_beneficiaire, ''))), 1, 8)
        ) AS cle_technique
        
    FROM source
    WHERE
        -- Filtre montants positifs
        ABS(SAFE_CAST(montant_vote AS FLOAT64)) > 0
        -- Filtre ligne grand total (annee NULL)
        AND annee_budgetaire IS NOT NULL
),

-- =============================================================================
-- DÉDUPLICATION: la source contient des paires (ligne vide + ligne avec
-- bénéficiaire) pour le même dossier. On garde la ligne la plus complète
-- (celle avec un nom de bénéficiaire renseigné).
-- =============================================================================
deduplicated AS (
    SELECT *,
        ROW_NUMBER() OVER (
            PARTITION BY annee, dossier_id, direction, CAST(montant AS STRING)
            ORDER BY
                -- Préférer la ligne avec bénéficiaire renseigné
                CASE WHEN beneficiaire IS NOT NULL AND TRIM(beneficiaire) != '' THEN 0 ELSE 1 END,
                -- En cas d'égalité, préférer celle avec SIRET
                CASE WHEN siret IS NOT NULL THEN 0 ELSE 1 END
        ) AS _row_num
    FROM cleaned
)

SELECT
    annee,
    dossier_id,
    collectivite,
    beneficiaire,
    beneficiaire_normalise,
    siret,
    direction,
    objet,
    nature_subvention,
    secteurs_activite,
    montant,
    cle_technique
FROM deduplicated
WHERE _row_num = 1
