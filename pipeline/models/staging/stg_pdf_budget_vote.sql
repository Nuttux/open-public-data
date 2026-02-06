-- =============================================================================
-- Staging: Budget Voté (BP) extrait des PDFs éditique BG
--
-- Source: seed_pdf_budget_vote_{2020..2026} (extraits par pdfplumber)
-- Description: Budget PRÉVISIONNEL voté par le Conseil de Paris,
--              extrait des documents PDF "éditique Budget Général".
--
-- ARCHITECTURE:
--   Ce staging UNION ALL les 7 seeds PDF (un par année, 2020-2026).
--   Un staging = 1 source brute (ici: PDF éditique BG).
--   La consolidation avec le CSV OpenData (2019) se fait dans core_budget_vote.
--
-- Format PDFs:
--   - 2020-2022: Format "Détail par articles" (legacy, même données)
--   - 2023-2026: Format "Présentation croisée" (standard)
--
-- Couverture: 2020-2026 (BP uniquement, pas DM)
-- Grain: (annee, section, sens_flux, chapitre_code, nature_code, fonction_code)
-- Output: ~14,000 lignes
-- =============================================================================

WITH pdf_union AS (
    SELECT * FROM {{ ref('seed_pdf_budget_vote_2020') }}
    UNION ALL
    SELECT * FROM {{ ref('seed_pdf_budget_vote_2021') }}
    UNION ALL
    SELECT * FROM {{ ref('seed_pdf_budget_vote_2022') }}
    UNION ALL
    SELECT * FROM {{ ref('seed_pdf_budget_vote_2023') }}
    UNION ALL
    SELECT * FROM {{ ref('seed_pdf_budget_vote_2024') }}
    UNION ALL
    SELECT * FROM {{ ref('seed_pdf_budget_vote_2025') }}
    UNION ALL
    SELECT * FROM {{ ref('seed_pdf_budget_vote_2026') }}
),

cleaned AS (
    SELECT
        -- =====================================================================
        -- IDENTIFIANTS (standardisés comme stg_budget_vote / stg_budget_principal)
        -- =====================================================================
        annee,
        section,
        sens_flux,

        -- Type d'opération: toujours 'Réel' (les PDFs éditique BG
        -- ne contiennent que les opérations réelles)
        'Réel' AS type_operation,

        -- =====================================================================
        -- CODES BUDGÉTAIRES
        -- Normalisation: les PDFs utilisent "904-4" mais core_budget a "9044"
        -- → on retire le tiret pour aligner les codes entre vote et exécuté.
        -- =====================================================================
        REPLACE(SAFE_CAST(chapitre_code AS STRING), '-', '') AS chapitre_code,
        chapitre_libelle,

        SAFE_CAST(nature_code AS STRING) AS nature_code,
        nature_libelle,

        SAFE_CAST(fonction_code AS STRING) AS fonction_code,
        -- Les PDFs ne fournissent pas de libellé fonction dans le détail croisé
        -- (les libellés sont dans les en-têtes de colonnes, non extraits)
        '' AS fonction_libelle,

        -- =====================================================================
        -- MONTANTS (crédits votés, extraits des PDFs)
        -- =====================================================================
        ABS(montant) AS montant,

        -- =====================================================================
        -- CLÉ TECHNIQUE (identifiant unique par ligne)
        -- =====================================================================
        CONCAT(
            SAFE_CAST(annee AS STRING), '-',
            SUBSTR(section, 1, 1), '-',
            SUBSTR(sens_flux, 1, 1), '-',
            COALESCE(SAFE_CAST(chapitre_code AS STRING), '000'), '-',
            COALESCE(SAFE_CAST(nature_code AS STRING), '000'), '-',
            COALESCE(SAFE_CAST(fonction_code AS STRING), '000'), '-',
            'PDF-BV'
        ) AS cle_technique,

        -- =====================================================================
        -- MÉTADONNÉES SOURCE (traçabilité)
        -- =====================================================================
        source_page,
        source_pdf

    FROM pdf_union
    WHERE
        -- Montants positifs uniquement
        montant IS NOT NULL
        AND montant > 0
)

SELECT * FROM cleaned
