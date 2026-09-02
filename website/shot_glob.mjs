import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 60000 });
await p.waitForTimeout(9000);
const g = await p.evaluate(() => {
  const keys = Object.keys(window).filter(k => /^__/.test(k));
  const r = window.__cityRenderer;
  return { globals: keys, renderer: r ? Object.keys(r).slice(0,30) : null };
});
console.log(JSON.stringify(g, null, 1).slice(0, 900));
await b.close();
