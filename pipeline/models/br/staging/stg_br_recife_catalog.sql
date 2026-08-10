-- =============================================================================
-- Staging: CKAN provenance catalog — one row per synced Recife resource.
--
-- Source: raw.br_recife_catalog (snapshot of resource_show/package_show).
-- Marts CROSS JOIN this by source_id to carry source_url + as_of into every
-- exported block (ADR-0010 export data contract) — never hardcoded.
-- =============================================================================

WITH source AS (
    SELECT * FROM {{ source('br_recife_raw', 'br_recife_catalog') }}
)

SELECT
    {{ br_string('source_id') }}         AS source_id,
    {{ br_string('resource_id') }}       AS resource_id,
    {{ br_string('dataset_title') }}     AS dataset_title,
    {{ br_string('resource_name') }}     AS resource_name,
    {{ br_string('resource_url') }}      AS resource_url,
    {{ br_string('dataset_page_url') }}  AS dataset_page_url,
    {{ br_string('resource_page_url') }} AS resource_page_url,
    {{ br_string('portal_name') }}       AS portal_name,
    {{ br_string('license_title') }}     AS license_title,
    {{ br_string('attribution') }}       AS attribution,
    {{ br_string('format') }}            AS format,
    {{ br_timestamp('last_modified') }}  AS rows_updated_at,
    _synced_at
FROM source
