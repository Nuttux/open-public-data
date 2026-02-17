{{ config(tags=['row_count_freshness']) }}
{{ assert_year_coverage('core_subventions', 'annee', [2018, 2019, 2020, 2021, 2022, 2023, 2024]) }}
