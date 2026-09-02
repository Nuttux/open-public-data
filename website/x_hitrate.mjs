import { chromium, devices } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'en-US' });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.fx-city-controls', { timeout: 90000 });
await p.waitForTimeout(2000);
for (const stop of ['Whole city', 'District', 'A few streets', 'Street']) {
  await p.getByRole('button', { name: stop, exact: true }).tap();
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    const t = window.__cityTiles; const st = document.querySelector('.fx-city-stage').getBoundingClientRect();
    let hits = 0, n = 0; for (let fy = 0.15; fy <= 0.86; fy += 0.1) for (let fx = 0.15; fx <= 0.86; fx += 0.1) { n++; if (t.pickAt(st.width * fx, st.height * fy) !== null) hits++; }
    return { zoom: +t.map.getZoom().toFixed(2), hits, n };
  });
  console.log(stop, JSON.stringify(r));
}
await b.close();
