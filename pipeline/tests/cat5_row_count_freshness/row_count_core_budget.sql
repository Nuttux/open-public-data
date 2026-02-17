{{ config(tags=['row_count_freshness']) }}
{{ assert_row_count_stable('core_budget', 15000, 35000) }}
