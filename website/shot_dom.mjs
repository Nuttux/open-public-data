import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 60000 });
await p.waitForTimeout(9000);
const els = await p.evaluate(() => {
  const out = [];
  document.querySelectorAll('*').forEach(n => {
    const c = typeof n.className === 'string' ? n.className : '';
    if (/rail|year|scrub|slider|timeline/i.test(c)) {
      const r = n.getBoundingClientRect();
      if (r.width > 4 && r.height > 4) out.push(`${n.tagName}.${c.slice(0,44)} ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  });
  return out.slice(0, 20);
});
console.log(els.join('\n'));
await b.close();
