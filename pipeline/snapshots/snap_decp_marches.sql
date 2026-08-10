{#
  Snapshot : DECP marchés publics Paris (data.gouv.fr).
  data.gouv.fr publie des correctifs annuels → capture toutes les
  révisions notamment sur les montants notifiés.

  Clé unique : id (identifiant DECP unique).
#}
{% snapshot snap_decp_marches %}
{{
    config(
      target_schema='dbt_paris_snapshots',
      unique_key='id',
      strategy='check',
      check_cols=[
        'objet',
        'montant',
        'date_notification',
        'duree_mois',
        'lieu_execution_code',
        'code_cpv',
        'titulaires',
        'ccag',
        'offres_recues',
      ],
    )
}}
select * from {{ source('paris_raw', 'decp_marches_paris') }}
where id is not null
{% endsnapshot %}
