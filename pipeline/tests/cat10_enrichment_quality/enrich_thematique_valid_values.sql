{{ config(tags=['enrichment_quality'], severity='warn') }}
{# All thematique values should be from the expected taxonomy #}
{# Returns any unexpected thematique values #}
SELECT
    ode_thematique,
    ode_source_thematique,
    COUNT(*) AS nb_rows,
    SUM(montant) AS montant_total
FROM {{ ref('core_subventions') }}
WHERE donnees_disponibles = TRUE
  AND ode_thematique NOT IN (
    'Social - Solidarité', 'Social - Petite enfance', 'Social',
    'Éducation', 'Culture', 'Sport', 'Culture & Sport',
    'Environnement', 'Transport', 'Économie',
    'Administration', 'Santé', 'Logement',
    'Sécurité', 'International', 'Autre', 'Non classifié'
  )
GROUP BY 1, 2
HAVING montant_total > 100000
