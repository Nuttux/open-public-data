import { test, expect } from "@playwright/test";

/**
 * Test métier : la page /budget doit rendre un Sankey ou au moins un
 * graphe ECharts non vide. Si aucun chart n'apparaît, c'est qu'un loader a
 * cassé en amont (JSON manquant, parsing fail, etc.) — bug typique post-
 * pipeline.
 */
test("budget rend au moins un chart ECharts non vide", async ({ page }) => {
  await page.goto("/budget", { waitUntil: "networkidle" });

  // ECharts utilise un canvas (ou svg) inséré dans un div data-attr-host.
  // On accepte les deux rendus possibles.
  const chartCanvas = page.locator("canvas, svg").first();
  await expect(chartCanvas, "expect at least one chart visual").toBeVisible({ timeout: 10_000 });
});

test("budget affiche un montant total (au moins 1 chiffre € visible)", async ({ page }) => {
  await page.goto("/budget", { waitUntil: "networkidle" });

  // Cherche un texte qui contient au moins un chiffre suivi d'une unité euro.
  // Volontairement tolérant : "11,7 Md €", "312 M €", "5 495 €" etc.
  const eurMatch = page.getByText(/\d[\d\s  ]*[,.]?\d*\s*(Md|M|k)?\s*€/);
  await expect(eurMatch.first(), "expect at least one euro figure on budget page").toBeVisible({
    timeout: 10_000,
  });
});
