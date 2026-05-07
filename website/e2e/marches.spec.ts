import { test, expect } from "@playwright/test";

/**
 * Marchés publics — la liste doit charger. C'est la page la plus lourde du
 * site (110k+ marchés, JSON segmenté par année), donc la première qui
 * casse quand un export pipeline foire.
 */
test("marchés publics : la liste affiche au moins une ligne", async ({ page }) => {
  await page.goto("/marches-publics", { waitUntil: "networkidle" });

  // On cherche la présence d'au moins un texte qui ressemble à un montant
  // de marché public. La structure DOM peut changer (table / cards / grid)
  // donc on évite les sélecteurs trop spécifiques.
  const eurMatch = page.getByText(/\d[\d\s  ]*[,.]?\d*\s*(Md|M|k)?\s*€/);
  await expect(eurMatch.first(), "expect at least one marché amount").toBeVisible({
    timeout: 15_000,
  });
});
