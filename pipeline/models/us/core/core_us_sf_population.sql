-- =============================================================================
-- Core: San Francisco resident population, one row per estimate year
--
-- Source: stg_us_sf_population (Census PEP Vintage 2025, SF city row —
--         SUMLEV 162 / STATE 06 / PLACE 67000)
-- Grain:  year (July 1 estimate date), 2020-2025.
--
-- Used for per-resident scaling of SF amounts — same pattern as
-- core_us_population at national scale. Note the happy timing accident:
-- SF fiscal year N ends June 30 of year N, so the July 1 estimate of year
-- N is effectively the FY N year-end population. source/source_url flow
-- from the sync (configs/countries/us.yaml), not from code.
-- =============================================================================

WITH sf AS (
    SELECT *
    FROM {{ ref('stg_us_sf_population') }}
)

{% for year in range(2020, 2026) %}
SELECT
    {{ year }}                    AS year,
    DATE({{ year }}, 7, 1)        AS as_of_date,
    popestimate_{{ year }}        AS population,
    'Vintage 2025'                AS vintage,
    area_name,
    source,
    source_url,
    _synced_at
FROM sf
{% if not loop.last %}UNION ALL{% endif %}
{% endfor %}
