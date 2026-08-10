{{ config(tags=['data_completeness'], severity='warn') }}
WITH stats AS (
    SELECT
        COUNT(*) AS total,
        COUNTIF(siret IS NOT NULL AND LENGTH(siret) = 14) AS with_siret,
        ROUND(COUNTIF(siret IS NOT NULL AND LENGTH(siret) = 14) * 100.0 / COUNT(*), 1) AS pct
    FROM {{ ref('stg_associations') }}
)
SELECT total, with_siret, pct AS siret_pct
FROM stats
WHERE pct < 85
