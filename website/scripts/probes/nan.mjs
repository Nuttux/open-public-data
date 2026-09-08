import { chromium } from 'playwright';
import { ARGS } from './x_common.mjs';
const BASE = process.env.BASE || 'http://localhost:3007';
const b = await chromium.launch({ args: ARGS });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const hits = []; p.on('console', (m) => { if (/NaN/.test(m.text())) hits.push(m.text().slice(0, 100)); });
await p.goto(`${BASE}/us/city/sf/the-city?tiles=0&probe=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await p.waitForFunction(() => window.__cityGL && !document.querySelector('.fx-city-loading'), null, { timeout: 120000 });
await p.waitForTimeout(12000);
const r = await p.evaluate(() => {
  const e = window.__cityGL; const out = [];
  e.scene.traverse((o) => { const g = o.geometry; if (!g) return; const s = g.boundingSphere; const pos = g.attributes.position; if (s && Number.isNaN(s.radius)) out.push({ layer: o.userData.layer, type: o.type, name: o.name, posLen: pos?.array.length, count: pos?.count }); });
  return out;
});
console.log('NaN spheres:', JSON.stringify(r), 'console hits:', hits.length);
await b.close();
