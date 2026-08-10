-- =============================================================================
-- Core: US national resident population, one row per estimate year
--
-- Source: stg_us_census_population (Census PEP Vintage 2025, national row)
-- Grain:  year (July 1 estimate date), 2020-2025.
--
-- Used for per-resident scaling of national amounts — same pattern as the
-- INSEE population seeds on the France side. source/source_url flow from
-- the sync (configs/countries/us.yaml), not from code.
-- =============================================================================

WITH national AS (
    SELECT *
    FROM {{ ref('stg_us_census_population') }}
)

{% for year in range(2020, 2026) %}
SELECT
    {{ year }}                    AS year,
    DATE({{ year }}, 7, 1)        AS as_of_date,
    popestimate_{{ year }}        AS population,
    'Vintage 2025'                AS vintage,
    source,
    source_url,
    _synced_at
FROM national
{% if not loop.last %}UNION ALL{% endif %}
{% endfor %}
