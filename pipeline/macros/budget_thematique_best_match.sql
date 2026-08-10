{#
    budget_thematique_best_match — CTEs qui choisissent LA meilleure thématique
    pour chaque (chapitre_code, fonction_code) à partir de stg_mapping_thematiques.

    Priorité au match spécifique (fonction_prefix non NULL) sur le match
    générique. Ce bloc de 3 CTE était copié à l'identique dans core_budget (CA)
    et core_budget_vote (BP) — cf. ADR-0011. Les DEUX modèles nomment déjà leurs
    CTE amont `budget` et `mapping_thematiques`, donc les valeurs par défaut
    suffisent. Émet trois CTE (distinct_combos, thematique_matches,
    best_thematique) SANS virgule finale : placer entre le CTE `mapping_thematiques`
    et le CTE `enriched`, avec une virgule après l'appel.

    Args:
      budget_cte  — nom du CTE budget amont (défaut 'budget')
      mapping_cte — nom du CTE mapping amont (défaut 'mapping_thematiques')

    Portée : macro FRANCE (dimension fonctionnelle M57). Marseille ne l'utilise
    pas (pas de dimension fonctionnelle).
#}
{% macro budget_thematique_best_match(budget_cte='budget', mapping_cte='mapping_thematiques') %}
distinct_combos AS (
    SELECT DISTINCT chapitre_code, fonction_code
    FROM {{ budget_cte }}
),

thematique_matches AS (
    SELECT
        c.chapitre_code,
        c.fonction_code,
        m.thematique,
        m.fonction_prefix,
        ROW_NUMBER() OVER (
            PARTITION BY c.chapitre_code, c.fonction_code
            ORDER BY
                -- Priorité au match spécifique (fonction_prefix non NULL)
                CASE WHEN m.fonction_prefix IS NOT NULL THEN 0 ELSE 1 END,
                m.fonction_prefix DESC NULLS LAST,
                -- Tie-break: same chapitre + same-length prefix, different
                -- thematique must resolve deterministically across builds.
                m.thematique ASC
        ) AS rn
    FROM distinct_combos c
    INNER JOIN {{ mapping_cte }} m
        ON c.chapitre_code = m.chapitre_code
        AND (m.fonction_prefix IS NULL
             OR c.fonction_code LIKE CONCAT(m.fonction_prefix, '%'))
),

best_thematique AS (
    SELECT
        chapitre_code,
        fonction_code,
        thematique AS mapped_thematique
    FROM thematique_matches
    WHERE rn = 1
)
{% endmacro %}
