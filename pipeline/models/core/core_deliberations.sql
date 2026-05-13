-- =============================================================================
-- Core: deliberations Conseil de Paris
--
-- Source: stg_deliberations_sessions + stg_deliberations_delibs +
--         stg_deliberations_articles
-- Grain: une ligne par article (subvention individuelle d'une délibération)
-- avec session metadata + delib metadata jointe.
--
-- Une vue OBT pour le grain le plus fin. La déduplication (bypass article)
-- des subventions vers core_subventions reste à apply_deliberation_results.
-- =============================================================================

{{ config(materialized='table', schema='analytics', tags=['core','deliberations']) }}

WITH sessions AS (
    SELECT * FROM {{ ref('stg_deliberations_sessions') }}
),
delibs_raw AS (
    SELECT * FROM {{ ref('stg_deliberations_delibs') }}
),
delibs AS (
    -- Source files contain duplicate (session_id, delib_id) rows; dedupe.
    SELECT
        session_id,
        delib_id,
        ANY_VALUE(id_entite) AS id_entite,
        ANY_VALUE(title) AS title,
        ANY_VALUE(direction_id) AS direction_id,
        ANY_VALUE(direction_name) AS direction_name
    FROM delibs_raw
    GROUP BY session_id, delib_id
),
articles AS (
    SELECT * FROM {{ ref('stg_deliberations_articles') }}
)

SELECT
    a.session_id,
    s.generated_at AS session_generated_at,
    s.source AS session_source,
    s.nb_delibs AS session_nb_delibs,
    s.nb_articles AS session_nb_articles,
    a.delib_id,
    d.id_entite AS delib_id_entite,
    d.title AS delib_title,
    a.direction_id,
    a.direction_name,
    a.article_num,
    a.beneficiary,
    a.siret,
    a.amount_eur,
    a.amount_raw,
    a.motif,
    a.dossier
FROM articles a
LEFT JOIN sessions s USING (session_id)
LEFT JOIN delibs d USING (session_id, delib_id)
