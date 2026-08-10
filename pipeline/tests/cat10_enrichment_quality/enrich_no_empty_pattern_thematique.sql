{{ config(tags=['enrichment_quality']) }}
{# Pattern-sourced classifications should never have empty thematique #}
{# This catches the empty seed row bug (pattern="" matches everything) #}
SELECT
    annee,
    beneficiaire_normalise,
    ode_thematique,
    ode_source_thematique,
    montant
FROM {{ ref('core_subventions') }}
WHERE ode_source_thematique = 'pattern'
  AND (ode_thematique IS NULL OR TRIM(ode_thematique) = '')
LIMIT 10
