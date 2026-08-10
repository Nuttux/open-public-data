{{ config(tags=['cross_layer']) }}
WITH mart_totals AS (
    SELECT annee, sens_flux, montant_total
    FROM {{ ref('mart_evolution_budget') }}
    WHERE vue = 'par_sens' AND type_budget = 'execute'
),
core_totals AS (
    SELECT annee, sens_flux, SUM(montant) AS core_total
    FROM {{ ref('core_budget') }}
    GROUP BY annee, sens_flux
)
SELECT m.annee, m.sens_flux, m.montant_total AS mart_total, c.core_total,
       ABS(m.montant_total - c.core_total) AS diff
FROM mart_totals m
JOIN core_totals c ON m.annee = c.annee AND m.sens_flux = c.sens_flux
WHERE ABS(m.montant_total - c.core_total) > 1.0
