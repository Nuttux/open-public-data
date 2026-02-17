{{ config(tags=['cross_layer']) }}
{# Sankey mart must preserve core_budget dépense totals per year (tolerance: 1%) #}
WITH mart_totals AS (
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
SELECT m.annee, m.sankey_total, c.core_total,
       ABS(m.sankey_total - c.core_total) AS diff,
       ABS(m.sankey_total - c.core_total) / NULLIF(c.core_total, 0) * 100 AS pct_diff
FROM mart_totals m
JOIN core_totals c ON m.annee = c.annee
WHERE ABS(m.sankey_total - c.core_total) / NULLIF(c.core_total, 0) > 0.01
