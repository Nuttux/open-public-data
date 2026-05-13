-- =============================================================================
-- Staging: caches d'enrichissement (table polymorphe)
--
-- Source: raw.enrichment_caches_paris
-- Grain: une ligne par fichier cache (relative_path)
-- =============================================================================

{{ config(materialized='view', schema='staging', tags=['staging','enrichment']) }}

SELECT
    relative_path,
    payload,
    SAFE_CAST(size_bytes AS INT64) AS size_bytes,
    SAFE_CAST(generated_at AS TIMESTAMP) AS generated_at
FROM {{ source('paris_raw', 'enrichment_caches_paris') }}
