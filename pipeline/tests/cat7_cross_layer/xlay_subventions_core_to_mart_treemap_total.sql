{{ config(tags=['cross_layer'], severity='warn') }}
WITH mart_totals AS (
    SELECT annee, SUM(montant_total) AS mart_total
    FROM {{ ref('mart_subventions_treemap') }}
    GROUP BY annee
),
core_totals AS (
    SELECT annee, SUM(montant) AS core_total
    FROM {{ ref('core_subventions') }}
    WHERE donnees_disponibles = TRUE AND montant > 0
    GROUP BY annee
)
SELECT m.annee, m.mart_total, c.core_total,
       ABS(m.mart_total - c.core_total) / NULLIF(c.core_total, 0) * 100 AS pct_diff
FROM mart_totals m
JOIN core_totals c ON m.annee = c.annee
WHERE ABS(m.mart_total - c.core_total) / NULLIF(c.core_total, 0) > 1.0
