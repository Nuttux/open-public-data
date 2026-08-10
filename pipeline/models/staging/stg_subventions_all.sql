-- =============================================================================
-- Staging: Subventions versées (Annexe CA OpenData) + Annexe B8.1.1 PDF
--
-- Sources:
--   1. subventions_versees_annexe_compte_administratif_a_partir_de_2018
--      → Annexe CA via OpenData portal.
--      Complète pour 2018-2019 et 2022-2024.
--      Sur 2020 et 2021 : montants présents mais nom_de_l_organisme_beneficiaire
--      = NULL sur 100 % des lignes → inutilisable seul.
--   2. pdf_subventions_b811_paris  (raw, alimenté par sync_pdf_subventions_b811)
--      → Annexe B8.1.1 du CA en PDF, extraite localement.
--      Source exhaustive et nommée imposée par M57 (CGCT L. 2313-1).
--      Utilisée uniquement pour 2020 et 2021 (combler le trou OpenData).
--
-- Stratégie 2020 / 2021:
--   On exclut entièrement les lignes OpenData de ces deux années (toutes
--   anonymes) et on les remplace par les lignes PDF B8.1.1.
--   Les personnes physiques du PDF sont agrégées en une ligne par année
--   pour préserver le total sans exposer d'identité (RGPD : aides
--   individuelles, bourses, montants typiques 200-500 €).
--
-- Transformations:
--   - Parse année depuis 'publication' ("CA 2023" → 2023) côté OpenData
--   - Normalisation nom bénéficiaire (pour jointures)
--   - Typage: FLOAT64 pour montants
--
-- Output: ~55k lignes, années 2018, 2019, 2020, 2021, 2022, 2023, 2024 (+2025
--         si Annexe CA publiée).
-- =============================================================================

WITH source_opendata AS (
    SELECT *
    FROM {{ source('paris_raw', 'subventions_versees_annexe_compte_administratif_a_partir_de_2018') }}
),

opendata_cleaned AS (
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
        -- SOURCE
        -- =====================================================================
        'opendata_annexe_ca' AS source_systeme,

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

    FROM source_opendata
    WHERE
        -- Filtre montants positifs
        ABS(SAFE_CAST(montant_de_la_subvention AS FLOAT64)) > 0
        -- Filtre nom non NULL (sur 2020/2021 c'est 100 % des lignes ;
        -- on les ré-injecte depuis le PDF B8.1.1 ci-dessous)
        AND nom_de_l_organisme_beneficiaire IS NOT NULL
        -- Exclut 2020/2021 même si quelques noms existaient : on prend
        -- la source PDF (plus complète et cohérente) pour ces deux années
        AND SAFE_CAST(REGEXP_EXTRACT(COALESCE(publication, ''), r'(\d{4})') AS INT64)
            NOT IN (2020, 2021)
),

-- ─── Source 2 : Annexe B8.1.1 PDF (2020 + 2021 uniquement) ───────────────────
source_pdf_b811 AS (
    SELECT *
    FROM {{ source('paris_raw', 'pdf_subventions_b811_paris') }}
    WHERE annee IN (2020, 2021)
),

-- Personnes physiques : agrégation RGPD (1 ligne par année)
pdf_personnes_physiques AS (
    SELECT
        annee,
        'Paris' AS collectivite,
        CONCAT(
            'Personnes physiques anonymisées RGPD (',
            CAST(COUNT(*) AS STRING),
            ' aides individuelles)'
        ) AS beneficiaire,
        'PERSONNES PHYSIQUES ANONYMISEES RGPD' AS beneficiaire_normalise,
        'Personnes de droit privé' AS categorie,
        'Personnes physiques' AS nature_juridique,
        SUM(montant_total) AS montant,
        SUM(COALESCE(prestations_nature, 0)) AS prestations_nature,
        TRUE AS donnees_disponibles,
        'pdf_b811' AS source_systeme,
        CONCAT(CAST(annee AS STRING), '-Paris-PP-RGPD-AGGR') AS cle_technique
    FROM source_pdf_b811
    WHERE nature_juridique = 'Personnes physiques'
    GROUP BY annee
),

-- Bénéficiaires nommés du PDF (tout sauf personnes physiques)
pdf_named AS (
    SELECT
        annee,
        'Paris' AS collectivite,
        name AS beneficiaire,
        name_normalized AS beneficiaire_normalise,
        COALESCE(categorie, '—') AS categorie,
        COALESCE(nature_juridique, '—') AS nature_juridique,
        montant_total AS montant,
        COALESCE(prestations_nature, 0) AS prestations_nature,
        TRUE AS donnees_disponibles,
        'pdf_b811' AS source_systeme,
        CONCAT(
            CAST(annee AS STRING), '-Paris-',
            UPPER(REGEXP_REPLACE(COALESCE(name, 'INCONNU'), r'\s+', ' ')), '-',
            CAST(CAST(montant_total AS INT64) AS STRING), '-',
            SUBSTR(TO_HEX(MD5(CONCAT(
                COALESCE(categorie, ''),
                COALESCE(nature_juridique, '')
            ))), 1, 6)
        ) AS cle_technique
    FROM source_pdf_b811
    WHERE COALESCE(nature_juridique, '') != 'Personnes physiques'
),

-- ─── UNION des deux sources ──────────────────────────────────────────────────
unioned AS (
    SELECT * FROM opendata_cleaned
    UNION ALL
    SELECT * FROM pdf_named
    UNION ALL
    SELECT * FROM pdf_personnes_physiques
),

-- Ajoute un suffixe numérique pour les rares doublons restants
with_unique_key AS (
    SELECT
        *,
        ROW_NUMBER() OVER (PARTITION BY cle_technique ORDER BY beneficiaire) as rn
    FROM unioned
)

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
    source_systeme,
    CASE
        WHEN rn > 1 THEN CONCAT(cle_technique, '-', CAST(rn AS STRING))
        ELSE cle_technique
    END AS cle_technique
FROM with_unique_key
