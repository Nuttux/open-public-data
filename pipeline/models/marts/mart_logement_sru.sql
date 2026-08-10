{{ config(materialized='view', schema='marts', tags=['mart', 'logement', 'thin']) }}

SELECT
    arrondissement,
    label,
    annee,
    logements_sociaux,
    residences_principales,
    taux_sru_pct,
    source,
    source_url,
    licence
FROM {{ ref('core_logement_sru_arr') }}
