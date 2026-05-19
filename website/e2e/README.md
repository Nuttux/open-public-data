# Tests e2e Playwright

Smoke + golden path sur les pages clés du site. Visent à attraper les régressions runtime que la build statique ne voit pas (route 500, JSON manquant côté front, layout cassé après refactor).

## Run

```bash
cd website
npm run test:e2e          # headless
npm run test:e2e:ui       # mode interactif Playwright UI
```

Le `playwright.config.ts` lance automatiquement `next build && next start` sur `localhost:3000` avant les tests, et les arrête après.

## Cibler une URL distante

Utile pour smoke-tester un preview deploy Vercel sans rebuild local :

```bash
PLAYWRIGHT_BASE_URL=https://chore-ci-mvp-open-public-data.vercel.app \
  npm run test:e2e
```

## Specs actuels

| Spec | Couvre |
|------|--------|
| `smoke.spec.ts` | 6 routes golden path (`/`, `/budget`, `/marches-publics`, `/qui-recoit`, `/investissements`, `/methode`) — status 200 + h1 non vide ; + erreurs console critiques sur landing |
| `budget.spec.ts` | Présence d'un chart ECharts + au moins un montant € visible |
| `marches.spec.ts` | Liste des marchés affiche au moins un montant |

9 tests au total. Routes alignées sur la structure courante de la branche
`test` (avant pivot URL). Quand le refactor `/ville/[slug]` / `/france`
sera mergé, mettre à jour les paths dans les specs (cf. commentaire en
tête de `smoke.spec.ts`).

## Pas (encore) intégré au CI

Run en CI ajoute ~2 min de download de Chromium + ~1m30 de build + 30s de tests = +5 min wall-time par PR. À activer en phase suivante via un job `e2e` séparé dans `.github/workflows/ci.yml` :

```yaml
e2e:
  needs: website  # réutilise le cache npm
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: "20", cache: npm, cache-dependency-path: website/package-lock.json }
    - run: npm ci
      working-directory: website
    - run: npx playwright install --with-deps chromium
      working-directory: website
    - run: npm run test:e2e
      working-directory: website
```

## Roadmap e2e

- a11y via `@axe-core/playwright` sur les 6 routes golden path
- Lighthouse perf budget (LCP < 2.5 s, CLS < 0.1) via `lighthouse` + `chrome-launcher`
- Test fonctionnel : drilldown budget chapitre → fiche
- Test fonctionnel : recherche bénéficiaire subvention
- Visual regression via `toHaveScreenshot()` sur les charts clés
