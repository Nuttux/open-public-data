# Contribuer à France Open Data

Merci de l'intérêt. Ce projet est open source (AGPL-3.0 pour le code, LO 2.0 Etalab pour les données dérivées, CC BY 4.0 pour l'éditorial) — voir [`LICENSE`](LICENSE) et [`NOTICE.md`](NOTICE.md) pour le détail.

## Avant de proposer un changement

1. **Ouvre une issue** d'abord pour discuter (sauf typo / bug trivial).
2. **Lis** :
   - [`docs/architecture-frontend.md`](docs/architecture-frontend.md) — composants, design system
   - [`docs/architecture-modelling.md`](docs/architecture-modelling.md) — pipeline dbt, règles métier
   - [`docs/data-platform/04-layering-convention.md`](docs/data-platform/04-layering-convention.md) — règles strictes raw → stg → core → mart → JSON

## Setup environnement

### Prérequis
- Python 3.10+
- Node.js 20+
- Accès GCP BigQuery (lecture sur le projet `open-data-france-484717`)

### Pipeline
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp pipeline/.env.example pipeline/.env  # remplir GOOGLE_APPLICATION_CREDENTIALS
cd pipeline
dbt deps && dbt seed && dbt run
```

### Website
```bash
cd website
cp .env.example .env.local  # remplir ANTHROPIC_API_KEY si tu touches le chat
npm install
npm run dev  # http://localhost:3000
```

## Quels changements sont les bienvenus

### Code

- **Corrections de bugs** confirmés par une issue.
- **Améliorations a11y** (RGAA 4.x AA) — voir audit actuel sur `/accessibilite`.
- **Nouvelles villes** : suivre [`docs/city-replication-playbook.md`](docs/city-replication-playbook.md).
- **Nouveaux datasets** : suivre [`docs/runbooks/promote-wip-to-production.md`](docs/runbooks/promote-wip-to-production.md).
- **Tests unit / e2e** : la batterie est dans `website/src/lib/*.test.ts` (Vitest) et `website/e2e/*.spec.ts` (Playwright). Les tests prioritaires à venir sont listés dans [`docs/testing.md`](docs/testing.md).

### Données

- **Corrections d'erreurs** dans les datasets dérivés : ouvrir une issue avec source officielle + ligne fautive.
- **Mises à jour de mappings** dans `pipeline/seeds/*.csv` : PR avec justification courte.

### Éditorial / contenu

- **Articles** dans `website/src/content/blog/` : ton neutre, sourcing par lien, pas de cadrage politique (charte non écrite mais cf articles existants).
- **Corrections** d'analyses : bienvenue, ouvrir une issue avec preuves.

## Quels changements ne sont **pas** les bienvenus

- Ajout de cadrage politique partisan (gauche ou droite) — le projet vise la neutralité éditoriale.
- Suppression de sources / chiffres pour des raisons non documentées.
- Refactors massifs sans discussion préalable (issue + ADR).
- Ajout d'analytics non-RGPD-compliant ou de trackers non documentés dans `/confidentialite`.

## Avant de pousser

Vérifie en local :
```bash
cd website
npm run lint && npm run typecheck && npm test && npm run build
```

Côté pipeline :
```bash
python -m compileall -q pipeline/scripts/
cd pipeline && dbt parse  # valide syntaxe SQL Jinja
```

La CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) ré-exécute ces checks à chaque PR.

## Forme du commit / PR

- Commit message : préfixe conventionnel (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- PR title : court, descriptif (< 70 chars).
- PR description : section "Summary" (2-3 bullets) + "Test plan" (checklist de vérif).
- Si tu touches une page UI, joins une capture d'écran (avant/après si modif visible).

## Process de signalement d'erreur factuelle

Pour signaler un chiffre faux sur le site (pas un bug code) :
1. Ouvrir une issue avec le label `data-correction`
2. Inclure : URL de la page, chiffre affiché, source officielle qui le contredit, écart constaté
3. Réponse sous 5 jours ouvrés (SLA annoncé dans [`/accessibilite`](website/src/app/accessibilite/))

## Process de revue

- 1 reviewer minimum sur les PRs touchant le pipeline (data quality)
- Auto-merge OK pour les bumps Dependabot après CI verte
- Force-push permis tant que la PR est en `draft`

## Contact

- Issues GitHub : https://github.com/Nuttux/open-public-data/issues
- Email : contact@franceopendata.org
- Mainteneur principal : Daniel Shavit (voir [`/mentions-legales`](website/src/app/mentions-legales/))
