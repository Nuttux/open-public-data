{#
  Typing helpers for Treasury Fiscal Data raw tables.

  The API serialises EVERYTHING as JSON strings and encodes missing values
  as the literal string "null" (docs/us/API-RECON.md §B.5). Raw keeps those
  strings untouched; these helpers do the "null"→NULL + cast, once, in stg.

  NUMERIC (38 digits, 9 decimals) comfortably holds to-the-penny amounts in
  the trillions.
#}

{% macro us_fd_amount(column_name) -%}
    SAFE_CAST(NULLIF({{ column_name }}, 'null') AS NUMERIC)
{%- endmacro %}

{% macro us_fd_int(column_name) -%}
    SAFE_CAST(NULLIF({{ column_name }}, 'null') AS INT64)
{%- endmacro %}

{% macro us_fd_date(column_name) -%}
    SAFE_CAST(NULLIF({{ column_name }}, 'null') AS DATE)
{%- endmacro %}

{% macro us_fd_string(column_name) -%}
    NULLIF({{ column_name }}, 'null')
{%- endmacro %}
