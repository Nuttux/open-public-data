import puppeteer from '/Users/daniel/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { mkdir, readdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOCKUP_DIR = join(__dirname, 'mockups/06-fusion');
const OUT_DIR = join(__dirname, 'mockups/06-fusion/_desktop-previews');

const WIDTH = 1440;
const HEIGHT = 900;

await mkdir(OUT_DIR, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const files = (await readdir(MOCKUP_DIR)).filter(f => f.endsWith('.html'));
console.log(`Found ${files.length} pages:`, files);

for (const file of files) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

  const url = `file://${join(MOCKUP_DIR, file)}`;
  const base = file.replace('.html', '');
  console.log(`📸 ${file}`);
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));

    // Top of page
    await page.screenshot({ path: join(OUT_DIR, `${base}-01-top.png`), type: 'png' });

    // Mid page
    await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 1.1, behavior: 'instant' }));
    await new Promise(r => setTimeout(r, 700));
    await page.screenshot({ path: join(OUT_DIR, `${base}-02-mid.png`), type: 'png' });

    // Lower
    await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 2.3, behavior: 'instant' }));
    await new Promise(r => setTimeout(r, 700));
    await page.screenshot({ path: join(OUT_DIR, `${base}-03-lower.png`), type: 'png' });

    // Deep
    await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 3.5, behavior: 'instant' }));
    await new Promise(r => setTimeout(r, 700));
    await page.screenshot({ path: join(OUT_DIR, `${base}-04-deep.png`), type: 'png' });
  } catch (e) {
    console.error(`❌ ${file}: ${e.message}`);
  }
  await page.close();
}

await browser.close();
console.log(`\n🎉 Saved to ${OUT_DIR}/`);
