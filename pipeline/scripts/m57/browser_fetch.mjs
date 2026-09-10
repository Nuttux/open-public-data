// Récupère des pages avec un vrai navigateur (Chromium Playwright), pour les
// sites qui refusent urllib : protections anti-robot, pages construites en JS,
// lecteurs Calameo. Usage : node browser_fetch.mjs <headed:0|1> <outdir> <url>...
// Écrit <outdir>/<n>.html ou <n>.pdf et un index JSON sur stdout.
import { chromium } from 'playwright';
import fs from 'fs'; import path from 'path'; import crypto from 'crypto';
const [headed, outdir, ...urls] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ headless: headed !== '1', args: ['--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({ locale: 'fr-FR', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36', viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const out = {};
for (const url of urls) {
  const id = crypto.createHash('md5').update(url).digest('hex').slice(0, 10);
  const page = await ctx.newPage();
  try {
    const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
    const d = await dl;
    if (d) { const p = path.join(outdir, id + '.pdf'); await d.saveAs(p); out[url] = { kind: 'pdf', file: p, status: 200 }; await page.close(); continue; }
    const ct = resp ? (resp.headers()['content-type'] || '') : '';
    if (ct.includes('pdf')) { const buf = await resp.body(); const p = path.join(outdir, id + '.pdf'); fs.writeFileSync(p, buf); out[url] = { kind: 'pdf', file: p, status: resp.status() }; await page.close(); continue; }
    // anti-robot : attendre que le défi passe
    for (let i = 0; i < 6; i++) { const t = (await page.title()).toLowerCase(); if (!/just a moment|attention required|access denied|un instant|vérification/.test(t)) break; await page.waitForTimeout(3000); }
    await page.waitForTimeout(1500);
    // Calameo : chercher un lien de téléchargement
    let calameo = null;
    if (/calameo\.com/.test(url)) {
      calameo = await page.evaluate(() => { const a = [...document.querySelectorAll('a[href*="download"], a[href$=".pdf"]')]; return a.map(x => x.href).slice(0, 5); });
    }
    const html = await page.content();
    const p = path.join(outdir, id + '.html'); fs.writeFileSync(p, html);
    out[url] = { kind: 'html', file: p, status: resp ? resp.status() : null, final: page.url(), title: await page.title(), calameo };
  } catch (e) { out[url] = { kind: 'error', error: String(e).slice(0, 120) }; }
  await page.close();
}
await browser.close();
console.log(JSON.stringify(out));
