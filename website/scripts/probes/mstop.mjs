import { chromium, devices } from 'playwright';
const BASE = process.env.BASE || 'https://www.qipu.org';
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 664 }, deviceScaleFactor: 2 });
const p = await ctx.newPage(); const logs = []; p.on('console', (m) => { if (/\[(tile|panel)\]/.test(m.text())) logs.push(m.text()); });
await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-stoprow', { timeout: 120000 }); await p.waitForTimeout(3000);
const sb = await (await p.$('.fx-city-stage')).boundingBox();
for (const [i, name] of [[2, 'District'], [3, 'A few streets'], [4, 'Street']]) {
  await p.click(`.fx-city-stoprow button:nth-child(${i})`); await p.waitForTimeout(3500);
  const lit = await p.evaluate(() => [...document.querySelectorAll('.fx-city-stoprow button')].findIndex((e) => e.getAttribute('aria-pressed') === 'true'));
  await p.touchscreen.tap(sb.x + sb.width * 0.7, sb.y + sb.height * 0.3); await p.waitForSelector('.fx-city-ledger', { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(3000);
  const st = await p.evaluate(() => { const l = document.querySelector('.fx-city-ledger'); if (!l) return null; const t = l.innerText; return { stop: l.dataset.stop, handle: document.querySelector('.fx-city-sheet-yr')?.textContent, decided: (t.match(/decided ([\d,]+) things/) || [])[1], crumb: [...l.querySelectorAll('.fx-block-rung')].map((e) => e.textContent.trim()).join(' › ').slice(0, 90) }; });
  console.log(name.padEnd(14), 'lit stop index', lit, JSON.stringify(st), '|', logs.splice(0).join(' ; '));
  const x = await p.$('.fx-city-sheet-close'); if (x) { await x.click(); await p.waitForTimeout(500); }
}
await b.close();
