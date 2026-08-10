{{ config(tags=['enrichment_quality']) }}
{# Real trade unions (CFDT, CGT, FO) should NOT be classified as Logement/Copropriétés #}
SELECT
    annee,
    beneficiaire_normalise,
    ode_thematique,
    ode_source_thematique,
    SUM(montant) AS montant_total
FROM {{ ref('core_subventions') }}
WHERE REGEXP_CONTAINS(beneficiaire_normalise, r'(?i)\bCFDT\b|\bCGT\b|FORCE OUVRIERE')
  AND ode_thematique NOT LIKE '%Administration%'
GROUP BY 1, 2, 3, 4
