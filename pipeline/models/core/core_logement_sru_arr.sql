{{ config(materialized='table', schema='analytics', tags=['core', 'logement']) }}

-- Taux SRU par arrondissement et par année (grain : arrondissement × année).
-- Le taux est dérivé ici (couche core), le seed ne porte que les comptages bruts.

SELECT
    arrondissement,
    label,
    annee,
    logements_sociaux,
    residences_principales,
    ROUND(100.0 * logements_sociaux / NULLIF(residences_principales, 0), 1) AS taux_sru_pct,
    source,
    source_url,
    licence
FROM {{ ref('stg_apur_sru') }}
WHERE residences_principales > 0
