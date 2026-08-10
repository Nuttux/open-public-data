{{ config(tags=['enrichment_quality']) }}
{# Specific known misclassifications that should be caught #}
{# Each row returned = a misclassification still present #}
SELECT
    annee,
    beneficiaire_normalise,
    ode_thematique,
    ode_source_thematique,
    SUM(montant) AS montant_total
FROM {{ ref('core_subventions') }}
WHERE donnees_disponibles = TRUE
  AND (
    -- ASL Olympiades is a residential complex, not Olympics
    (REGEXP_CONTAINS(beneficiaire_normalise, r'(?i)ASL.*OLYMPIAD|A\.S\.L.*OLYMPIAD')
     AND ode_thematique LIKE '%Sport%')
    -- Institut des Cultures d'Islam is cultural, not education
    OR (REGEXP_CONTAINS(beneficiaire_normalise, r'(?i)INST.*CULTURES?.*ISLAM')
     AND ode_thematique LIKE '%ducation%')
    -- MEP is a photography museum, not international
    OR (REGEXP_CONTAINS(beneficiaire_normalise, r'(?i)MAISON EUROP.*PHOTO|MEP.*MAISON')
     AND ode_thematique LIKE '%International%')
    -- Grande Halle de la Villette is cultural, not environment
    OR (REGEXP_CONTAINS(beneficiaire_normalise, r'(?i)GRANDE HALLE.*VILLETTE|PARC.*GRANDE HALLE')
     AND ode_thematique LIKE '%Environnement%')
  )
GROUP BY 1, 2, 3, 4
