import { chromium } from 'playwright';
const SHOT = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/f483229c-dea2-4de9-ade7-0745c0da1a5e/scratchpad';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:3000/us/city/sf/the-city', { waitUntil: 'networkidle', timeout: 120000 });
await p.waitForSelector('canvas', { timeout: 60000 });
await p.waitForTimeout(9000);
// drag the year rail back to ~1925
const rail = await p.locator('input[type=range]').first();
if (await rail.count()) {
  await rail.evaluate((el) => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    set.call(el, '1925');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  console.log('rail set to 1925');
} else { console.log('no range input found'); }
await p.waitForTimeout(6000);
await p.screenshot({ path: `${SHOT}/rail-1925.png` });
const panel = p.locator('.fx-city-record-cap').first();
if (await panel.count()) {
  const box = await panel.evaluateHandle(n => n.closest('aside,section,div'));
  const el = box.asElement();
  if (el) await el.screenshot({ path: `${SHOT}/rail-1925-panel.png` });
}
await b.close();
