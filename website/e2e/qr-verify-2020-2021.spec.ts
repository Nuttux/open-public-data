import { test, expect } from "@playwright/test";

/**
 * 2020 et 2021 sont les deux exercices dont le portail open data de la Ville
 * publie les montants sans les noms : les bénéficiaires ont été reconstitués
 * depuis l'annexe B8.1.1 du compte administratif. Ce test garde cette
 * reconstitution en vie — sans elle, la page afficherait un total sans
 * personne derrière.
 *
 * Réécrit le 2026-09-16 pour la page refaite la veille : les années ne sont
 * plus du texte à cliquer (le rail n'écrit que les bouts de l'axe et sert de
 * repli), l'exercice vit dans l'adresse, et la page ouvre sur les thèmes —
 * les noms viennent quand on bascule la découpe sur « Par bénéficiaire ».
 */
const BASE = "http://localhost:3000/fr/france/paris/subventions";
const CASVP = /CENTRE.*ACTION.*SOCIALE/i;

for (const year of [2020, 2021]) {
  test(`subventions ${year} : des bénéficiaires nommés, dont le centre d'action sociale`, async ({ page }) => {
    await page.goto(`${BASE}?year=${year}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Par bénéficiaire" }).click();
    await expect(page.getByText(CASVP).first()).toBeVisible();
  });
}

test("le rail des années porte les deux exercices reconstitués", async ({ page }) => {
  await page.goto(`${BASE}?year=2024`, { waitUntil: "networkidle" });
  const rail = page.locator('[data-section="years"]');
  await expect(rail).toBeVisible();
  for (const year of [2020, 2021]) {
    await expect(rail.getByRole("button", { name: new RegExp(String(year)) }).first()).toBeVisible();
  }
});

test("sur téléphone, un exercice reconstitué reste lisible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}?year=2021`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Par bénéficiaire" }).click();
  await expect(page.getByText(CASVP).first()).toBeVisible();
  const debord = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(debord).toBeLessThanOrEqual(1);
});
