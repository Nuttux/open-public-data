-- =============================================================================
-- Staging: cache SIRENE entreprises (Paris-pertinent)
--
-- Source: raw.sirene_companies_paris (chargé par sync_sirene_companies.py
-- depuis public/data/enrichment/sirene_companies.json, lui-même alimenté
-- par enrich_sirene.py via recherche-entreprises.api.gouv.fr).
--
-- Grain: une ligne par SIREN.
-- =============================================================================

{{ config(materialized='view', schema='staging', tags=['staging','sirene']) }}

SELECT
    siren,
    nom,
    forme_juridique,
    SAFE_CAST(nombre_etablissements AS INT64) AS nombre_etablissements,
    SAFE_CAST(nombre_etablissements_ouverts AS INT64) AS nombre_etablissements_ouverts,
    activite_principale,
    libelle_activite,
    commune,
    code_postal,
    adresse,
    tranche_effectifs,
    date_creation,
    etat
FROM {{ source('paris_raw', 'sirene_companies_paris') }}
