{{
  config(
    materialized='table',
    tags=['national', 'marts']
  )
}}

/*
  Mart: Sankey Budget National

  Agrège les données budget par (commune_slug, annee, sankey_group, sens_flux)
  pour produire les nodes et links du Sankey.

  Format de sortie compatible avec BudgetData TypeScript.
*/

WITH budget AS (
    SELECT *
    FROM {{ ref('core_budget_national') }}
    WHERE section IN ('Fonctionnement', 'Investissement')
),

-- Agrégation par sankey_group
by_group AS (
    SELECT
        commune_slug,
        commune_nom,
        population,
        annee,
        sankey_group,
        sens_flux,
        section,

        SUM(montant_total) AS montant

    FROM budget
    GROUP BY ALL
),

-- Totaux par ville/année
totals AS (
    SELECT
        commune_slug,
        annee,
        SUM(CASE WHEN sens_flux = 'Recette' THEN montant ELSE 0 END) AS total_recettes,
        SUM(CASE WHEN sens_flux = 'Depense' THEN montant ELSE 0 END) AS total_depenses

    FROM by_group
    WHERE sens_flux != 'Both'
    GROUP BY commune_slug, annee
)

SELECT
    g.commune_slug,
    g.commune_nom,
    g.population,
    g.annee,
    g.sankey_group,
    g.sens_flux,
    g.section,
    g.montant,

    t.total_recettes,
    t.total_depenses,
    t.total_recettes - t.total_depenses AS solde,

    -- Pourcentage du total
    CASE
        WHEN g.sens_flux = 'Recette' AND t.total_recettes > 0
            THEN ROUND(g.montant / t.total_recettes * 100, 2)
        WHEN g.sens_flux = 'Depense' AND t.total_depenses > 0
            THEN ROUND(g.montant / t.total_depenses * 100, 2)
        ELSE 0
    END AS pct_total

FROM by_group g
LEFT JOIN totals t ON g.commune_slug = t.commune_slug AND g.annee = t.annee
WHERE g.montant > 0
ORDER BY g.commune_slug, g.annee, g.sens_flux, g.montant DESC
