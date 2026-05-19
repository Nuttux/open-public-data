import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config — golden path e2e tests.
 *
 * Stratégie MVP :
 *   - On lance `next build && next start` pour avoir le rendu de prod
 *     (plus stable que `next dev`, pas de HMR / recompiles à la volée).
 *   - Tests groupés en 3 specs sur le dossier `e2e/` au niveau de website/.
 *   - Pas (encore) intégré dans `.github/workflows/ci.yml` — installer les
 *     navigateurs Playwright en CI ajoute ~2 min wall-time + ~500 MB de
 *     téléchargement. Phase suivante : activer en CI une fois la batterie
 *     de tests stabilisée.
 *
 * Run local :
 *   cd website
 *   npm run test:e2e          # headless, par défaut
 *   npm run test:e2e -- --ui  # mode interactif Playwright
 *
 * Cibler une URL différente (ex. preview Vercel) :
 *   PLAYWRIGHT_BASE_URL=https://chore-ci-mvp-open-public-data.vercel.app \
 *     npm run test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    locale: "fr-FR",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Skip the auto-managed server when targeting a remote URL — useful for
  // running the same suite against a Vercel preview deploy.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
