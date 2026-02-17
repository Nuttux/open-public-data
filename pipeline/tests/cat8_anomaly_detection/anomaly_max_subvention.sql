{{ config(tags=['anomaly_detection'], severity='warn') }}
{# No single subvention should exceed 500M EUR — likely a data error #}
SELECT beneficiaire_normalise, annee, montant
FROM {{ ref('core_subventions') }}
WHERE montant > 500000000
