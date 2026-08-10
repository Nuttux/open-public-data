{{ config(tags=['data_completeness'], severity='warn') }}
WITH stats AS (
    SELECT
        COUNT(*) AS total,
        COUNTIF(ode_thematique != 'Non classifié') AS classified,
        ROUND(COUNTIF(ode_thematique != 'Non classifié') * 100.0 / COUNT(*), 1) AS pct
    FROM {{ ref('core_subventions') }}
    WHERE donnees_disponibles = TRUE
)
SELECT total, classified, pct AS classification_pct
FROM stats
WHERE pct < 80
