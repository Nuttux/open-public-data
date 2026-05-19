import { test, expect } from "@playwright/test";

const PAGES = [
  { url: "/", name: "landing" },
  { url: "/ville/paris/budget", name: "Paris — budget" },
  { url: "/ville/paris/marches", name: "Paris — marchés publics" },
  { url: "/ville/paris/subventions", name: "Paris — subventions" },
  { url: "/ville/paris/investissements", name: "Paris — investissements" },
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
