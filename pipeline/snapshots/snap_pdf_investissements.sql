{#
  Snapshot : investissements localisés extraits des PDFs CA.
  Si on relance l'extraction Gemini Vision avec un meilleur prompt
  ou modèle, les montants/projets peuvent évoluer. On garde l'historique
  pour traçabilité des chiffres publiés.

  Clé unique : id (généré par extract_pdf_investments.py).
#}
{% snapshot snap_pdf_investissements %}
{{
    config(
      target_schema='dbt_paris_snapshots',
      unique_key='id',
      strategy='check',
      check_cols=[
        'annee',
        'arrondissement',
        'chapitre_code',
        'nom_projet',
        'montant',
        'type_ap',
        'confidence',
      ],
    )
}}
select * from {{ source('paris_raw', 'pdf_investissements_localises_paris') }}
where id is not null
{% endsnapshot %}
