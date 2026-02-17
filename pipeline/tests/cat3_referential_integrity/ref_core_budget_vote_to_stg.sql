{{ config(tags=['referential_integrity']) }}
SELECT 'row_count_mismatch' AS test_name, expected, actual
FROM (
    SELECT
        (SELECT COUNT(*) FROM {{ ref('stg_pdf_budget_vote') }})
        + (SELECT COUNT(*) FROM {{ ref('stg_budget_vote') }} WHERE annee = 2019) AS expected,
        (SELECT COUNT(*) FROM {{ ref('core_budget_vote') }}) AS actual
)
WHERE expected != actual
