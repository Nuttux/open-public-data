// Recherche Google dans un vrai Chromium (visible) : accepte le bandeau de
// consentement, attend les résultats, renvoie les URL par requête (JSON).
// usage : node google_search.mjs <profil_dir> <requête>...
import { chromium } from '/Users/daniel/code/open-public-data/website/node_modules/playwright/index.mjs';
const [profile, ...queries] = process.argv.slice(2);
const ctx = await chromium.launchPersistentContext(profile, { headless: false, locale: 'fr-FR', viewport: { width: 1200, height: 900 }, args: ['--disable-blink-features=AutomationControlled'] });
const page = await ctx.newPage();
const log = (...a) => console.error(new Date().toISOString().slice(11,19), ...a);
setTimeout(async () => { log('HARD TIMEOUT', page.url()); await page.screenshot({ path: 'gs_timeout.png' }).catch(() => {}); process.exit(2); }, 100000 + 20000 * queries.length);
const out = {};
for (const q of queries) {
  try {
    log('goto', q);
    await page.goto('https://www.google.com/search?hl=fr&num=20&q=' + encodeURIComponent(q), { waitUntil: 'domcontentloaded', timeout: 45000 });
    for (let i = 0; i < 10; i++) {
      const url = page.url(); log('loop', i, url.slice(0, 90), (await page.title()).slice(0, 60));
      if (/consent\.google/.test(url) || (await page.$('button:has-text("Tout accepter")'))) {
        const b = await page.$('button:has-text("Tout accepter")') || await page.$('button:has-text("Accepter tout")') || await page.$('#L2AGLb');
        if (b) { await b.click().catch(() => {}); await page.waitForTimeout(2000); continue; }
      }
      if (/\/sorry\//.test(url)) { out[q] = { error: 'captcha', url }; await page.waitForTimeout(15000); continue; }
      if (await page.$('#search')) break;
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: 'gs_' + Object.keys(out).length + '.png' }).catch(() => {});
    if (!out[q]) {
      // Le lien d'un résultat est l'ancre qui enveloppe son <h3>
      // Les résultats pointent vers /goto?url=<jeton> : on résout chaque jeton
      // en suivant la redirection depuis le même contexte (sans charger la page).
      const pairs = await page.$$eval('h3', hs => hs.map(h => { const a = h.closest('a'); return a ? [a.href, h.textContent] : null; }).filter(Boolean));
      const urls = []; const titles = [];
      for (const [href, title] of pairs.slice(0, 15)) {
        let real = href;
        if (/\/goto\?url=|\/url\?/.test(href)) {
          try {
            const r = await ctx.request.get(href, { maxRedirects: 0, timeout: 15000 });
            const loc = r.headers()['location'];
            if (loc) real = loc; else { const m = /url=([^&]+)/.exec(href); if (m && /^https?/.test(decodeURIComponent(m[1]))) real = decodeURIComponent(m[1]); else real = null; }
          } catch (e) { real = null; }
        }
        if (real && /^https?:/.test(real) && !/google\.[a-z]+\/|gstatic|googleusercontent|youtube\.com|webcache/.test(real)) { urls.push(real); titles.push(title); }
      }
      log('resolved', urls.length, 'of', pairs.length);
      out[q] = { urls: [...new Set(urls)], titles, final: page.url(), title: await page.title(), n_a: (await page.$$('a')).length };
    }
  } catch (e) { out[q] = { error: String(e).slice(0, 120) }; }
  await page.waitForTimeout(4000 + Math.random() * 4000);
}
log('done'); console.log(JSON.stringify(out));
await ctx.close().catch(() => {}); process.exit(0);
