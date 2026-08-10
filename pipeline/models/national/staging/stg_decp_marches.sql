{{
  config(
    materialized='view',
    tags=['national', 'staging']
  )
}}

/*
  Staging: DECP Marchés Publics

  Nettoie les données DECP consolidées.
  Chaque ligne = 1 marché public notifié.
*/

WITH raw_decp AS (
    SELECT *
    FROM {{ source('national_raw', 'decp_marches') }}
)

SELECT
    -- Identifiant
    CAST(COALESCE(uid, id) AS STRING) AS marche_id,

    -- Commune
    CAST(_commune_slug AS STRING) AS commune_slug,
    CAST(_commune_nom AS STRING) AS commune_nom,

    -- Acheteur
    CAST(COALESCE(acheteur_id, siretacheteur) AS STRING) AS acheteur_siret,
    CAST(COALESCE(acheteur_nom, nomacheteur) AS STRING) AS acheteur_nom,

    -- Marché
    CAST(objet AS STRING) AS objet,
    CAST(nature AS STRING) AS nature_marche,
    CAST(procedure AS STRING) AS type_procedure,
    CAST(COALESCE(codecpv, code_cpv) AS STRING) AS code_cpv,
    LEFT(CAST(COALESCE(codecpv, code_cpv) AS STRING), 2) AS cpv_division,

    -- Montant
    SAFE_CAST(montant AS FLOAT64) AS montant,
    CAST(COALESCE(formeprix, forme_prix) AS STRING) AS forme_prix,

    -- Dates
    SAFE_CAST(COALESCE(datenotification, date_notification) AS STRING) AS date_notification,
    EXTRACT(YEAR FROM SAFE.PARSE_DATE('%Y-%m-%d',
        LEFT(CAST(COALESCE(datenotification, date_notification) AS STRING), 10)
    )) AS annee_notification,

    -- Durée
    SAFE_CAST(COALESCE(dureemois, duree_mois) AS INT64) AS duree_mois,

    -- Titulaire (premier titulaire)
    CAST(COALESCE(titulaire_denominationsociale, titulaires) AS STRING) AS titulaire_nom,
    CAST(COALESCE(titulaire_id, titulaire_siret) AS STRING) AS titulaire_siret

FROM raw_decp
WHERE SAFE_CAST(montant AS FLOAT64) > 0
