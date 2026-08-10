{{
  config(
    materialized='table',
    tags=['national', 'marts']
  )
}}

/*
  Mart: Évolution pluriannuelle par ville

  Tendances budget sur plusieurs années, avec section Fonctionnement/Investissement.
*/

WITH budget AS (
    SELECT *
    FROM {{ ref('core_budget_national') }}
),

yearly AS (
    SELECT
        commune_slug,
        commune_nom,
        population,
        annee,

        -- Totaux
        SUM(CASE WHEN sens_flux = 'Recette' THEN montant_total ELSE 0 END) AS recettes_totales,
        SUM(CASE WHEN sens_flux = 'Depense' THEN montant_total ELSE 0 END) AS depenses_totales,

        -- Par section
        SUM(CASE WHEN section = 'Fonctionnement' AND sens_flux = 'Recette' THEN montant_total ELSE 0 END) AS recettes_fonctionnement,
        SUM(CASE WHEN section = 'Fonctionnement' AND sens_flux = 'Depense' THEN montant_total ELSE 0 END) AS depenses_fonctionnement,
        SUM(CASE WHEN section = 'Investissement' AND sens_flux = 'Recette' THEN montant_total ELSE 0 END) AS recettes_investissement,
        SUM(CASE WHEN section = 'Investissement' AND sens_flux = 'Depense' THEN montant_total ELSE 0 END) AS depenses_investissement,

        -- Par catégorie dépense
        SUM(CASE WHEN sankey_group = 'Personnel' AND sens_flux = 'Depense' THEN montant_total ELSE 0 END) AS depenses_personnel,
        SUM(CASE WHEN sankey_group = 'Fonctionnement courant' AND sens_flux = 'Depense' THEN montant_total ELSE 0 END) AS depenses_fonctionnement_courant,
        SUM(CASE WHEN sankey_group = 'Transferts & subventions' AND sens_flux = 'Depense' THEN montant_total ELSE 0 END) AS depenses_transferts,
        SUM(CASE WHEN sankey_group = 'Charges financières' AND sens_flux = 'Depense' THEN montant_total ELSE 0 END) AS depenses_financieres,
        SUM(CASE WHEN sankey_group = 'Investissements' AND sens_flux = 'Depense' THEN montant_total ELSE 0 END) AS depenses_investissements_directs,

        -- Par catégorie recette
        SUM(CASE WHEN sankey_group = 'Fiscalité' AND sens_flux = 'Recette' THEN montant_total ELSE 0 END) AS recettes_fiscalite,
        SUM(CASE WHEN sankey_group = 'Dotations État' AND sens_flux = 'Recette' THEN montant_total ELSE 0 END) AS recettes_dotations

    FROM budget
    GROUP BY ALL
)

SELECT
    *,

    -- Métriques dérivées
    recettes_totales - depenses_totales AS solde,
    recettes_fonctionnement - depenses_fonctionnement AS epargne_brute,

    -- Variation N/N-1
    LAG(recettes_totales) OVER (PARTITION BY commune_slug ORDER BY annee) AS recettes_n_1,
    LAG(depenses_totales) OVER (PARTITION BY commune_slug ORDER BY annee) AS depenses_n_1

FROM yearly
ORDER BY commune_slug, annee
