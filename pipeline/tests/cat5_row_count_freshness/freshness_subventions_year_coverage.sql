{{ config(tags=['row_count_freshness']) }}
-- 2020/2021 exclus: Paris Open Data a anonymisé ces années (cf. commit bca57fb).
-- 2025: exclu du test (partiel, couvert par un autre test).
{{ assert_year_coverage('core_subventions', 'annee', [2018, 2019, 2022, 2023, 2024]) }}
