{{ config(tags=['anomaly_detection'], severity='warn') }}
{# Execution rate should be between 50% and 200% for significant chapters (>1M EUR) #}
SELECT
    annee,
    chapitre_libelle,
    taux_execution_pct,
    montant_vote,
    montant_execute
FROM {{ ref('mart_vote_vs_execute') }}
WHERE montant_vote > 1000000
  AND (taux_execution_pct < 50 OR taux_execution_pct > 200)
