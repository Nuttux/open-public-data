{#
  Snapshot : logements sociaux financés à Paris.
  Les agréments peuvent être révisés (nombre de logements final ≠
  agrément initial). Capture pour suivre l'évolution.

  Clé unique : identifiant_livraison.
#}
{% snapshot snap_logements_sociaux %}
{{
    config(
      target_schema='dbt_paris_snapshots',
      unique_key='identifiant_livraison',
      strategy='check',
      check_cols=[
        'adresse_du_programme',
        'annee_du_financement_agrement',
        'bailleur_social',
        'nombre_total_de_logements_finances',
        'dont_nombre_de_logements_pla_i',
        'dont_nombre_de_logements_plus',
        'dont_nombre_de_logements_pls',
        'mode_de_realisation',
        'nature_de_programme',
      ],
    )
}}
select * from {{ source('paris_raw', 'logements_sociaux_finances_a_paris') }}
where identifiant_livraison is not null
{% endsnapshot %}
