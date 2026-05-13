import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const p = await ctx.newPage();

const profiles = [
  { name: "SMIC célib Paris", url: "?net=1426&parts=1&c=paris" },
  { name: "Médian célib Paris (default)", url: "" },
  { name: "Cadre couple Paris (3750/2)", url: "?net=3750&parts=2&c=paris" },
  { name: "Cadre sup couple+2enf Marseille", url: "?net=6000&parts=3&c=marseille" },
  { name: "Très haut Paris", url: "?net=15000&parts=2&c=paris" },
  { name: "Net=0 (edge)", url: "?net=0&parts=1" },
];

for (const prof of profiles) {
  await p.goto(`http://localhost:3000/daily-bread${prof.url}`, { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(800);
  // Récupère les chiffres du hero, des dispatch, des sub-rows
  const heroNum = await p.locator('.db-p-calc-preview-num').first().textContent().catch(() => "—");
  const dispatchSegs = await p.locator('.db-p-disp-stack-tri-amt, .db-stack-tri-amt').allTextContents().catch(() => []);
  console.log(`\n=== ${prof.name} ===`);
  console.log(`  Hero: ${(heroNum||"").trim()}`);
  console.log(`  Dispatch: ${dispatchSegs.join(' | ')}`);
}

await browser.close();
