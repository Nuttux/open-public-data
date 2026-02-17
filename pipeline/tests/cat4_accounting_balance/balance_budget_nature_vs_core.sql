{{ config(tags=['accounting_balance'], severity='warn') }}
WITH nature_totals AS (
    SELECT annee, SUM(montant) AS nature_total
    FROM {{ ref('mart_budget_nature') }}
    WHERE niveau = 'niveau_1' AND type_budget = 'execute'
    GROUP BY annee
),
core_totals AS (
    SELECT annee, SUM(montant) AS core_total
    FROM {{ ref('core_budget') }}
    WHERE sens_flux = 'Dépense'
    GROUP BY annee
)
SELECT n.annee, n.nature_total, c.core_total,
       ABS(n.nature_total - c.core_total) AS ecart
FROM nature_totals n
JOIN core_totals c ON n.annee = c.annee
WHERE ABS(n.nature_total - c.core_total) > 1.0
