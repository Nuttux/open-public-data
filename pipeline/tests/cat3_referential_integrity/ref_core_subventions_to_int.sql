{{ config(tags=['referential_integrity']) }}
SELECT 'row_count_mismatch' AS test_name, int_count, core_count
FROM (
    SELECT
        (SELECT COUNT(*) FROM {{ ref('int_subventions_enrichies') }}) AS int_count,
        (SELECT COUNT(*) FROM {{ ref('core_subventions') }}) AS core_count
)
WHERE int_count != core_count
