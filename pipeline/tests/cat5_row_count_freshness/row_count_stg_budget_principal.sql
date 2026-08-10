{{ config(tags=['row_count_freshness']) }}
{{ assert_row_count_stable('stg_budget_principal', 15000, 35000) }}
