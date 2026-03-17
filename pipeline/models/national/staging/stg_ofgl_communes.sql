{{
  config(
    materialized='view',
    tags=['national', 'staging']
  )
}}

/*
  Staging: OFGL Agrégats Communes

  Nettoie les agrégats OFGL pré-calculés.
  Contient les KPIs financiers pour chaque commune par année.
*/

WITH raw_ofgl AS (
    SELECT *
    FROM {{ source('national_raw', 'ofgl_communes') }}
),

communes AS (
    SELECT * FROM {{ ref('seed_communes_cibles') }}
)

SELECT
    c.code_insee,
    c.nom AS commune_nom,
    c.slug AS commune_slug,
    c.population AS population_seed,

    SAFE_CAST(COALESCE(o.exercice, o.annee) AS INT64) AS annee,

    -- Population OFGL (plus précise car annuelle)
    SAFE_CAST(o.population AS INT64) AS population_ofgl,

    -- Agrégats financiers (noms de colonnes OFGL standards)
    SAFE_CAST(COALESCE(o.produits_total, o.produits_de_fonctionnement) AS FLOAT64) AS produits_fonctionnement,
    SAFE_CAST(COALESCE(o.charges_total, o.charges_de_fonctionnement) AS FLOAT64) AS charges_fonctionnement,
    SAFE_CAST(o.produits_fiscaux AS FLOAT64) AS produits_fiscaux,
    SAFE_CAST(o.impots_locaux AS FLOAT64) AS impots_locaux,
    SAFE_CAST(COALESCE(o.dotation_globale_de_fonctionnement, o.dgf) AS FLOAT64) AS dgf,
    SAFE_CAST(COALESCE(o.charges_de_personnel, o.charges_personnel) AS FLOAT64) AS charges_personnel,
    SAFE_CAST(COALESCE(o.achats_et_charges_externes, o.achats_charges_externes) AS FLOAT64) AS achats_charges_externes,
    SAFE_CAST(COALESCE(o.charges_financieres, o.interets_de_la_dette) AS FLOAT64) AS charges_financieres,
    SAFE_CAST(COALESCE(o.subventions_versees, o.subventions_de_fonctionnement) AS FLOAT64) AS subventions_versees,

    -- Investissement
    SAFE_CAST(COALESCE(o.depenses_d_investissement, o.depenses_investissement) AS FLOAT64) AS depenses_investissement,
    SAFE_CAST(COALESCE(o.recettes_d_investissement, o.recettes_investissement) AS FLOAT64) AS recettes_investissement,

    -- Dette
    SAFE_CAST(COALESCE(o.encours_de_la_dette, o.encours_dette, o.dette_totale) AS FLOAT64) AS encours_dette,
    SAFE_CAST(COALESCE(o.annuite_de_la_dette, o.annuite_dette) AS FLOAT64) AS annuite_dette,

    -- Épargne
    SAFE_CAST(COALESCE(o.epargne_brute, o.autofinancement_brut) AS FLOAT64) AS epargne_brute,
    SAFE_CAST(COALESCE(o.epargne_nette, o.autofinancement_net) AS FLOAT64) AS epargne_nette,

    -- Ratios (si fournis par OFGL)
    SAFE_CAST(o.taux_d_epargne_brute AS FLOAT64) AS taux_epargne_brute,
    SAFE_CAST(o.ratio_de_desendettement AS FLOAT64) AS ratio_desendettement

FROM raw_ofgl o
INNER JOIN communes c
    ON CAST(COALESCE(o.code_commune, o.code_insee) AS STRING) = c.code_insee
