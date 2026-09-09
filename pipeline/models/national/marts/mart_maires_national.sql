{{
  config(
    enabled=true,
    materialized='table',
    tags=['national', 'marts']
  )
}}

/*
  Mart: qui décide — le maire et la taille du conseil, une ligne par commune.
  Publié : nom, prénom, fonction, date de début de fonction, nombre de
  conseillers et d'adjoints. Rien d'autre du répertoire.
*/

WITH elus AS (
    SELECT * FROM {{ ref('stg_rne_conseillers_municipaux') }}
),

maire AS (
    SELECT code_insee, nom, prenom, date_debut_fonction
    FROM elus
    WHERE fonction IS NOT NULL AND REGEXP_CONTAINS(fonction, r'^(?i)maire$')
    QUALIFY ROW_NUMBER() OVER (PARTITION BY code_insee ORDER BY date_debut_fonction DESC) = 1
),

conseil AS (
    SELECT
        code_insee,
        ANY_VALUE(commune_nom) AS commune_nom,
        COUNT(*) AS nb_conseillers,
        COUNTIF(REGEXP_CONTAINS(COALESCE(fonction, ''), r'(?i)adjoint')) AS nb_adjoints,
        MAX(date_debut_mandat) AS date_debut_mandat
    FROM elus
    GROUP BY code_insee
)

SELECT
    c.code_insee,
    c.commune_nom,
    m.nom       AS maire_nom,
    m.prenom    AS maire_prenom,
    m.date_debut_fonction AS maire_depuis,
    c.nb_conseillers,
    c.nb_adjoints,
    c.date_debut_mandat
FROM conseil c
LEFT JOIN maire m USING (code_insee)
