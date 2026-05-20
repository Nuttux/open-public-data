{{ config(tags=['row_count_freshness']) }}
-- Couverture complète 2018-2024 :
-- 2018, 2019, 2022-2024 viennent de l'OpenData (Annexe CA, noms présents).
-- 2020 et 2021 sont ré-injectés depuis l'Annexe B8.1.1 PDF du CA
-- (raw.pdf_subventions_b811_paris) — l'OpenData expose les montants mais
-- avec nom = NULL sur 100 % des lignes pour ces deux exercices.
-- 2025: exclu (partiel, couvert par un autre test).
{{ assert_year_coverage('core_subventions', 'annee', [2018, 2019, 2020, 2021, 2022, 2023, 2024]) }}
