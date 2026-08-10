-- =============================================================================
-- Staging: investissements localisés (extraction PDF Annexe IL)
--
-- Source: raw.pdf_investissements_localises_paris
--   (alimenté par pipeline/scripts/sync/sync_pdf_investissements_localises.py
--    qui charge les JSON déjà extraits par extract_pdf_investments.py)
--
-- Grain: une ligne par projet × année de publication
-- Transformations: type-cast, normalisation des champs nuls
-- =============================================================================

{{ config(materialized='view', schema='staging', tags=['staging','investissements','pdf']) }}

SELECT
    SAFE_CAST(year_publication AS INT64) AS annee_publication,
    source,
    extraction_date,

    -- Métadonnées d'extraction (per-year, dédupliquées au niveau core)
    SAFE_CAST(pages_traitees AS INT64) AS pages_traitees,
    SAFE_CAST(pages_il AS INT64) AS pages_il,
    SAFE_CAST(total_attendu_m_eur AS FLOAT64) AS total_attendu_m_eur,
    SAFE_CAST(ecart_pourcent AS FLOAT64) AS ecart_pourcent,
    SAFE_CAST(valide AS BOOL) AS validation_ok,

    -- Champs projet
    id AS projet_id,
    SAFE_CAST(annee AS INT64) AS annee,
    SAFE_CAST(arrondissement AS INT64) AS arrondissement,
    chapitre_code,
    chapitre_libelle,
    nom_projet,
    SAFE_CAST(montant AS FLOAT64) AS montant,
    type_ap,
    SAFE_CAST(confidence AS FLOAT64) AS confidence,
    SAFE_CAST(source_page AS INT64) AS source_page,
    source_pdf,
    date_extraction
FROM {{ source('paris_raw', 'pdf_investissements_localises_paris') }}
