{{ config(tags=['referential_integrity']) }}
SELECT 'row_count_mismatch' AS test_name, int_count, core_count
FROM (
    SELECT
        (SELECT COUNT(*) FROM {{ ref('int_ap_projets_enrichis') }}) AS int_count,
        (SELECT COUNT(*) FROM {{ ref('core_ap_projets') }}) AS core_count
)
WHERE int_count != core_count
