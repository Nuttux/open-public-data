-- =============================================================================
-- Staging: Subventions versées (Annexe CA) + fallback Votées (pour 2020/21/25)
--
-- Sources:
--   1. subventions_versees_annexe_compte_administratif_a_partir_de_2018
--      → TOUTES les subventions versées (associations, entreprises, EP...)
--   2. subventions_associations_votees_  (via stg_associations)
--      → UNION pour les années où l'Annexe CA a les noms bénéficiaires NULL
--        (2020, 2021) ou n'a pas encore de données publiées (2025).
--
-- Transformations:
--   - Parse année depuis 'publication' ("CA 2023" → 2023)
--   - Normalisation nom bénéficiaire (pour jointures)
--   - Typage: FLOAT64 pour montants
--   - Flag données disponibles (2020-2021 = noms NULL sur Annexe CA)
--
-- Output: ~55-60k lignes, années 2018-2025
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
        -- OpenData Paris publie 2020/21 avec `nom_de_l_organisme_beneficiaire = NULL`
        -- (anonymisation à la source). Les montants, eux, sont renseignés.
        -- On remplace par un placeholder `ANONYMISÉ — <nature>` pour que les
        -- totaux annuels restent corrects, tout en étant transparent sur l'absence
        -- de nom. Les associations nommées viendront en complément via le
        -- fallback `votees_fill` plus bas dans ce modèle.
        COALESCE(
            nom_de_l_organisme_beneficiaire,
            CONCAT('ANONYMISÉ — ', COALESCE(nature_juridique_du_beneficiaire, 'bénéficiaire'))
        ) AS beneficiaire,

        -- Bénéficiaire normalisé (pour jointures avec associations)
        -- Supprime articles, espaces multiples, met en majuscules
        UPPER(TRIM(REGEXP_REPLACE(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    COALESCE(
                        nom_de_l_organisme_beneficiaire,
                        CONCAT('ANONYMISE ', COALESCE(nature_juridique_du_beneficiaire, 'BENEFICIAIRE'))
                    ),
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
        -- TRUE si le nom d'origine est renseigné. Les lignes 2020/21 avec nom
        -- NULL (anonymisées par OpenData Paris) sont conservées en placeholder
        -- `ANONYMISÉ — <nature>` mais marquées donnees_disponibles=FALSE pour
        -- que les consommateurs puissent afficher un flag « donnée anonyme ».
        CASE
            WHEN nom_de_l_organisme_beneficiaire IS NULL THEN FALSE
            ELSE TRUE
        END AS donnees_disponibles,

        -- Flag de nature (nom d'origine connu ? pour filtrages downstream)
        nom_de_l_organisme_beneficiaire IS NOT NULL AS beneficiaire_nomme,
        
        -- =====================================================================
        -- CLÉ TECHNIQUE - Base (sera complétée par row_number pour unicité)
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
            COALESCE(SAFE_CAST(montant_de_la_subvention AS STRING), '0'), '-',
            -- Inclut catégorie + nature pour différencier lignes avec même montant
            SUBSTR(TO_HEX(MD5(CONCAT(
                COALESCE(categorie_du_beneficiaire, ''),
                COALESCE(nature_juridique_du_beneficiaire, '')
            ))), 1, 6)
        ) AS cle_technique
        
    FROM source
    WHERE 
        -- Filtre montants positifs
        ABS(SAFE_CAST(montant_de_la_subvention AS FLOAT64)) > 0
),

-- Ajoute un suffixe numérique pour les rares doublons restants
with_unique_key AS (
    SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY cle_technique ORDER BY beneficiaire) as rn
    FROM cleaned
),

annexe_ca_final AS (
    SELECT
        annee,
        collectivite,
        beneficiaire,
        beneficiaire_normalise,
        categorie,
        nature_juridique,
        montant,
        prestations_nature,
        donnees_disponibles,
        CASE
            WHEN rn > 1 THEN CONCAT(cle_technique, '-', CAST(rn AS STRING))
            ELSE cle_technique
        END AS cle_technique
    FROM with_unique_key
),

-- =============================================================================
-- FILL GAP: années où l'Annexe CA est inexploitable (noms NULL : 2020, 2021)
-- ou pas encore publiée (2025+). On rabat les subventions votées (stg_associations)
-- pour ces années, en les typant comme Associations (puisque seul ce dataset
-- contient les noms sur cette période — l'autre dataset ne liste que
-- des subventions à des associations).
-- =============================================================================
years_with_valid_annexe_ca AS (
    SELECT DISTINCT annee
    FROM annexe_ca_final
    WHERE donnees_disponibles = TRUE
),

votees_fill AS (
    SELECT
        a.annee,
        COALESCE(a.collectivite, 'Ville') AS collectivite,
        a.beneficiaire,
        a.beneficiaire_normalise,
        'Personnes de droit privé' AS categorie,
        'Associations' AS nature_juridique,
        a.montant,
        CAST(NULL AS FLOAT64) AS prestations_nature,
        TRUE AS donnees_disponibles,
        CONCAT('votees-', COALESCE(a.cle_technique, 'x')) AS cle_technique
    FROM {{ ref('stg_associations') }} a
    WHERE a.beneficiaire IS NOT NULL
      AND a.montant > 0
      AND a.annee NOT IN (SELECT annee FROM years_with_valid_annexe_ca)
)

SELECT * FROM annexe_ca_final
WHERE donnees_disponibles = TRUE  -- exclude 2020/21 NULL-name rows from Annexe CA
UNION ALL
SELECT * FROM votees_fill
