{% macro assert_total_matches(model_a, model_b, amount_col_a='montant', amount_col_b='montant', tolerance=1.0, filter_a='1=1', filter_b='1=1') %}
{# Compare SUM(amount) between two models within a tolerance #}
SELECT a_total, b_total, ABS(a_total - b_total) AS difference
FROM (
    SELECT
        (SELECT COALESCE(SUM({{ amount_col_a }}), 0) FROM {{ ref(model_a) }} WHERE {{ filter_a }}) AS a_total,
        (SELECT COALESCE(SUM({{ amount_col_b }}), 0) FROM {{ ref(model_b) }} WHERE {{ filter_b }}) AS b_total
)
WHERE ABS(a_total - b_total) > {{ tolerance }}
{% endmacro %}
