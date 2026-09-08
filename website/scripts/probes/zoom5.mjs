import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:3008';
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 820 } });
await p.goto(`${BASE}/us/city/sf/the-city?probe=1`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-controls', { timeout: 240000 }); await p.waitForTimeout(1500);
const cam = () => p.evaluate(() => { const e = window.__cityGL; const c = e.getCamera(); return `scale ${c.scale.toFixed(4)} step ${e.step} warm ${e.adaptive ? '' : ''}`; });
const clickAndTrace = async (label) => {
  const btn = await p.$(`.fx-city-controls .fx-city-preset:text-is("${label}")`); const box = await btn.boundingBox(); console.log(label, 'box', box && `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)}`, 'topmost at centre:', await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName + '.' + (e.className || '').toString().slice(0, 40) + ' "' + e.textContent.trim().slice(0, 14) + '"' : null; }, [box.x + box.width / 2, box.y + box.height / 2]));
  const b0 = await cam(); await btn.click(); const out = [b0]; for (const ms of [0, 100, 500, 2000]) { await p.waitForTimeout(ms); out.push(await cam()); } console.log('  ', out.join(' → '));
};
await clickAndTrace('District');
await clickAndTrace('Whole city');
console.log('-- 15 s later (warm-up done) --'); await p.waitForTimeout(15000);
await clickAndTrace('District');
await clickAndTrace('Street');
await b.close();
