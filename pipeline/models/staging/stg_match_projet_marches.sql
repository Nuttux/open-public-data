-- Wrapper minimal du seed. Existe pour respecter la règle « tout seed
-- entre par stg ». Aucune transformation : les types et le contenu
-- proviennent de pipeline/seeds/seed_match_projet_marches.csv (column_types déclarés
-- dans dbt_project.yml).

{{ config(materialized='view', schema='staging', tags=['staging','seed-wrapper']) }}

SELECT * FROM {{ ref('seed_match_projet_marches') }}
