{{ config(tags=['accounting_balance'], severity='warn') }}
WITH metriques AS (
    SELECT annee, epargne_brute
    FROM {{ ref('mart_evolution_budget') }}
    WHERE vue = 'metriques' AND type_budget = 'execute'
)
SELECT annee, epargne_brute
FROM metriques
WHERE epargne_brute < 0
