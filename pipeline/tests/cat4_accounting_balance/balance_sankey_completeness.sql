{{ config(tags=['accounting_balance'], severity='warn') }}
WITH sankey_totals AS (
    SELECT annee, SUM(montant_total) AS sankey_total
    FROM {{ ref('mart_sankey') }}
    GROUP BY annee
),
core_totals AS (
    SELECT annee, SUM(montant) AS core_total
    FROM {{ ref('core_budget') }}
    WHERE sens_flux = 'Dépense'
    GROUP BY annee
)
SELECT s.annee, s.sankey_total, c.core_total,
       ABS(s.sankey_total - c.core_total) / NULLIF(c.core_total, 0) * 100 AS pct_diff
FROM sankey_totals s
JOIN core_totals c ON s.annee = c.annee
WHERE ABS(s.sankey_total - c.core_total) / NULLIF(c.core_total, 0) > 1.0
