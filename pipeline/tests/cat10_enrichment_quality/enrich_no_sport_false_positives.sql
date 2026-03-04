{{ config(tags=['enrichment_quality']) }}
{# Known non-sport organizations should NOT be classified as "Sport" #}
{# This catches the ASS/ASSOCIATION → "Sport > Clubs sportifs" regex bug #}
SELECT
    annee,
    beneficiaire_normalise,
    ode_thematique,
    ode_source_thematique,
    SUM(montant) AS montant_total
FROM {{ ref('core_subventions') }}
WHERE ode_thematique LIKE '%Sport%'
  AND ode_source_thematique = 'pattern'
  AND (
    REGEXP_CONTAINS(beneficiaire_normalise, r'(?i)AURORE|PASTEUR|THEATRE|TERRE D.ASILE|EMMAUS|HOPITAUX|CROIX.ROUGE')
    OR REGEXP_CONTAINS(beneficiaire_normalise, r'(?i)SOUTIEN.*THEATRE|FAMILIAL|DROIT.*INITIATIVE|HANDICAP')
    OR REGEXP_CONTAINS(beneficiaire_normalise, r'(?i)AIRPARIF|POLLUT|CINEMATHEQUE|CINEMA|ALCOOL|ADDICT')
    OR REGEXP_CONTAINS(beneficiaire_normalise, r'(?i)LOGEMENT|ENFANTS?|CRECHE|PRIMO LEVI|BASILIADE')
  )
GROUP BY 1, 2, 3, 4
