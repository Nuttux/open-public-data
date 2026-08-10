-- DataSF supplier-contracts grain check (API-RECON §A.4): the dataset's
-- grain is contract × PROJECT-TEAM MEMBER, not contract — verified at recon
-- 48,350 rows vs 31,935 distinct contract_no. If rows ever equal distinct
-- contracts the grain changed upstream and the double-counting guards
-- (dedupe / prime-contractor filter) become wrong assumptions → fail.
{{ config(tags=['us', 'referential_integrity']) }}

WITH grain AS (
    SELECT
        COUNT(*)                     AS n_rows,
        COUNT(DISTINCT contract_no)  AS n_contracts
    FROM {{ ref('core_us_sf_contracts') }}
)

SELECT *
FROM grain
WHERE n_rows <= n_contracts
