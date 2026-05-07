import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();

const cases = [
  { name: "Default (salarié médian Paris)", url: "" },
  { name: "Salaire + pension", url: "?net=2100&pension=500" },
  { name: "Capital seul", url: "?net=0&capital=120000" },
  { name: "Mix complet", url: "?net=3750&parts=2&pension=300&capital=10000&indep_ca=20000&indep_type=services_bic" },
];

for (const c of cases) {
  await p.goto(`http://localhost:3000/daily-bread${c.url}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);
  const hero = await p.locator('.db-p-calc-preview-num').first().textContent().catch(() => "—");
  const eyebrow = await p.locator('.db-p-hero-eyebrow').first().textContent().catch(() => "—");
  console.log(`\n=== ${c.name} ===\n  Hero: ${(hero||'').trim()}\n  Eyebrow: ${(eyebrow||'').trim()}`);
}

// Capture du fold default
await p.goto('http://localhost:3000/daily-bread', { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
await p.screenshot({ path: '/tmp/finance-mockups/PROD-phase4bis-fold.png', clip: { x:0, y:0, width:1440, height:900 } });

// Déplier le toggle "+ J'ai d'autres revenus"
const toggle = p.locator('details:has(summary:has-text("autres revenus"))').first();
if (await toggle.count() > 0) {
  await toggle.locator('summary').click();
  await p.waitForTimeout(500);
  await toggle.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  const box = await toggle.boundingBox();
  if (box) {
    await p.screenshot({ path: '/tmp/finance-mockups/PROD-phase4bis-other-incomes.png', clip: { x:0, y:Math.max(0,box.y-30), width:1440, height: Math.min(900, box.height+60) } });
  }
}

await browser.close();
console.log('done');
