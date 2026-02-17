{{ config(tags=['referential_integrity']) }}
SELECT 'row_count_mismatch' AS test_name, stg_count, int_count
FROM (
    SELECT
        (SELECT COUNT(*) FROM {{ ref('stg_subventions_all') }}) AS stg_count,
        (SELECT COUNT(*) FROM {{ ref('int_subventions_enrichies') }}) AS int_count
)
WHERE stg_count != int_count
