# Runbooks ops

Procédures opérationnelles pour les scénarios courants : incident, mise en prod, correction de données, configuration outils tiers.

Format : chaque runbook est **autonome** (un opérateur le suit à 3h du matin sans avoir lu le reste). Contexte → quand l'utiliser → étapes → plan B → cross-refs.

## Index

| Runbook | Quand utiliser | Effort |
|---------|---------------|--------|
| [`promote-wip-to-production.md`](promote-wip-to-production.md) | Une page UI doit afficher la donnée d'un script `pipeline/cache/wip/` | 1-2 h |
| [`dev-prod-separation.md`](dev-prod-separation.md) | Setup ou changement des profils dbt dev / prod / CI | 30 min |
| `rollback.md` | Prod cassée, besoin de restaurer rapidement *(PR #24 — en draft)* | 1-15 min selon scénario |
| `source-correction-retroactive.md` | Open Data Paris corrige rétroactivement un dataset déjà ingéré *(PR #27 — en draft)* | 30 min |
| `data-backup.md` | Stratégie de backup raw + seeds + cache enrichissement *(PR #29 — en draft)* | doc only |
| `rate-limiting.md` | Provisioner Vercel KV + ratelimit sur `/api/chat` *(PR #29 — en draft)* | 1 h |
| `observability-setup.md` | Câbler Sentry / Plausible / Better Stack / Axiom *(PR #28 + PR #28-v2 — en draft)* | 1-2 h total |

## Index par scénario

### Incident prod (site cassé)
1. `rollback.md` — restaurer la version précédente en 1 min via Vercel
2. `observability-setup.md` — vérifier les dashboards (Vercel, Sentry, Better Stack, Plausible, Axiom)
3. Post-mortem : issue GitHub avec symptôme + root cause

### Données fausses signalées par un user
1. `source-correction-retroactive.md` — distinguer correction éditeur vs bug pipeline
2. Si bug pipeline : revert le commit dans `pipeline/`, re-run, re-export
3. Si correction éditeur : geler snapshot, re-run, doc dans `data-corrections-log.md`

### Mettre une nouvelle ville en prod
1. `city-replication-playbook.md` (parent doc, pas dans runbooks/)
2. Ajouter à `pipeline/seeds/seed_communes_cibles.csv`
3. Run pipeline pour la ville → export → vérifier `/ville/<slug>` côté site
4. Promouvoir si OK

### Mettre un script WIP en prod
- `promote-wip-to-production.md` — 6 étapes structurées, 1-2h
- Vérifier `04-layering-convention.md` (parent doc) avant

### Bumps deps Dependabot
1. CI Dependabot ouvre une PR hebdo
2. Lire le changelog (lien dans le commit Dependabot)
3. Vérifier CI verte
4. Merger (auto-merge OK pour patches après CI green)

### Provisioner les outils observabilité
1. `observability-setup.md` — Sentry, Plausible, Better Stack, Axiom step-by-step
2. Coûts estimés : 0 €/mois sur free tiers

## Convention

- Un runbook = une procédure actionnable, pas un essai. Format imperatif.
- Cross-refs vers les autres runbooks dans la section "Voir aussi" en bas.
- Si une étape change (URL, mot de passe, nom d'outil), update le runbook dans la même PR que le changement opérationnel.

## Voir aussi

- [`docs/architecture-modelling.md`](../architecture-modelling.md) — règles métier pipeline
- [`docs/architecture-frontend.md`](../architecture-frontend.md) — composants UI
- [`docs/data-platform/`](../data-platform/) — doc technique pipeline (catalogue, conventions, qualité)
- [`docs/decisions/`](../decisions/) — ADRs (décisions architecturales)
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — comment contribuer
