{{ config(tags=['anomaly_detection'], severity='warn') }}
{# Bilan total assets should not vary >20% YoY #}
WITH annual AS (
    SELECT annee, SUM(montant_net) AS total_actif
    FROM {{ ref('core_bilan_comptable') }}
    WHERE type_bilan = 'Actif'
    GROUP BY annee
),
yoy AS (
    SELECT
        annee,
        total_actif,
        LAG(total_actif) OVER (ORDER BY annee) AS prev_total,
        SAFE_DIVIDE(total_actif - LAG(total_actif) OVER (ORDER BY annee), LAG(total_actif) OVER (ORDER BY annee)) * 100 AS pct_change
    FROM annual
)
SELECT annee, total_actif, prev_total, ROUND(pct_change, 2) AS pct_change
FROM yoy
WHERE ABS(pct_change) > 20
  AND prev_total IS NOT NULL
