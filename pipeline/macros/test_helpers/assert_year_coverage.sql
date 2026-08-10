{% macro assert_year_coverage(model_name, year_column, expected_years) %}
{# Verify all expected years are present in the model #}
WITH expected AS (
    SELECT annee FROM UNNEST([{{ expected_years | join(', ') }}]) AS annee
),
actual AS (
    SELECT DISTINCT {{ year_column }} AS annee FROM {{ ref(model_name) }}
)
SELECT e.annee AS missing_year
FROM expected e
LEFT JOIN actual a ON e.annee = a.annee
WHERE a.annee IS NULL
{% endmacro %}
