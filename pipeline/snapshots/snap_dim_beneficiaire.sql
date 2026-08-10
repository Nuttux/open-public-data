{#
  Snapshot : registre d'identité des bénéficiaires (dim_beneficiaire).

  Raison d'être : rendre le crosswalk (nom normalisé → beneficiaire_id) PERSISTANT.
  Le beneficiaire_id est déterministe (MD5 du nom normalisé), mais si la logique
  de normalisation change un jour, on veut conserver la trace des ids déjà
  attribués — et la date de première apparition de chaque entité — pour ne pas
  orpheliner l'enrichissement rattaché à l'id. C'est ce qui fait du dim un
  registre au sens plein (persisté), pas un simple recalcul à chaque build.

  Stratégie `check` sur l'identité résolue : on capture une nouvelle version
  quand le SIRET/SIREN d'une entité change (rare, mais traçable).
  Clé unique : beneficiaire_id.
#}
{% snapshot snap_dim_beneficiaire %}
{{
    config(
      target_schema='dbt_paris_snapshots',
      unique_key='beneficiaire_id',
      strategy='check',
      check_cols=['siret', 'siren'],
      invalidate_hard_deletes=False,
    )
}}
select
    beneficiaire_id,
    beneficiaire_normalise,
    siret,
    siren
from {{ ref('dim_beneficiaire') }}
{% endsnapshot %}
