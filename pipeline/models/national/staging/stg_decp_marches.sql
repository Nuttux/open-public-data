{{
  config(
    enabled=true,
    materialized='view',
    tags=['national', 'staging']
  )
}}

/*
  Staging: DECP marchés publics (national, ungated)

  Source = decp.parquet consolidé (data.gouv.fr), une ligne par marché×titulaire.
  On rattache chaque marché à la COMMUNE acheteuse par SIREN (9 premiers chiffres
  de acheteur_id) joint à l'univers OFGL — donc uniquement les marchés dont
  l'acheteur est une commune, attribués à son INSEE.

  Déduplication : une ligne par marché (uid) pour ne pas compter le montant
  plusieurs fois quand un marché a plusieurs titulaires (piège classique DECP).
  On garde le titulaire au plus gros montant comme titulaire principal.

  ⚠ Couverture DECP : ~50-70 % au national (seuil de publication 40 k€ HT). On
  l'AFFICHE (nb marchés, montant), sans prétendre à l'exhaustivité.
*/

WITH raw AS (
    SELECT
        CAST(uid AS STRING)                          AS marche_id,
        SUBSTR(CAST(acheteur_id AS STRING), 1, 9)    AS acheteur_siren,
        CAST(acheteur_nom AS STRING)                 AS acheteur_nom,
        CAST(objet AS STRING)                        AS objet,
        CAST(nature AS STRING)                       AS nature_marche,
        CAST(procedure AS STRING)                    AS type_procedure,
        CAST(codeCPV AS STRING)                      AS code_cpv,
        LEFT(CAST(codeCPV AS STRING), 2)             AS cpv_division,
        SAFE_CAST(montant AS FLOAT64)                AS montant,
        CAST(formePrix AS STRING)                    AS forme_prix,
        dateNotification                             AS date_notification,
        EXTRACT(YEAR FROM dateNotification)          AS annee,
        SAFE_CAST(dureeMois AS INT64)                AS duree_mois,
        CAST(titulaire_nom AS STRING)                AS titulaire_nom,
        CAST(titulaire_id AS STRING)                 AS titulaire_siret
    FROM {{ source('national_raw', 'decp_marches') }}
    WHERE montant > 0
      AND dateNotification IS NOT NULL
      AND EXTRACT(YEAR FROM dateNotification) BETWEEN 2018 AND 2025
),

-- Une ligne par marché (uid), titulaire principal = plus gros montant.
deduped AS (
    SELECT * FROM raw
    QUALIFY ROW_NUMBER() OVER (PARTITION BY marche_id ORDER BY montant DESC) = 1
),

commune_dim AS (
    SELECT DISTINCT siren, code_insee, commune_nom, dep_name, reg_name, population
    FROM {{ ref('stg_ofgl_communes') }}
)

SELECT
    d.marche_id,
    c.code_insee,
    c.commune_nom,
    c.dep_name,
    c.reg_name,
    c.population,
    d.acheteur_siren,
    d.acheteur_nom,
    d.objet,
    d.nature_marche,
    d.type_procedure,
    d.code_cpv,
    d.cpv_division,
    d.montant,
    d.forme_prix,
    d.date_notification,
    d.annee,
    d.duree_mois,
    d.titulaire_nom,
    d.titulaire_siret
FROM deduped d
INNER JOIN commune_dim c
    ON d.acheteur_siren = c.siren
