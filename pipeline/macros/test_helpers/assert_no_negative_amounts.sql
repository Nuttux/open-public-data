{% macro assert_no_negative_amounts(model_name, amount_col='montant') %}
{# Verify no rows have negative amounts #}
SELECT COUNT(*) AS negative_count
FROM {{ ref(model_name) }}
WHERE {{ amount_col }} < 0
HAVING COUNT(*) > 0
{% endmacro %}
