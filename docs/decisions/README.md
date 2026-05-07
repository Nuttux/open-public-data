# Architecture Decision Records (ADR)

Format inspiré de [Michael Nygard's ADR template](https://github.com/joelparkerhenderson/architecture-decision-record).

## Pourquoi des ADR

Les choix d'architecture se font, le contexte se perd, deux ans plus tard quelqu'un défait le travail sans comprendre. Un ADR fige : la **décision**, son **contexte**, ses **alternatives rejetées**, et ses **conséquences**. Auditable, pas révisionniste.

## ⚠️ Backfill 2026-05-07

Les ADR 0001-0008 ont été **rédigés rétroactivement le 2026-05-07** lors d'un travail de mise au propre du projet (refactor layering complet + audit gate). Ils documentent des décisions prises au fil des mois précédents — pas le jour même. Ils ne reflètent donc pas le débat tel qu'il s'est passé en temps réel : c'est une formalisation post-hoc des choix appliqués dans le code.

**À partir de l'ADR 0009**, la règle est : tout changement d'architecture passe par un ADR ouvert AVANT le merge de la PR. Voir [ADR-0009](0009-adr-process.md) pour le process.

Si un ADR backfill décrit une décision dont vous trouvez le code en désaccord, c'est probablement le **code qui dit la vérité** — l'ADR n'a pas vu chaque cas particulier qui a été résolu en cours de route. Faites une PR pour corriger l'ADR ou le code.

## Index

| # | Titre | Status | Date | Note |
|---|---|---|---|---|
| [0001](0001-layering-stg-core-mart.md) | Layering : stg → core → (int) → mart | Accepted | 2026-05-07 | backfill |
| [0002](0002-naming-core-vs-int.md) | Nomenclature `core` vs `int` (vs convention dbt) | Accepted | 2026-05-07 | backfill |
| [0003](0003-thin-marts-as-views.md) | Marts « thin » matérialisés en VIEW | Accepted | 2026-05-07 | backfill |
| [0004](0004-polymorphic-vs-typed-caches.md) | Pipeline enrichment : polymorphe + tests vs typé | Accepted | 2026-05-07 | backfill |
| [0005](0005-internal-cache-pattern.md) | Pattern « internal cache » pour LLM/scrape/PDF | Accepted | 2026-05-07 | backfill |
| [0006](0006-audit-gate-regex-vs-ast.md) | Audit gate : regex puis AST | Accepted | 2026-05-07 | backfill — superseded inline (AST migré le même jour) |
| [0007](0007-byte-equality-tolerance.md) | Tolérance byte-equality | Accepted | 2026-05-07 | backfill |
| [0008](0008-bq-table-naming.md) | Naming des tables BigQuery | Accepted | 2026-05-07 | backfill |
| [0009](0009-adr-process.md) | Process ADR going forward | Accepted | 2026-05-07 | inaugural process ADR |

## Convention

- Numérotation séquentielle (0001, 0002, ...). Ne pas réutiliser un numéro même si l'ADR est superseded.
- Status possibles : Proposed, Accepted, Deprecated, Superseded.
- Quand un ADR est superseded, ajouter `Superseded by ADR-NNNN` en haut sans réécrire l'ancien.
- Une PR qui modifie l'architecture doit soit référencer un ADR existant, soit en créer un nouveau.
