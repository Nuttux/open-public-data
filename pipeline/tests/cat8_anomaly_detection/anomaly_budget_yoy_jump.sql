{{ config(tags=['anomaly_detection'], severity='warn') }}
{# Flag years where total budget jumps >30% YoY, excluding COVID years 2020-2021 #}
WITH annual AS (
    SELECT annee, SUM(montant) AS total
    FROM {{ ref('core_budget') }}
    WHERE sens_flux = 'Dépense'
    GROUP BY annee
),
yoy AS (
    SELECT
        annee,
        total,
        LAG(total) OVER (ORDER BY annee) AS prev_total,
        SAFE_DIVIDE(total - LAG(total) OVER (ORDER BY annee), LAG(total) OVER (ORDER BY annee)) * 100 AS pct_change
    FROM annual
)
SELECT annee, total, prev_total, ROUND(pct_change, 2) AS pct_change
FROM yoy
WHERE ABS(pct_change) > 30
  AND annee NOT IN (2020, 2021)
  AND prev_total IS NOT NULL
