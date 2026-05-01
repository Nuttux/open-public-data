import { chromium, devices } from 'playwright';
import fs from 'fs';

const OUT = '/tmp/bench_shots';
fs.mkdirSync(OUT, { recursive: true });

const pages = [
  ['home', '/'],
  ['budget', '/budget'],
  ['qui-recoit', '/qui-recoit'],
  ['marches', '/marches-publics'],
  ['investissements', '/investissements'],
  ['logement', '/logement-social'],
  ['dette', '/dette-patrimoine'],
  ['analyses', '/analyses'],
  ['methode', '/methode'],
  ['article-hors-bilan', '/analyses/hors-bilan-12-milliards-garanties-emprunt'],
];

const browser = await chromium.launch();

async function shoot(viewport, label) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    userAgent: devices['iPhone 13'].userAgent,
  });
  const page = await ctx.newPage();
  for (const [name, path] of pages) {
    try {
      await page.goto(`http://localhost:3000${path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/${label}_${name}.png`, fullPage: false });
      console.log(`ok ${label} ${name}`);
    } catch (e) {
      console.log(`ERR ${label} ${name}: ${e.message.slice(0,80)}`);
    }
  }
  await ctx.close();
}

await shoot({ width: 1440, height: 900 }, 'desktop');
await shoot({ width: 390, height: 844 }, 'mobile');

await browser.close();
console.log('done');
