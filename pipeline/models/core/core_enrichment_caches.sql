-- =============================================================================
-- Core: caches d'enrichissement (passthrough)
-- =============================================================================

{{ config(materialized='table', schema='analytics', tags=['core','enrichment']) }}

SELECT * FROM {{ ref('stg_enrichment_caches') }}
