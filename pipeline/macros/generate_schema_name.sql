{#
  Routage des schémas — enforce ADR-0012 (séparation open-core).

  Comportement dbt par défaut, SAUF pour les modèles marqués
  `meta: { data_class: 'enriched' }` : ceux-là partent dans un dataset PRIVÉ
  (`<target>_private_<schema>`) au lieu du dataset public (`<target>_<schema>`).

  Ainsi les modèles `financial` (déterministes, sources publiques) restent dans
  les datasets publics auditables, et l'enrichissement curé/généré est isolé
  dans des datasets privés (IAM sans allUsers). Un modèle non tagué se comporte
  exactement comme avant (rétro-compat totale).
#}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- set default_schema = target.schema -%}
    {%- if custom_schema_name is none -%}
        {{ default_schema }}
    {%- else -%}
        {%- set dclass = none -%}
        {%- if node is not none and node.config is not none -%}
            {%- set dclass = node.config.get('meta', {}).get('data_class', none) -%}
        {%- endif -%}
        {%- if dclass == 'enriched' -%}
            {{ default_schema }}_private_{{ custom_schema_name | trim }}
        {%- else -%}
            {{ default_schema }}_{{ custom_schema_name | trim }}
        {%- endif -%}
    {%- endif -%}
{%- endmacro %}
