{#
  Typing helpers for DataSF (Socrata) raw tables.

  Raw `raw.us_sf_*` tables are all-STRING, byte-faithful to the API
  (docs/us/API-RECON.md §A.6). Two ingestion paths produce THREE date/time
  lexical formats for the same logical columns — verified live 2026-07-16:

    - SODA paged JSON (calendar_date):  2026-07-13T03:03:19.000   (floating)
    - bulk CSV export (calendar_date):  2026/07/13 03:15:50 AM    (floating)
    - text date columns (e.g. vouchers
      data_as_of, Socrata type "text"):  2017-07-03 00:00:00-07:00 (offset)

  us_sf_timestamp() COALESCEs the three parsers. Floating (offset-less)
  values are interpreted as UTC — a ≤7h skew on metadata timestamps, which
  only ever feed as-of provenance fields, never amounts.

  Money is cast to NUMERIC (38,9 — comfortably to-the-penny at $B scale).
#}

{% macro us_sf_timestamp(column_name) -%}
    COALESCE(
        SAFE.PARSE_TIMESTAMP('%Y-%m-%dT%H:%M:%E*S', {{ column_name }}),
        SAFE.PARSE_TIMESTAMP('%F %H:%M:%E*S%Ez', {{ column_name }}),
        SAFE.PARSE_TIMESTAMP('%Y/%m/%d %I:%M:%S %p', {{ column_name }})
    )
{%- endmacro %}

{% macro us_sf_date(column_name) -%}
    DATE({{ us_sf_timestamp(column_name) }})
{%- endmacro %}

{% macro us_sf_amount(column_name) -%}
    SAFE_CAST(NULLIF({{ column_name }}, '') AS NUMERIC)
{%- endmacro %}

{% macro us_sf_int(column_name) -%}
    SAFE_CAST(NULLIF({{ column_name }}, '') AS INT64)
{%- endmacro %}

{% macro us_sf_string(column_name) -%}
    NULLIF(TRIM({{ column_name }}), '')
{%- endmacro %}
