-- BINDING Block-2 guard (SF-BUILD-PLAN §Block 2): the who-gets-paid page's
-- DEFAULT view excludes fiscal agents, payroll pass-throughs and person
-- rows. Because the seed matches exact vendor strings, a renamed top bank
-- would silently fall out of its bucket and re-enter the default top-10
-- (seed-fragility risk, docs/us/block-studies/2-payees.md §6). This test
-- reconstructs the default top-10 for EVERY fiscal year (the page's year
-- picker exposes them all) and fails on:
--   1. any excluded-bucket vendor present (construction-impossible today,
--      kept explicit so a predicate change can't slip through);
--   2. any UNCLASSIFIED vendor whose name matches a fiscal-agent pattern
--      (bank / trust / depository / custodian names) — the renamed-vendor
--      trap. Classified vendors are exempt: SAN FRANCISCO FOOD BANK is a
--      seeded nonprofit and does not trip \bBANK\b;
--   3. in the LATEST CLOSED fiscal year: ANY unclassified vendor at all —
--      the freshest default top-10 must be 100% classified.
{{ config(tags=['us', 'seed_quality']) }}

WITH default_ranked AS (
    SELECT
        fiscal_year,
        vendor,
        bucket,
        vouchers_paid_usd,
        execution_status,
        ROW_NUMBER() OVER (
            PARTITION BY fiscal_year ORDER BY vouchers_paid_usd DESC
        ) AS default_rank
    FROM {{ ref('mart_us_sf_top_payees') }}
    WHERE COALESCE(bucket, '')
          NOT IN ('fiscal_agent_debt_service', 'payroll_passthrough', 'person')
),

latest_closed AS (
    SELECT MAX(fiscal_year) AS fy
    FROM {{ ref('mart_us_sf_top_payees') }}
    WHERE execution_status = 'closed'
)

SELECT
    fiscal_year,
    default_rank,
    vendor,
    bucket,
    vouchers_paid_usd,
    CASE
        WHEN bucket IN ('fiscal_agent_debt_service', 'payroll_passthrough', 'person')
            THEN 'excluded bucket leaked into default view'
        WHEN bucket IS NULL AND fiscal_year = (SELECT fy FROM latest_closed)
            THEN 'unclassified vendor in latest closed FY default top-10'
        ELSE 'unclassified vendor matching fiscal-agent name pattern'
    END AS failure_reason
FROM default_ranked
WHERE default_rank <= 10
  AND (
        bucket IN ('fiscal_agent_debt_service', 'payroll_passthrough', 'person')
        OR (
            bucket IS NULL
            AND REGEXP_CONTAINS(
                UPPER(vendor),
                r'\b(BANK|TRUST|TRUSTEE|DEPOSITORY|JPMORGAN|J P MORGAN|BNY|MELLON|WELLS FARGO|CUSTODIAN)\b'
            )
        )
        OR (
            bucket IS NULL
            AND fiscal_year = (SELECT fy FROM latest_closed)
        )
      )
