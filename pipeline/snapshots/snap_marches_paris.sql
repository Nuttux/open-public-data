{#
  Snapshot : liste des marchés publics (collectivité parisienne).
  Les marchés peuvent être amendés (avenants, prolongations) → on
  capture chaque révision.

  Clé unique : numero_marche.
#}
{% snapshot snap_marches_paris %}
{{
    config(
      target_schema='dbt_paris_snapshots',
      unique_key='numero_marche',
      strategy='check',
      check_cols=[
        'objet_du_marche',
        'nature_du_marche',
        'fournisseur_nom',
        'fournisseur_siret',
        'montant_min',
        'montant_max',
        'date_de_notification',
        'duree_du_marche_en_jours',
      ],
    )
}}
select * from {{ source('paris_raw', 'liste_des_marches_de_la_collectivite_parisienne') }}
where numero_marche is not null
{% endsnapshot %}
