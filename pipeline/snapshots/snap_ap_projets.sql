{#
  Snapshot : Autorisations de Programmes (CA OpenData).
  Les AP sont des projets pluriannuels → leur montant exécuté évolue
  d'année en année. Capture par AP × exercice pour suivre.

  Clé unique : autorisation_de_programme_cle + exercice_comptable.
#}
{% snapshot snap_ap_projets %}
{{
    config(
      target_schema='dbt_paris_snapshots',
      unique_key="concat(cast(autorisation_de_programme_cle as string), '-', cast(exercice_comptable as string))",
      strategy='check',
      check_cols=[
        'autorisation_de_programme_texte',
        'mission_ap_texte',
        'direction_gestionnaire_texte',
        'nature_budgetaire_cle',
        'mandate_titre_apres_regul',
      ],
    )
}}
select * from {{ source('paris_raw', 'comptes_administratifs_autorisations_de_programmes_a_partir_de_2018_m57_ville_de') }}
where autorisation_de_programme_cle is not null
{% endsnapshot %}
