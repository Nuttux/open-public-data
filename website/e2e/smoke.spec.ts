import { test, expect } from "@playwright/test";

/**
 * Smoke tests — golden path : chaque page clé répond 200 et rend un titre
 * non vide. Vise à attraper les régressions de routes / layout / 500
 * runtime que la build statique ne voit pas (les pages dynamiques peuvent
 * casser à la requête sans casser le build).
 *
 * NB : les routes sont celles de la branche `test` au moment où ces tests
 * ont été écrits (avant le pivot URL `/ville/[slug]` / `/france`). Quand
 * le refactor de routes sera mergé, mettre à jour les paths ci-dessous.
 */
const PAGES = [
  { url: "/", name: "landing" },
  { url: "/budget", name: "Paris — budget" },
  { url: "/marches-publics", name: "Paris — marchés publics" },
  { url: "/qui-recoit", name: "Paris — subventions / qui reçoit" },
  { url: "/investissements", name: "Paris — investissements" },
  { url: "/methode", name: "méthode" },
];

for (const page of PAGES) {
  test(`${page.name} (${page.url}) répond et affiche un h1`, async ({ page: pw }) => {
    const response = await pw.goto(page.url, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `HTTP status for ${page.url}`).toBe(200);

    // Au moins un titre principal non vide. On accepte h1 ou un élément
    // role=heading level=1 — différents pages utilisent l'un ou l'autre.
    const h1Count = await pw.locator("h1").count();
    expect(h1Count, `at least one h1 on ${page.url}`).toBeGreaterThan(0);

    const firstH1Text = (await pw.locator("h1").first().textContent())?.trim() ?? "";
    expect(firstH1Text.length, `non-empty h1 on ${page.url}`).toBeGreaterThan(0);
  });
}

test("landing — pas d'erreur de console critique", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("/", { waitUntil: "networkidle" });

  // Filter out noise: 404s for optional assets, third-party SDK warnings, etc.
  // We only fail on hard runtime errors that point at our own code.
  const ourErrors = errors.filter(
    (e) =>
      !/(posthog|leaflet|favicon|404|net::ERR_)/i.test(e) &&
      !/Hydration failed/i.test(e), // hydration is a known issue tracked separately
  );

  expect(ourErrors, `unexpected console errors on landing:\n${ourErrors.join("\n")}`).toEqual([]);
});
