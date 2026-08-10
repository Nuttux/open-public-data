-- Plausibility guard on the Census population figures used for
-- per-resident scaling: the US national resident population 2020-2025 must
-- sit in the 320M-360M band (Vintage 2025: 331.6M base → 341.8M July 2025).
-- Catches unit errors, truncated syncs, or a wrong row slipping through
-- the SUMLEV filter.
{{ config(tags=['us', 'data_completeness']) }}

SELECT
    year,
    population
FROM {{ ref('core_us_population') }}
WHERE population < 320000000
   OR population > 360000000
