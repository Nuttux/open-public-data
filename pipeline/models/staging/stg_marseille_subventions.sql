-- =============================================================================
-- Staging: Marseille subventions (SCDL Ville, data.gouv.fr)
--
-- Sources: raw.marseille_subventions_ville_{2017..2022} (synced via sync_city.py
--   marseille --source marseille_subventions_ville, loaded all-STRING — see below).
--
-- ⚠ Locale number format: the SCDL `montant` mixes French decimal comma
--   ("854999,98" = 854 999,98 €) AND dot decimal ("15031.65") — sometimes within
--   the same file. BigQuery autodetect strips the comma (854999,98 → 85499998,
--   a ×100 inflation), so the raw tables are loaded all-STRING (all_strings:true
--   in marseille.yaml) and montant is cast HERE: strip spaces, comma→dot, cast.
--
-- ⚠ Header case drift: 2018 publishes `TypeBeneficiaire` (capital T); all other
--   years `typeBeneficiaire`. (Trailing-space variants are normalised away by the
--   all-STRING loader's header sanitiser.)
--
-- Output aligned with stg_subventions_all (Paris) so the shared subventions
-- marts + exporter apply unchanged, plus commune_slug ('marseille') and objet
-- (from objetAideNature — a per-line signal that feeds the LLM thematique prompt).
--
-- Marseille SCDL carries NO siret, NO direction, NO catégorie dimension — the
-- thematique comes from the in-session LLM cache (stg_marseille_cache_thematique)
-- keyed on beneficiaire_normalise, cascaded in core_marseille_subventions.
-- =============================================================================

{{ config(materialized='view', schema='staging', tags=['staging', 'marseille', 'subventions']) }}

{% set type_ben_col = {
    2017: 'typeBeneficiaire',
    2018: 'TypeBeneficiaire',
    2019: 'typeBeneficiaire',
    2020: 'typeBeneficiaire',
    2021: 'typeBeneficiaire',
    2022: 'typeBeneficiaire',
} %}

WITH unioned AS (
    {% for year, tb_col in type_ben_col.items() %}
    SELECT
        COALESCE(SAFE_CAST(`anneeAttribution` AS INT64), {{ year }}) AS annee,
        TRIM(`nomBeneficiaire`) AS beneficiaire_raw,
        TRIM(`{{ tb_col }}`) AS type_beneficiaire,
        -- Parse locale-formatted amount: strip spaces (any thousands spacing),
        -- comma → dot decimal, then cast. Handles both "854999,98" and "15031.65".
        SAFE_CAST(REPLACE(REPLACE(`montant`, ' ', ''), ',', '.') AS FLOAT64) AS montant_raw,
        `nature` AS nature_aide,
        `objetAideNature` AS objet_raw
    FROM {{ source('marseille_raw', 'marseille_subventions_ville_' ~ year) }}
    {% if not loop.last %}UNION ALL{% endif %}
    {% endfor %}
),

normalised AS (
    SELECT
        'marseille' AS commune_slug,
        'Marseille' AS collectivite,
        annee,
        beneficiaire_raw AS beneficiaire,

        -- Bénéficiaire normalisé — MÊME transformation que stg_subventions_all
        -- (Paris) pour que la jointure thematique + le dédoublonnage search
        -- soient cohérents entre villes.
        UPPER(TRIM(REGEXP_REPLACE(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    COALESCE(beneficiaire_raw, ''),
                    r"^(L'|LA |LE |LES |D'|DU |DE LA |DE L'|DES )", ''
                ),
                r'[^A-Za-zÀ-ÿ0-9\s]', ' '
            ),
            r'\s+', ' '
        ))) AS beneficiaire_normalise,

        -- Pas de dimension "catégorie" dans le SCDL Marseille : on porte la
        -- nature de l'aide (numéraire/nature) — inoffensif pour le fallback
        -- Paris (qui matche sur des mots-clés culture/sport/… absents ici ;
        -- le cache LLM est le vrai chemin thematique).
        nature_aide AS categorie,
        type_beneficiaire AS nature_juridique,
        montant_raw AS montant,

        -- Prestations en nature : le SCDL distingue "aide en nature" vs
        -- "aide en numéraire" par ligne → montant si en nature, sinon NULL.
        CASE
            WHEN LOWER(COALESCE(nature_aide, '')) LIKE '%nature%' THEN montant_raw
            ELSE NULL
        END AS prestations_nature,

        NULLIF(TRIM(objet_raw), '') AS objet,
        TRUE AS donnees_disponibles,
        'scdl_datagouv' AS source_systeme,

        CONCAT(
            'marseille-subv-', CAST(annee AS STRING), '-',
            SUBSTR(TO_HEX(MD5(CONCAT(
                COALESCE(beneficiaire_raw, ''), '|',
                CAST(montant_raw AS STRING), '|',
                COALESCE(objet_raw, '')
            ))), 1, 16)
        ) AS cle_technique

    FROM unioned
    WHERE beneficiaire_raw IS NOT NULL
      AND TRIM(beneficiaire_raw) != ''
      AND COALESCE(montant_raw, 0) > 0
)

SELECT * FROM normalised
