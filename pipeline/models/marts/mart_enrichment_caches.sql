-- =============================================================================
-- Mart: caches d'enrichissement
--
-- Consommé par: pipeline/scripts/export/export_enrichment_caches.py
--   → website/public/data/enrichment/<relative_path>
-- =============================================================================

{{ config(materialized='table', schema='marts', tags=['mart','enrichment']) }}

SELECT
    relative_path,
    payload,
    size_bytes,
    generated_at
FROM {{ ref('core_enrichment_caches') }}
ORDER BY relative_path
