/* The desktop city page as a first visitor, with legibility read off the DOM. */
import { chromium } from 'playwright';
import { REF } from './x_common.mjs';
const BASE = process.env.BASE || 'https://www.qipu.org'; const OUT = process.env.OUT;
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const measure = () => ({
  small: (() => { const out = []; const seen = new Set(); const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = walk.nextNode())) { const t = n.textContent.trim(); if (!t) continue; const el = n.parentElement; const r = el.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight) continue; const cs = getComputedStyle(el); const fs = parseFloat(cs.fontSize); if (fs < 12 && !seen.has(el)) { seen.add(el); out.push({ px: +fs.toFixed(1), t: t.slice(0, 40), cls: el.className?.toString().slice(0, 30) }); } } return out; })(),
  contrast: (() => { const L = (c) => { const m = c.match(/\d+(\.\d+)?/g)?.map(Number); if (!m) return null; const [r, g, b] = m.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; const bg = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(250,250,247)'; }; const sel = ['.fx-city-strip p', '.fx-city-help', '.fx-city-record-lede, .fx-city-record p', '.fx-city-record-cap', '.fx-city-subjrow-cap', '.fx-city-controls-cap', '.fx-city-stat, .fx-city-meta', '.fx-footer-sources-meta', '.fx-city-preset', 'footer p, .fx-footer-blurb']; return sel.map((s) => { const el = document.querySelector(s); if (!el) return { s, none: true }; const cs = getComputedStyle(el); const fg = cs.color, bgc = bg(el); const l1 = L(fg), l2 = L(bgc); if (l1 == null || l2 == null) return { s, fg, bgc }; const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); return { s, px: parseFloat(cs.fontSize), ratio: +ratio.toFixed(2), weight: cs.fontWeight, t: el.textContent.trim().slice(0, 40) }; }); })(),
  targets: [...document.querySelectorAll('button, a[href], input, [role=button]')].map((e) => { const r = e.getBoundingClientRect(); return { t: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }; }).filter((x) => x.w > 0 && x.top >= 0 && x.top < innerHeight && (x.w < 24 || x.h < 24)),
  counts: { buttons: document.querySelectorAll('button').length, visibleButtons: [...document.querySelectorAll('button')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.top < innerHeight; }).length },
  stage: (() => { const e = document.querySelector('.fx-city-stage'); const r = e?.getBoundingClientRect(); return r ? { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width), share: +(r.height / innerHeight).toFixed(2) } : null; })(),
  ledger: (() => { const e = document.querySelector('.fx-city-ledger'); const r = e?.getBoundingClientRect(); return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null; })(),
});
for (const [tag, vw, vh] of [['w', 1440, 820], ['s', 1280, 720]]) {
  const p = await b.newPage({ viewport: { width: vw, height: vh } });
  const t0 = Date.now();
  await p.goto(`${BASE}/us/city/sf/the-city`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/${tag}0-first.jpg`, type: 'jpeg', quality: 70 });
  await p.waitForFunction(() => !document.querySelector('.fx-city-loading'), null, { timeout: 240000 });
  const ready = Date.now() - t0; await p.waitForTimeout(3000);
  console.log(tag, 'ready ms', ready, JSON.stringify(await p.evaluate(measure)));
  await p.screenshot({ path: `${OUT}/${tag}1-ready.jpg`, type: 'jpeg', quality: 70 });
  if (tag === 's') { await p.screenshot({ path: `${OUT}/${tag}2-full.jpg`, type: 'jpeg', quality: 60, fullPage: true }); await p.close(); continue; }
  // close the strip
  const x = await p.$('.fx-city-strip button'); if (x) { await x.click(); await p.waitForTimeout(800); }
  await p.screenshot({ path: `${OUT}/${tag}2-clean.jpg`, type: 'jpeg', quality: 70 });
  // district + click a block
  await p.evaluate(([ref]) => { const e = window.__cityGL; if (!e) return; }, [REF]);
  const district = await p.$('.fx-city-controls button:nth-child(3), button:has-text("District")'); if (district) { await district.click(); await p.waitForTimeout(2500); }
  const c = await (await p.$('canvas')).boundingBox();
  await p.mouse.click(c.x + c.width * 0.45, c.y + c.height * 0.5); await p.waitForTimeout(3500);
  console.log(tag, 'after click', JSON.stringify(await p.evaluate(() => ({ ledgerText: document.querySelector('.fx-city-ledger')?.textContent?.trim().slice(0, 140), recordH: document.querySelector('.fx-city-record')?.scrollHeight }))));
  await p.screenshot({ path: `${OUT}/${tag}3-record.jpg`, type: 'jpeg', quality: 70 });
  // play
  const play = await p.$('button[aria-label*="Play"], .fx-city-scrub-play'); if (play) { await play.click(); await p.waitForTimeout(3500); await p.screenshot({ path: `${OUT}/${tag}4-play.jpg`, type: 'jpeg', quality: 70 }); await play.click(); }
  // subject
  const chip = await p.$('.fx-city-chips button:nth-child(4)'); if (chip) { await chip.click(); await p.waitForTimeout(2000); await p.screenshot({ path: `${OUT}/${tag}5-subject.jpg`, type: 'jpeg', quality: 70 }); await chip.click(); }
  // search
  const inp = await p.$('.fx-city-find input'); if (inp) { await inp.click(); await p.keyboard.type('mission'); await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/${tag}6-search.jpg`, type: 'jpeg', quality: 70 }); await p.keyboard.press('Escape'); }
  // keyboard focus
  await p.mouse.click(c.x + 10, c.y + 10); for (let i = 0; i < 8; i++) await p.keyboard.press('Tab'); await p.waitForTimeout(300);
  console.log(tag, 'focused', await p.evaluate(() => { const a = document.activeElement; const cs = getComputedStyle(a); return { tag: a.tagName, t: (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 30), outline: cs.outlineStyle + ' ' + cs.outlineWidth, boxShadow: cs.boxShadow.slice(0, 40) }; }));
  await p.screenshot({ path: `${OUT}/${tag}7-focus.jpg`, type: 'jpeg', quality: 70 });
  // film
  const film = await p.$('button:has-text("WATCH"), button:has-text("Watch")'); if (film) { await film.click(); await p.waitForTimeout(4000); await p.screenshot({ path: `${OUT}/${tag}8-film.jpg`, type: 'jpeg', quality: 70 }); }
  await p.close();
}
await b.close();
