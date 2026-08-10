{{ config(tags=['accounting_balance'], severity='warn') }}
WITH annual AS (
    SELECT
        annee,
        SUM(CASE WHEN sens_flux = 'Recette' THEN montant ELSE 0 END) AS total_recettes,
        SUM(CASE WHEN sens_flux = 'Dépense' THEN montant ELSE 0 END) AS total_depenses
    FROM {{ ref('core_budget') }}
    GROUP BY annee
)
SELECT annee, total_recettes, total_depenses,
       ABS(total_recettes - total_depenses) / NULLIF(total_depenses, 0) * 100 AS pct_difference
FROM annual
WHERE ABS(total_recettes - total_depenses) / NULLIF(total_depenses, 0) > 0.10
