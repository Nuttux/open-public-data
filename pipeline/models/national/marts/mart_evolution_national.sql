{{
  config(
    enabled=true,
    materialized='table',
    tags=['national', 'marts']
  )
}}

/*
  Mart: évolution pluriannuelle (OFGL, 7 ans)

  Trajectoire financière de chaque commune : dépenses/recettes de fonctionnement,
  épargne brute, encours de dette, dépenses d'équipement — par année et par
  habitant. Déterministe (OFGL), sans enrichissement.
*/

WITH ofgl AS (
    SELECT
        code_insee,
        commune_nom,
        annee,
        MAX(population) AS population,
        MAX(CASE WHEN agregat = 'Dépenses de fonctionnement' THEN montant END) AS depenses_fonctionnement,
        MAX(CASE WHEN agregat = 'Recettes de fonctionnement' THEN montant END) AS recettes_fonctionnement,
        MAX(CASE WHEN agregat = 'Epargne brute' THEN montant END)               AS epargne_brute,
        MAX(CASE WHEN agregat = 'Encours de dette' THEN montant END)            AS encours_dette,
        MAX(CASE WHEN agregat = "Dépenses d'équipement" THEN montant END)       AS depenses_equipement
    FROM {{ ref('stg_ofgl_communes') }}
    GROUP BY code_insee, commune_nom, annee
)

SELECT
    code_insee,
    commune_nom,
    annee,
    population,
    depenses_fonctionnement,
    recettes_fonctionnement,
    epargne_brute,
    encours_dette,
    depenses_equipement,
    SAFE_DIVIDE(depenses_fonctionnement, population) AS depenses_fonctionnement_hab,
    SAFE_DIVIDE(recettes_fonctionnement, population) AS recettes_fonctionnement_hab,
    SAFE_DIVIDE(encours_dette, population)           AS encours_dette_hab,
    SAFE_DIVIDE(encours_dette, NULLIF(epargne_brute, 0)) AS capacite_desendettement
FROM ofgl
WHERE population > 0
