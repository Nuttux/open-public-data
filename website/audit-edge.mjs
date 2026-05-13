import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();

const edges = [
  { name: "Net énorme 50000 (cadre dirigeant)", url: "?net=50000&parts=2" },
  { name: "Parts max 4 enfants", url: "?net=3750&parts=4" },
  { name: "Net négatif (cassage)", url: "?net=-100&parts=1" },
  { name: "Parts décimales", url: "?net=2100&parts=2.5" },
  { name: "Commune inexistante", url: "?net=2100&c=zob-zob" },
  { name: "Propriétaire avec TF 0 (auto)", url: "?owner=1&net=2100" },
  { name: "Propriétaire avec TF custom 5000", url: "?owner=1&tf=5000&net=2100" },
];

for (const e of edges) {
  await p.goto(`http://localhost:3000/daily-bread${e.url}`, { waitUntil: 'networkidle', timeout: 15000 });
  await p.waitForTimeout(800);
  const hero = await p.locator('.db-p-calc-preview-num').first().textContent().catch(() => "—");
  const errs = await p.locator('text=NaN, text=undefined').count();
  console.log(`${e.name}\n  Hero: ${(hero||'').trim().replace(/\s+/g,' ')} | NaN/undef: ${errs}`);
}

await browser.close();
