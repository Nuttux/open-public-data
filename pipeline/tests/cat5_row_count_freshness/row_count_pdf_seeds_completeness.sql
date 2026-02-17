{{ config(tags=['row_count_freshness']) }}
WITH seed_counts AS (
    SELECT 2020 AS annee, COUNT(*) AS cnt FROM {{ ref('seed_pdf_budget_vote_2020') }}
    UNION ALL SELECT 2021, COUNT(*) FROM {{ ref('seed_pdf_budget_vote_2021') }}
    UNION ALL SELECT 2022, COUNT(*) FROM {{ ref('seed_pdf_budget_vote_2022') }}
    UNION ALL SELECT 2023, COUNT(*) FROM {{ ref('seed_pdf_budget_vote_2023') }}
    UNION ALL SELECT 2024, COUNT(*) FROM {{ ref('seed_pdf_budget_vote_2024') }}
    UNION ALL SELECT 2025, COUNT(*) FROM {{ ref('seed_pdf_budget_vote_2025') }}
    UNION ALL SELECT 2026, COUNT(*) FROM {{ ref('seed_pdf_budget_vote_2026') }}
)
SELECT annee, cnt AS row_count
FROM seed_counts
WHERE cnt < 1000
