-- =============================================================================
-- Staging: Subventions versées (Annexe CA) + fallback Votées (pour 2025 seul)
--
-- Sources:
--   1. subventions_versees_annexe_compte_administratif_a_partir_de_2018
--      → TOUTES les subventions versées (associations, entreprises, EP...)
--   2. subventions_associations_votees_  (via stg_associations)
--      → UNION uniquement pour les années où l'Annexe CA n'est pas encore
--        publiée (2025+) — fournit le détail associations.
--
-- Stratégie 2020 / 2021:
--   OpenData Paris a anonymisé les noms bénéficiaires sur l'Annexe CA pour ces
--   deux années (COVID — nom_de_l_organisme_beneficiaire = NULL sur 100 % des
--   lignes, mais les montants sont là). Plutôt que de dégrader la taxonomie
--   avec des buckets "ANONYMISÉ — …" qui cassent le drill-down, on exclut
--   purement ces années de l'export. Elles seront récupérées plus tard via le
--   pipeline PDF (extract_pdf_budget_vote.py) qui lit les annexes comptables
--   avec les noms bénéficiaires.
--
-- Transformations:
--   - Parse année depuis 'publication' ("CA 2023" → 2023)
--   - Normalisation nom bénéficiaire (pour jointures)
--   - Typage: FLOAT64 pour montants
--
-- Output: ~55k lignes, années 2018, 2019, 2022, 2023, 2024, 2025
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
        -- FLAG QUALITÉ DONNÉES
        -- =====================================================================
        TRUE AS donnees_disponibles,

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
        -- Exclut 2020/2021 : noms anonymisés à la source, à reprendre via PDF
        AND nom_de_l_organisme_beneficiaire IS NOT NULL
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
)

-- NOTE: pas de remontée des votées pour l'année en cours — les votées ne
-- couvrent que les associations (~20 % du total) et donneraient un chiffre
-- trompeur (ex: 2025 ~294 M€ sur 1 300 M€ attendus). Quand l'Annexe CA de
-- l'année N est publiée (typiquement Q2-Q3 N+1), elle apparaîtra naturellement.
SELECT * FROM annexe_ca_final
