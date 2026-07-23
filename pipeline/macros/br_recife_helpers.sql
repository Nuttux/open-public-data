{#
  Typing helpers for Recife (CKAN) raw tables.

  Raw `raw.br_recife_*` tables are all-STRING, byte-faithful to the CSV
  (space-padded text, mixed decimal conventions). These macros type them
  once, in stg. Divergences from the US helpers (verified live 2026-07-22):

    - TEXT is heavily space-padded (CPF/CNPJ padded to ~200 chars) → br_string
      TRIMs. br_digits also strips every non-digit (dots/slashes/spaces in the
      CPF/CNPJ column).

    - MONEY uses TWO conventions across datasets:
        * credor / contratos / funcional : '.' decimal, no thousands sep
          ("168413.09", "5100.0")
        * licitações                     : ',' decimal, space-padded, and
          MAY carry '.' thousands ("333750,00", "   15210,00", "1.234.567,89")
      br_amount() normalizes both: if a comma is present it is the decimal
      mark (drop '.' thousands, comma→dot); otherwise the string is already
      dot-decimal. NUMERIC(38,9) — to-the-penny at R$ billions.

    - DATES come as 'YYYY/MM/DD HH:MM:SS.sss' (empenho, contratos, licitações).
      br_timestamp/br_date parse that; a plain 'YYYY-MM-DD' fallback covers
      the Data de Pagamento array elements once unnested.
#}

{% macro br_string(column_name) -%}
    NULLIF(TRIM({{ column_name }}), '')
{%- endmacro %}

{% macro br_digits(column_name) -%}
    NULLIF(REGEXP_REPLACE({{ column_name }}, r'[^0-9]', ''), '')
{%- endmacro %}

{% macro br_int(column_name) -%}
    SAFE_CAST(NULLIF(REGEXP_REPLACE({{ column_name }}, r'[^0-9-]', ''), '') AS INT64)
{%- endmacro %}

{#
  Normalize a Brazilian/US-style money string to NUMERIC.
  - trim padding
  - if it contains a comma → comma is the decimal mark: drop '.' (thousands),
    then ','→'.'
  - else → already dot-decimal (or integer)
#}
{% macro br_amount(column_name) -%}
    SAFE_CAST(
        NULLIF(
            CASE
                WHEN STRPOS({{ column_name }}, ',') > 0
                    THEN REPLACE(REPLACE(TRIM({{ column_name }}), '.', ''), ',', '.')
                ELSE TRIM({{ column_name }})
            END,
        '') AS NUMERIC
    )
{%- endmacro %}

{% macro br_timestamp(column_name) -%}
    COALESCE(
        SAFE.PARSE_TIMESTAMP('%Y/%m/%d %H:%M:%E*S', TRIM({{ column_name }})),
        SAFE.PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%E*S', TRIM({{ column_name }})),
        SAFE.PARSE_TIMESTAMP('%Y-%m-%d', TRIM({{ column_name }}))
    )
{%- endmacro %}

{% macro br_date(column_name) -%}
    DATE({{ br_timestamp(column_name) }})
{%- endmacro %}

{#
  Classify the shared CPF/CNPJ column by digit length:
    14 → 'cnpj' (organisation), 11 → 'cpf' (individual), else 'outro'.
  Privacy doctrine: CPF individuals are split out here and NEVER classified,
  searched or publicly exposed downstream (marts filter to 'cnpj' orgs).
#}
{#
  Swap-safe coordinate extraction. Recife facility CSVs vary: some label the
  columns latitude/longitude, some lat/long, and at least one (cultura) has the
  two SWAPPED. Pick whichever of the two candidate columns falls in the target
  range (Recife: lat ≈ -8, lon ≈ -34.9), so a swap self-corrects.
#}
{% macro br_coord(a, b, lo, hi) -%}
    COALESCE(
        IF(SAFE_CAST(NULLIF(TRIM({{ a }}), '') AS FLOAT64) BETWEEN {{ lo }} AND {{ hi }},
           SAFE_CAST(TRIM({{ a }}) AS FLOAT64), NULL),
        IF(SAFE_CAST(NULLIF(TRIM({{ b }}), '') AS FLOAT64) BETWEEN {{ lo }} AND {{ hi }},
           SAFE_CAST(TRIM({{ b }}) AS FLOAT64), NULL)
    )
{%- endmacro %}

{% macro br_doc_tipo(column_name) -%}
    CASE LENGTH({{ br_digits(column_name) }})
        WHEN 14 THEN 'cnpj'
        WHEN 11 THEN 'cpf'
        ELSE 'outro'
    END
{%- endmacro %}
