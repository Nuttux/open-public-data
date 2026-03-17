{{
  config(
    materialized='view',
    tags=['national', 'staging']
  )
}}

/*
  Staging: Subventions Nationales (SCDL)

  Nettoie les données de subventions > 23k€ issues du schéma SCDL.
*/

WITH raw_subv AS (
    SELECT *
    FROM {{ source('national_raw', 'subventions_nationales') }}
)

SELECT
    -- Commune
    CAST(_commune_slug AS STRING) AS commune_slug,
    CAST(_commune_nom AS STRING) AS commune_nom,

    -- Attributaire
    CAST(COALESCE(nomattribuant, nom_attribuant) AS STRING) AS nom_attribuant,
    CAST(COALESCE(idattribuant, id_attribuant) AS STRING) AS siret_attribuant,

    -- Bénéficiaire
    CAST(COALESCE(nombeneficiaire, nom_beneficiaire) AS STRING) AS nom_beneficiaire,
    CAST(COALESCE(idbeneficiaire, id_beneficiaire) AS STRING) AS siret_beneficiaire,
    UPPER(TRIM(CAST(COALESCE(nombeneficiaire, nom_beneficiaire) AS STRING))) AS beneficiaire_normalise,

    -- Subvention
    CAST(objet AS STRING) AS objet,
    SAFE_CAST(montant AS FLOAT64) AS montant,
    CAST(nature AS STRING) AS nature_subvention,

    -- Dates
    CAST(COALESCE(dateconvention, date_convention) AS STRING) AS date_convention,
    EXTRACT(YEAR FROM SAFE.PARSE_DATE('%Y-%m-%d',
        LEFT(CAST(COALESCE(dateconvention, date_convention) AS STRING), 10)
    )) AS annee,

    -- Conditions
    CAST(COALESCE(conditionsversement, conditions_versement) AS STRING) AS conditions_versement,
    SAFE_CAST(COALESCE(pourcentagesubvention, pourcentage_subvention) AS FLOAT64) AS pourcentage_subvention

FROM raw_subv
WHERE SAFE_CAST(montant AS FLOAT64) > 0
