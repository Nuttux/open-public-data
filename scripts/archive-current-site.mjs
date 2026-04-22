import puppeteer from '/Users/daniel/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'archive', 'before-fusion');

const ROUTES = [
  { path: '/', name: 'landing' },
  { path: '/blog', name: 'blog' },
  { path: '/budget', name: 'budget' },
  { path: '/patrimoine', name: 'patrimoine' },
  { path: '/investissements', name: 'investissements' },
  { path: '/logements', name: 'logements' },
  { path: '/marches-publics', name: 'marches-publics' },
  { path: '/subventions', name: 'subventions' },
  { path: '/carte', name: 'carte' },
  { path: '/evolution', name: 'evolution' },
  { path: '/prevision', name: 'prevision' },
  { path: '/tableau-de-bord', name: 'tableau-de-bord' },
  { path: '/v2', name: 'v2' },
  { path: '/confidentialite', name: 'confidentialite' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

await mkdir(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

for (const vp of VIEWPORTS) {
  const vpDir = join(OUT_DIR, vp.name);
  await mkdir(vpDir, { recursive: true });

  for (const route of ROUTES) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });

    const url = `${BASE_URL}${route.path}`;
    console.log(`📸 [${vp.name}] ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
      await new Promise(r => setTimeout(r, 2500));

      await page.screenshot({
        path: join(vpDir, `${route.name}-01-top.png`),
        type: 'png',
      });

      await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 1.1, behavior: 'instant' }));
      await new Promise(r => setTimeout(r, 900));
      await page.screenshot({ path: join(vpDir, `${route.name}-02-mid.png`), type: 'png' });

      await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 2.3, behavior: 'instant' }));
      await new Promise(r => setTimeout(r, 900));
      await page.screenshot({ path: join(vpDir, `${route.name}-03-lower.png`), type: 'png' });

      await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
      await new Promise(r => setTimeout(r, 900));
      await page.screenshot({
        path: join(vpDir, `${route.name}-04-full.png`),
        type: 'png',
        fullPage: true,
      });
    } catch (e) {
      console.error(`❌ ${route.path} [${vp.name}]: ${e.message}`);
    }
    await page.close();
  }
}

await browser.close();
console.log(`\n🎉 Archived to ${OUT_DIR}/`);
