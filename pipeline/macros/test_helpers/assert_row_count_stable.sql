{% macro assert_row_count_stable(model_name, min_rows, max_rows) %}
{# Verify row count of a model is within expected range #}
SELECT row_count
FROM (SELECT COUNT(*) AS row_count FROM {{ ref(model_name) }})
WHERE row_count < {{ min_rows }} OR row_count > {{ max_rows }}
{% endmacro %}
