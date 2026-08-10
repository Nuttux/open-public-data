-- Census SF-city population plausibility: the Vintage 2025 July 1 estimates
-- put San Francisco between ~813k (2022 trough) and ~880k (2020 base).
-- Guard the stg filter (SUMLEV 162 / STATE 06 / PLACE 67000) against
-- silently matching the wrong geography or a schema change upstream:
-- exactly one row per year 2020-2025, each within a generous 700k-1M band.
{{ config(tags=['us', 'anomaly_detection']) }}

WITH pop AS (
    SELECT year, COUNT(*) AS n_rows, MIN(population) AS population
    FROM {{ ref('core_us_sf_population') }}
    GROUP BY year
)

SELECT *
FROM pop
WHERE n_rows != 1
   OR population < 700000
   OR population > 1000000
