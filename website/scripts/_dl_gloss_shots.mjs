import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/ae39e695-b7df-40d0-91fe-a78de4ad2142/scratchpad/shots';
fs.mkdirSync(OUT, { recursive: true });

const SLUGS = ['hetch-hetchy', 'laguna-honda-hospital', 'sf-main-library'];
const BASE = 'http://localhost:3111/us/city/sf/places/place/';

const browser = await chromium.launch();
for (const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport });
  for (const slug of SLUGS) {
    await page.goto(BASE + slug, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${slug}-${label}.png`, fullPage: true });
    // pull the rendered document shelf so we can read what a visitor sees
    const txt = await page.evaluate(() => {
      const hit = [...document.querySelectorAll('h2,h3')].find(h => /document|archive|record/i.test(h.textContent || ''));
      return hit ? (hit.closest('section') || hit.parentElement)?.innerText?.slice(0, 1600) : null;
    });
    if (label === 'desktop') console.log(`\n===== ${slug} =====\n${txt || '(no document section found)'}`);
  }
  await page.close();
}
await browser.close();
console.log('\nshots ->', OUT);
