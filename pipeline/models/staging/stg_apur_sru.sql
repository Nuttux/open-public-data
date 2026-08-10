{{ config(materialized='view', schema='staging', tags=['staging', 'logement']) }}

-- Inventaire SRU par arrondissement (APUR, 2001-2019).
-- Seed figé : le millésime 2019 est la dernière ventilation par
-- arrondissement publiée en open data. Regénération : scripts/enrich/build_seed_apur_sru.py

SELECT
    arrondissement,
    label,
    annee,
    logements_sociaux,
    residences_principales,
    source,
    source_url,
    licence
FROM {{ ref('seed_apur_sru_2001_2019') }}
