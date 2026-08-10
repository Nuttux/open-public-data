{% macro assert_balance_equals(model_name, group_col, side_col, amount_col, side_a, side_b, tolerance_pct=0.001) %}
{# Verify two sides of a balance match within tolerance for each group #}
WITH totals AS (
    SELECT
        {{ group_col }},
        SUM(CASE WHEN {{ side_col }} = '{{ side_a }}' THEN {{ amount_col }} ELSE 0 END) AS total_a,
        SUM(CASE WHEN {{ side_col }} = '{{ side_b }}' THEN {{ amount_col }} ELSE 0 END) AS total_b
    FROM {{ ref(model_name) }}
    GROUP BY {{ group_col }}
)
SELECT {{ group_col }}, total_a, total_b,
       ABS(total_a - total_b) / NULLIF(total_a, 0) * 100 AS pct_diff
FROM totals
WHERE ABS(total_a - total_b) / NULLIF(GREATEST(total_a, total_b), 0) > {{ tolerance_pct }}
{% endmacro %}
