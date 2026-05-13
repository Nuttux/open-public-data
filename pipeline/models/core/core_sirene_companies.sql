-- =============================================================================
-- Core: cache SIRENE entreprises
--
-- Source: stg_sirene_companies
-- Grain: une ligne par SIREN
--
-- Aucune transformation - sert de couche core canonique pour les marts qui
-- joignent sur SIREN (mart_marches_fournisseurs, mart_projet_marches).
-- =============================================================================

{{ config(materialized='table', schema='analytics', tags=['core','sirene']) }}

SELECT * FROM {{ ref('stg_sirene_companies') }}
