{{ config(tags=['referential_integrity']) }}
SELECT DISTINCT s.annee
FROM {{ ref('mart_sankey') }} s
LEFT JOIN (SELECT DISTINCT annee FROM {{ ref('core_budget') }}) b ON s.annee = b.annee
WHERE b.annee IS NULL
