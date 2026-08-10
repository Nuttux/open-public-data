{{
  config(
    materialized='table',
    tags=['national', 'marts']
  )
}}

/*
  Mart: Benchmarking inter-villes

  KPIs financiers comparés pour les 5 plus grandes villes.
  Source principale: OFGL (agrégats pré-calculés).
  Fallback: DGFiP balances pour les métriques manquantes.
*/

WITH ofgl AS (
    SELECT *
    FROM {{ ref('stg_ofgl_communes') }}
    WHERE annee IS NOT NULL
),

communes AS (
    SELECT * FROM {{ ref('seed_communes_cibles') }}
),

-- Calculer les KPIs par habitant
kpis AS (
    SELECT
        o.commune_slug,
        o.commune_nom,
        o.annee,
        COALESCE(o.population_ofgl, o.population_seed) AS population,

        -- Totaux absolus
        o.produits_fonctionnement,
        o.charges_fonctionnement,
        o.produits_fiscaux,
        o.dgf,
        o.charges_personnel,
        o.depenses_investissement,
        o.encours_dette,
        o.epargne_brute,
        o.epargne_nette,
        o.annuite_dette,

        -- Par habitant
        ROUND(SAFE_DIVIDE(o.produits_fonctionnement, COALESCE(o.population_ofgl, o.population_seed)), 2)
            AS recettes_par_hab,
        ROUND(SAFE_DIVIDE(o.charges_fonctionnement, COALESCE(o.population_ofgl, o.population_seed)), 2)
            AS depenses_par_hab,
        ROUND(SAFE_DIVIDE(o.encours_dette, COALESCE(o.population_ofgl, o.population_seed)), 2)
            AS dette_par_hab,
        ROUND(SAFE_DIVIDE(o.depenses_investissement, COALESCE(o.population_ofgl, o.population_seed)), 2)
            AS investissement_par_hab,
        ROUND(SAFE_DIVIDE(o.charges_personnel, COALESCE(o.population_ofgl, o.population_seed)), 2)
            AS personnel_par_hab,
        ROUND(SAFE_DIVIDE(o.produits_fiscaux, COALESCE(o.population_ofgl, o.population_seed)), 2)
            AS fiscalite_par_hab,

        -- Ratios
        o.taux_epargne_brute,
        ROUND(SAFE_DIVIDE(o.charges_personnel, o.charges_fonctionnement) * 100, 2)
            AS pct_personnel,
        ROUND(SAFE_DIVIDE(o.encours_dette, o.produits_fonctionnement) * 100, 2)
            AS ratio_dette_recettes,
        o.ratio_desendettement

    FROM ofgl o
)

SELECT
    k.*,

    -- Rankings par année (1 = meilleur pour les ratios positifs)
    RANK() OVER (PARTITION BY k.annee ORDER BY k.recettes_par_hab DESC)
        AS rank_recettes_par_hab,
    RANK() OVER (PARTITION BY k.annee ORDER BY k.depenses_par_hab ASC)
        AS rank_depenses_par_hab,
    RANK() OVER (PARTITION BY k.annee ORDER BY k.dette_par_hab ASC)
        AS rank_dette_par_hab,
    RANK() OVER (PARTITION BY k.annee ORDER BY k.investissement_par_hab DESC)
        AS rank_investissement_par_hab,
    RANK() OVER (PARTITION BY k.annee ORDER BY k.taux_epargne_brute DESC NULLS LAST)
        AS rank_epargne

FROM kpis k
ORDER BY k.annee DESC, k.commune_slug
