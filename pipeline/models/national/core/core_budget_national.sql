{{
  config(
    materialized='table',
    tags=['national', 'core']
  )
}}

/*
  Core: Budget National par ville

  Table dénormalisée combinant les balances DGFiP avec la nomenclature M57.
  Grain: (commune_slug, annee, sankey_group, section, sens_flux)

  Produit les agrégats nécessaires pour le Sankey et les tendances.
*/

WITH balances AS (
    SELECT *
    FROM {{ ref('stg_dgfip_balances') }}
    WHERE section IN ('Fonctionnement', 'Investissement')
      AND sens_flux IN ('Depense', 'Recette', 'Both')
      AND montant_net > 0
),

nomenclature AS (
    SELECT * FROM {{ ref('seed_nomenclature_m57') }}
),

-- Joindre avec nomenclature M57
enriched AS (
    SELECT
        b.commune_slug,
        b.commune_nom,
        b.code_insee,
        b.population,
        b.annee,
        b.compte,
        b.nature_prefix,
        b.classe_compte,
        b.section,
        b.sens_flux,
        b.montant_net,
        b.libelle_compte,

        -- Catégorie depuis nomenclature M57
        COALESCE(n.category_fr, 'Autres opérations') AS category_fr,
        COALESCE(n.category_en, 'Other operations') AS category_en,
        COALESCE(n.sankey_group, 'Autre') AS sankey_group

    FROM balances b
    LEFT JOIN nomenclature n ON b.nature_prefix = n.nature_prefix
)

SELECT
    commune_slug,
    commune_nom,
    code_insee,
    population,
    annee,
    section,
    sens_flux,
    sankey_group,
    category_fr,
    category_en,

    SUM(montant_net) AS montant_total,
    COUNT(DISTINCT compte) AS nb_comptes

FROM enriched
GROUP BY ALL
