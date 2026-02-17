{{ config(tags=['data_completeness'], severity='warn') }}
WITH stats AS (
    SELECT
        COUNT(*) AS total,
        COUNTIF(ode_arrondissement IS NOT NULL) AS geocoded,
        ROUND(COUNTIF(ode_arrondissement IS NOT NULL) * 100.0 / COUNT(*), 1) AS pct
    FROM {{ ref('core_ap_projets') }}
)
SELECT total, geocoded, pct AS geocoding_pct
FROM stats
WHERE pct < 40
