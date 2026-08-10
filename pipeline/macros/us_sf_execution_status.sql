{#
  SF fiscal-year execution status (docs/us/SF-BUILD-PLAN.md cross-cutting
  rule 2; measured risk in docs/us/block-studies/1-budget.md §7).

  Replaces the calendar boolean `is_fiscal_year_complete` in every export:
  that flag marks FY2026 "complete" 16 days after year-end (June 30) while
  the Controller's accounting close runs for months.

  SF fiscal year N runs July 1 (N-1) → June 30 N, so the CURRENT fiscal
  year is calendar year + 1 from July onwards:

    fy <  current_fy - 1  → 'closed'
        every fiscal year that ended more than one full cycle ago — its
        year-end close has been published.
    fy = current_fy - 1   → 'recently_closed_preliminary'
        the most recently ended fiscal year: figures exist but the close is
        in progress; they may still change. Self-healing: the year flips to
        'closed' when the next fiscal year ends.
    fy = current_fy       → basis-dependent:
        'in_progress'  (basis='actuals'): partial-year actuals exist.
        'adopted_only' (basis='budget'):  on the adopted-budget side the
        year has no complete execution — the adopted AAO is the only
        finished series (Paris "budget voté" analogue).
    fy >  current_fy      → 'adopted_only'
        second year of the two-year AAO (enterprise figures are high-level
        estimates per the Controller's own dataset description).

  Date arithmetic only — no data scan, deterministic per run date.
#}

{% macro us_sf_current_fiscal_year() -%}
(EXTRACT(YEAR FROM CURRENT_DATE('America/Los_Angeles'))
     + IF(EXTRACT(MONTH FROM CURRENT_DATE('America/Los_Angeles')) >= 7, 1, 0))
{%- endmacro %}

{% macro us_sf_execution_status(fy_col, basis='budget') -%}
CASE
        WHEN {{ fy_col }} < {{ us_sf_current_fiscal_year() }} - 1
            THEN 'closed'
        WHEN {{ fy_col }} = {{ us_sf_current_fiscal_year() }} - 1
            THEN 'recently_closed_preliminary'
        WHEN {{ fy_col }} = {{ us_sf_current_fiscal_year() }}
            THEN {% if basis == 'actuals' %}'in_progress'{% else %}'adopted_only'{% endif %}
        ELSE 'adopted_only'
    END
{%- endmacro %}
