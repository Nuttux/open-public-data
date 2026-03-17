{{
  config(
    materialized='table',
    tags=['national', 'marts']
  )
}}

/*
  Mart: Bilan / Patrimoine National

  KPIs patrimoine par ville et année pour le Sankey bilan.
*/

WITH bilan AS (
    SELECT *
    FROM {{ ref('core_bilan_national') }}
),

-- Agrégats par catégorie bilan
by_category AS (
    SELECT
        commune_slug,
        commune_nom,
        population,
        annee,
        categorie_bilan,
        sous_categorie,
        SUM(montant) AS montant

    FROM bilan
    GROUP BY ALL
),

-- KPIs calculés
kpis AS (
    SELECT
        commune_slug,
        commune_nom,
        population,
        annee,

        SUM(CASE WHEN categorie_bilan = 'Actif' THEN montant ELSE 0 END) AS actif_total,
        SUM(CASE WHEN categorie_bilan = 'Passif' THEN montant ELSE 0 END) AS passif_total,
        SUM(CASE WHEN sous_categorie = 'Emprunts et dettes' THEN montant ELSE 0 END) AS dette_financiere,
        SUM(CASE WHEN sous_categorie IN ('Dotations et fonds', 'Résultat reporté', 'Résultat exercice', 'Subventions investissement') THEN montant ELSE 0 END) AS fonds_propres,
        SUM(CASE WHEN sous_categorie = 'Trésorerie' AND categorie_bilan = 'Actif' THEN montant ELSE 0 END) AS tresorerie,
        SUM(CASE WHEN sous_categorie IN ('Immobilisations corporelles', 'Immobilisations incorporelles', 'Immobilisations en cours') THEN montant ELSE 0 END) AS immobilisations

    FROM by_category
    GROUP BY commune_slug, commune_nom, population, annee
)

SELECT
    k.*,

    -- Ratios
    ROUND(SAFE_DIVIDE(k.dette_financiere, k.fonds_propres) * 100, 2) AS ratio_endettement,
    ROUND(SAFE_DIVIDE(k.fonds_propres, k.passif_total) * 100, 2) AS pct_fonds_propres,
    ROUND(SAFE_DIVIDE(k.dette_financiere, k.population), 2) AS dette_par_hab

FROM kpis k
ORDER BY k.commune_slug, k.annee
