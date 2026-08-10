{{ config(tags=['referential_integrity']) }}
SELECT 'row_count_mismatch' AS test_name, stg_count, core_count
FROM (
    SELECT
        (SELECT COUNT(*) FROM {{ ref('stg_budget_principal') }}) AS stg_count,
        (SELECT COUNT(*) FROM {{ ref('core_budget') }}) AS core_count
)
WHERE stg_count != core_count
