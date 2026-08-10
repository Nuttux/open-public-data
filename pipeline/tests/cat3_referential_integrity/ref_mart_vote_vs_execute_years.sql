{{ config(tags=['referential_integrity']) }}
SELECT DISTINCT v.annee
FROM {{ ref('mart_vote_vs_execute') }} v
LEFT JOIN (
    SELECT DISTINCT annee FROM {{ ref('core_budget') }}
    UNION DISTINCT
    SELECT DISTINCT annee FROM {{ ref('core_budget_vote') }}
) all_years ON v.annee = all_years.annee
WHERE all_years.annee IS NULL
