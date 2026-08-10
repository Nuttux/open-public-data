{{ config(tags=['data_completeness']) }}
WITH stats AS (
    SELECT
        COUNT(*) AS total,
        COUNTIF(latitude IS NOT NULL AND longitude IS NOT NULL
                AND latitude BETWEEN 48.8 AND 48.95
                AND longitude BETWEEN 2.2 AND 2.5) AS geolocated,
        ROUND(COUNTIF(latitude IS NOT NULL AND longitude IS NOT NULL) * 100.0 / COUNT(*), 1) AS pct
    FROM {{ ref('core_logements_sociaux') }}
)
SELECT total, geolocated, pct
FROM stats
WHERE pct < 95
