{{ config(tags=['data_completeness'], severity='warn') }}
WITH budget_thematique AS (
    SELECT
        ROUND(COUNTIF(ode_thematique IS NOT NULL AND ode_thematique != 'Autre') * 100.0 / COUNT(*), 1) AS pct
    FROM {{ ref('core_budget') }}
)
SELECT pct AS budget_thematique_pct
FROM budget_thematique
WHERE pct < 90
