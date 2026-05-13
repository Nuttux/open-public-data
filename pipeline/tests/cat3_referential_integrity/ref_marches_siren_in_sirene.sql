{{ config(tags=['referential_integrity']) }}
{# Pour les marchés où fournisseur_siret est présent (14 chiffres), le SIREN
   correspondant DEVRAIT être dans core_sirene_companies.

   Ce test vérifie le taux de match. On tolère un taux non-100 % parce que
   le cache SIRENE est alimenté à la demande (pas exhaustif). On flag si
   le taux tombe sous 60 % — signal qu'enrich_sirene.py n'a pas tourné
   récemment ou que DECP a injecté beaucoup de nouveaux SIRETs. #}

WITH marches_avec_siret AS (
    SELECT DISTINCT SUBSTR(fournisseur_siret, 1, 9) AS siren
    FROM {{ ref('core_marches_publics') }}
    WHERE LENGTH(fournisseur_siret) = 14
),
matched AS (
    SELECT m.siren
    FROM marches_avec_siret m
    LEFT JOIN {{ ref('core_sirene_companies') }} s ON m.siren = s.siren
    WHERE s.siren IS NULL
),
ratio AS (
    SELECT
        (SELECT COUNT(*) FROM marches_avec_siret) AS total_distinct_sirens,
        (SELECT COUNT(*) FROM matched) AS unmatched_count,
        SAFE_DIVIDE(
            (SELECT COUNT(*) FROM matched),
            (SELECT COUNT(*) FROM marches_avec_siret)
        ) AS unmatched_ratio
)
SELECT * FROM ratio
WHERE unmatched_ratio > 0.40  -- > 40 % unmatched = warning
