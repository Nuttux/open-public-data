/* The phone map at two viewport heights: Safari with its bars (664) and a bare 844. Landing, the strip dismissed, search open, a stop pressed. */
import { chromium, devices } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:3007';
const b = await chromium.launch();
for (const H of [664, 844]) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: H }, locale: 'en-US' });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.waitForSelector('.fx-city-stoprow', { timeout: 180000 });
  await p.waitForTimeout(2500);
  const m = await p.evaluate(() => { const st = document.querySelector('.fx-city-stage').getBoundingClientRect(); const sr = document.querySelector('.fx-city-stoprow')?.getBoundingClientRect(); const fb = document.querySelector('.fx-city-find-btn')?.getBoundingClientRect(); const cr = document.querySelector('.fx-city-clockrow')?.getBoundingClientRect(); return { stage: [Math.round(st.top), Math.round(st.height)], stops: sr ? [Math.round(sr.top), Math.round(sr.height)] : null, findBtn: fb ? [Math.round(fb.width), Math.round(fb.height)] : null, rail: cr ? Math.round(cr.top) : null, vh: innerHeight }; });
  console.log(`H=${H}`, JSON.stringify(m));
  await p.screenshot({ path: `${process.env.SCR}/ph${H}-landing.png` });
  await p.getByRole('button', { name: 'Street', exact: true }).tap(); await p.waitForTimeout(2000);
  await p.screenshot({ path: `${process.env.SCR}/ph${H}-street.png` });
  await p.locator('.fx-city-find-btn').tap(); await p.waitForTimeout(600);
  const focused = await p.evaluate(() => document.activeElement?.tagName);
  console.log(`H=${H} search open, focused:`, focused);
  await p.screenshot({ path: `${process.env.SCR}/ph${H}-search.png` });
  await ctx.close();
}
await b.close();
