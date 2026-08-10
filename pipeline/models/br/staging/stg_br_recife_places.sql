-- =============================================================================
-- Staging: civic facilities (places) — 6 families unified with geo.
--
-- Sources: raw.br_recife_places_{ubs,usf,educacao,cultura,esporte,pracas}.
-- Column names + geo conventions vary per family (latitude/longitude vs
-- lat/long; cultura has lat/lon SWAPPED; name column differs) — each CTE maps
-- its own columns to a common shape, then br_coord() extracts lat/lon
-- swap-safely by range. Grain: one row per facility.
-- =============================================================================

WITH ubs AS (
    SELECT {{ br_string('nome_oficial') }} AS nome, 'Saúde' AS familia,
        {{ br_string('tipo_servico') }} AS tipo, latitude AS ca, longitude AS cb,
        {{ br_string('bairro') }} AS bairro, {{ br_string('distrito_sanitario') }} AS area,
        {{ br_string('endereco') }} AS endereco, {{ br_string('especialidade') }} AS detalhe
    FROM {{ source('br_recife_raw', 'br_recife_places_ubs') }}
),
usf AS (
    SELECT {{ br_string('nome_oficial') }}, 'Saúde',
        {{ br_string('tipo_servico') }}, latitude, longitude,
        {{ br_string('bairro') }}, {{ br_string('distrito_sanitario') }},
        {{ br_string('endereco') }}, {{ br_string('especialidade') }}
    FROM {{ source('br_recife_raw', 'br_recife_places_usf') }}
),
educacao AS (
    SELECT {{ br_string('escola') }}, 'Educação',
        {{ br_string('tipo') }}, latitude, longitude,
        {{ br_string('bairro') }}, {{ br_string('rpa') }},
        CAST(NULL AS STRING), CAST(NULL AS STRING)
    FROM {{ source('br_recife_raw', 'br_recife_places_educacao') }}
),
cultura AS (
    SELECT {{ br_string('equipamento') }}, 'Cultura',
        {{ br_string('tipo') }}, latitude, longitude,
        CAST(NULL AS STRING), CAST(NULL AS STRING), {{ br_string('logradouro') }}, CAST(NULL AS STRING)
    FROM {{ source('br_recife_raw', 'br_recife_places_cultura') }}
),
esporte AS (
    -- ⚠ source mangles coords: the decimal point is stripped ("-8116820631116893,0"
    -- = -8.116820631116893). Reconstruct by placing the decimal after the 1st
    -- significant digit (lat ≈ -8) / 2nd (lon ≈ -34) — works for clean values too.
    SELECT {{ br_string('nome_oficial') }}, 'Esporte',
        {{ br_string('tipo_equipamento') }},
        CAST(-1 * SAFE_CAST(REGEXP_REPLACE(lat, r'[^0-9]', '') AS FLOAT64)
             / POW(10, LENGTH(REGEXP_REPLACE(lat, r'[^0-9]', '')) - 1) AS STRING),
        CAST(-1 * SAFE_CAST(REGEXP_REPLACE(long, r'[^0-9]', '') AS FLOAT64)
             / POW(10, LENGTH(REGEXP_REPLACE(long, r'[^0-9]', '')) - 2) AS STRING),
        CAST(NULL AS STRING), CAST(NULL AS STRING), {{ br_string('endereco') }}, CAST(NULL AS STRING)
    FROM {{ source('br_recife_raw', 'br_recife_places_esporte') }}
),
pracas AS (
    SELECT {{ br_string('nome_equip_urbano') }}, 'Praças',
        {{ br_string('tipo_equip_urbano') }}, latitude, longitude,
        {{ br_string('nome_bairro') }}, CAST(NULL AS STRING), {{ br_string('endereco_equip_urbano') }}, CAST(NULL AS STRING)
    FROM {{ source('br_recife_raw', 'br_recife_places_pracas') }}
),
unioned AS (
    SELECT * FROM ubs UNION ALL SELECT * FROM usf UNION ALL SELECT * FROM educacao
    UNION ALL SELECT * FROM cultura UNION ALL SELECT * FROM esporte UNION ALL SELECT * FROM pracas
)

SELECT
    nome, familia, tipo,
    {{ br_coord('ca', 'cb', -9, -7) }}    AS lat,
    {{ br_coord('ca', 'cb', -36, -34) }}  AS lon,
    COALESCE(bairro, area)                AS bairro,
    area,
    endereco,
    detalhe
FROM unioned
WHERE nome IS NOT NULL
