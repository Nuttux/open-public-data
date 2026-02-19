{{ config(tags=['enrichment_quality']) }}
{# Known non-union organizations should NOT be classified as "Administration > Syndicats" #}
{# This catches the FOND/FONDATION → "Administration > Syndicats" regex bug #}
SELECT
    annee,
    beneficiaire_normalise,
    ode_thematique,
    ode_source_thematique,
    SUM(montant) AS montant_total
FROM {{ ref('core_subventions') }}
WHERE ode_thematique LIKE '%Syndicats%'
  AND (
    REGEXP_CONTAINS(beneficiaire_normalise, r'(?i)FONDATION|FONDS|FONCIERE')
    OR REGEXP_CONTAINS(beneficiaire_normalise, r'(?i)CROIX.*SIMON|LEOPOLD BELLAN|ROTHSCHILD')
    OR REGEXP_CONTAINS(beneficiaire_normalise, r'(?i)ABBE PIERRE|SHOAH|SIDA|ARTS?|CULTURE')
  )
GROUP BY 1, 2, 3, 4
