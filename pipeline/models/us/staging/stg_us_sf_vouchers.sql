-- =============================================================================
-- Staging: SF Vendor Payments (Vouchers) — typed, one-to-one with raw
--
-- Source: raw.us_sf_vouchers (dataset n9pm-xkyq, ~8.07M rows, all strings,
--         synced via bulk CSV)
-- Grain:  voucher × accounting distribution line
--
-- Notes (docs/us/API-RECON.md §A.3):
--   - FY2007-FY2027, weekly refresh. Money = vouchers_paid /
--     vouchers_pending / vouchers_pending_retainage.
--   - `vendor` is an UNKEYED display string (BNY Mellon under 2 spellings)
--     — name normalization is downstream business, not stg's.
--   - non_profit_indicator is 'X' or empty → boolean is_non_profit.
--   - data_as_of is Socrata type "text" ('2017-07-03 00:00:00-07:00',
--     UTC-offset format) while data_loaded_at is calendar_date — both
--     handled by the us_sf_timestamp() multi-format parser.
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_sf_raw', 'us_sf_vouchers') }}
)

SELECT
    {{ us_sf_int('fiscal_year') }}                    AS fiscal_year,
    CASE UPPER(TRIM(related_govt_units))
        WHEN 'YES' THEN 'Yes'
        WHEN 'NO'  THEN 'No'
    END                                               AS related_govt_units,
    {{ us_sf_string('organization_group_code') }}     AS organization_group_code,
    {{ us_sf_string('organization_group') }}          AS organization_group,
    {{ us_sf_string('department_code') }}             AS department_code,
    {{ us_sf_string('department') }}                  AS department,
    {{ us_sf_string('program_code') }}                AS program_code,
    {{ us_sf_string('program') }}                     AS program,
    {{ us_sf_string('character_code') }}              AS character_code,
    {{ us_sf_string('character') }}                   AS character,
    {{ us_sf_string('object_code') }}                 AS object_code,
    {{ us_sf_string('object') }}                      AS object,
    {{ us_sf_string('sub_object_code') }}             AS sub_object_code,
    {{ us_sf_string('sub_object') }}                  AS sub_object,
    {{ us_sf_string('fund_type_code') }}              AS fund_type_code,
    {{ us_sf_string('fund_type') }}                   AS fund_type,
    {{ us_sf_string('fund_code') }}                   AS fund_code,
    {{ us_sf_string('fund') }}                        AS fund,
    {{ us_sf_string('fund_category_code') }}          AS fund_category_code,
    {{ us_sf_string('fund_category') }}               AS fund_category,
    {{ us_sf_string('purchase_order') }}              AS purchase_order,
    {{ us_sf_string('vendor') }}                      AS vendor,
    {{ us_sf_string('voucher') }}                     AS voucher,
    {{ us_sf_amount('vouchers_paid') }}               AS vouchers_paid,
    {{ us_sf_amount('vouchers_pending') }}            AS vouchers_pending,
    {{ us_sf_amount('vouchers_pending_retainage') }}  AS vouchers_pending_retainage,
    {{ us_sf_string('non_profit_indicator') }}        AS non_profit_indicator,
    UPPER(COALESCE(TRIM(non_profit_indicator), '')) = 'X' AS is_non_profit,
    {{ us_sf_string('contract_number') }}             AS contract_number,
    {{ us_sf_string('contract_title') }}              AS contract_title,
    {{ us_sf_string('purchasing_authority_title') }}  AS purchasing_authority_title,
    {{ us_sf_timestamp('data_as_of') }}               AS data_as_of,
    {{ us_sf_timestamp('data_loaded_at') }}           AS data_loaded_at,
    _synced_at
FROM source
