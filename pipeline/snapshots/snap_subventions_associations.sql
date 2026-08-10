{#
  Snapshot : subventions aux associations (avec SIRET).
  Source ré-publiée par la Ville → on capture chaque révision pour
  garantir la reproductibilité d'un chiffre cité publiquement.

  Stratégie : `check` sur tous les colonnes business.
  Clé unique : numero_de_dossier + annee_budgetaire (composite).
#}
{% snapshot snap_subventions_associations %}
{{
    config(
      target_schema='dbt_paris_snapshots',
      unique_key="concat(cast(numero_de_dossier as string), '-', cast(annee_budgetaire as string))",
      strategy='check',
      check_cols=[
        'nom_beneficiaire',
        'numero_siret',
        'objet_du_dossier',
        'montant_vote',
        'direction',
        'nature_de_la_subvention',
      ],
    )
}}
select * from {{ source('paris_raw', 'subventions_associations_votees') }}
where numero_de_dossier is not null
{% endsnapshot %}
