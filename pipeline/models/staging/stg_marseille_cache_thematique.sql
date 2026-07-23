-- Wrapper minimal du seed Marseille thematique. Existe pour respecter la règle
-- « tout seed entre par stg ». Aucune transformation : types et contenu viennent
-- de pipeline/seeds/cities/marseille/seed_marseille_cache_thematique.csv
-- (peuplé par scripts/enrich/enrich_thematique_marseille.py).

{{ config(materialized='view', schema='staging', tags=['staging', 'seed-wrapper', 'marseille']) }}

SELECT * FROM {{ ref('seed_marseille_cache_thematique') }}
