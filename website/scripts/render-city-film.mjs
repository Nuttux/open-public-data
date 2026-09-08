/* ═══════════════════════════════════════════════════════════════════════
   scripts/render-city-film.mjs — THE FILM, FRAME BY FRAME, FOR THE PHONES.

   The desktop plays the film live on the GPU page. A phone cannot run the
   engine, so it gets the same film as a video: this drives the live page
   under Playwright's fake clock — the player's own rAF and `now()` — and
   advances it one frame at a time, so every frame is exactly the frame the
   film would paint at that millisecond, whatever the machine is doing.
   The film chrome (captions, the year, the scans) is part of the picture;
   every other control on the stage is hidden.

   usage: node scripts/render-city-film.mjs [--base http://localhost:3007]
            [--out DIR] [--fps 24] [--seconds N] [--from S] [--width 1280] [--height 720]
            [--dpr 1.5]
   needs a DEV server (the film handle `__cityGLFilm` is dev-only), then:
     ffmpeg -framerate 24 -i DIR/f%05d.jpg -c:v libx264 -crf 21 -preset slow
       -pix_fmt yuv420p -vf scale=1280:-2 -movflags +faststart film-720.mp4
   ═══════════════════════════════════════════════════════════════════════ */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:3007');
const OUT = path.resolve(arg('--out', 'film-frames'));
const FPS = Number(arg('--fps', 24));
const SECONDS = Number(arg('--seconds', 0));
const FROM = Number(arg('--from', 0)); // seconds into the film to start from (a test of one shot)
const W = Number(arg('--width', 1280)), H = Number(arg('--height', 720)), DPR = Number(arg('--dpr', 1.5));
fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-gl=angle', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: W, height: H + 200 }, deviceScaleFactor: DPR });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.error('PAGEERROR', e.message.slice(0, 160)));
await p.addInitScript(() => { try { performance.setResourceTimingBufferSize(5000); } catch {} });
await p.goto(`${BASE}/us/city/sf/the-city?tiles=0`, { waitUntil: 'domcontentloaded', timeout: 300000 });
/* the stage is the frame: W x H, no ledger beside it, nothing on it but the
   canvas and the film's own chrome */
await p.addStyleTag({ content: `
  .theme-fusion .fx-city-shell, .theme-fusion .fx-city-wrap { --fx-city-ledger: 0px !important; --fx-city-h: ${H}px !important; }
  .theme-fusion .fx-city-stage { height: ${H}px !important; min-height: 0 !important; border: 0 !important; }
  .theme-fusion .fx-city-ledger, .theme-fusion .fx-city-find, .theme-fusion .fx-city-controls,
  .theme-fusion .fx-city-strip, .theme-fusion .fx-city-drawnas, .theme-fusion .fx-city-system-note,
  .theme-fusion .fx-city-help, .fxgl-film-ctl { display: none !important; }
  [data-citygl-film-chrome] { min-height: 0 !important; }
` });
await p.waitForFunction(() => !!window.__cityGL && !!window.__cityGLFilm, null, { timeout: 300000 });
await p.waitForFunction(() => { const n = performance.getEntriesByType('resource').filter((r) => r.name.includes('/data/') && !/film\//.test(r.name)).length; const now = Date.now(); if (window.__lastN !== n) { window.__lastN = n; window.__lastT = now; return false; } return window.__lastT !== undefined && now - window.__lastT > 4000; }, null, { timeout: 600000, polling: 300 });
await p.waitForTimeout(6000);
const stage = await p.locator('.fx-city-stage').boundingBox();
const vp = await p.evaluate(() => window.__cityGL.viewport);
const total = await p.evaluate(() => window.__cityGLFilm.total);
console.log('stage', stage, 'engine viewport', vp, 'film ms', total);
if (Math.round(stage.width) !== W || Math.round(stage.height) !== H) { console.error('stage is not the frame'); process.exit(1); }
const clip = { x: stage.x, y: stage.y, width: W, height: H };
const frameMs = 1000 / FPS;
const frames = Math.ceil((SECONDS > 0 ? SECONDS * 1000 : total - FROM * 1000) / frameMs);
/* SEEK, DON'T PLAY. The first cut of this script ran the film under
   Playwright's fake clock; the engine painted only in bursts under it (frames
   identical for a second, then a jump), so the capture is a seek per frame in
   real time instead. `play(0)` mounts the chrome; freezing `performance.now`
   right after makes the player's own tick a no-op (dt = 0), so `seek` is the
   only thing that moves the film. Everything the frame shows — camera, year,
   step, card wash — is a pure function of film ms (`film.ts` §WHAT IS TRUE AT
   FILM MILLISECOND t), so a seek IS the frame. */
await p.evaluate(() => {
  window.__cityGLFilm.play(0);
  const fixed = performance.now();
  performance.now = () => fixed;
});
await p.waitForTimeout(300);
const t0 = Date.now();
console.log('timeline', await p.evaluate(() => window.__cityGLFilm.timeline.segs.map((g) => `${g.k}@${(g.t0 / 1000).toFixed(1)}+${(g.ms / 1000).toFixed(1)}`).join(' ')));
for (let i = 0; i < frames; i++) {
  const t = FROM * 1000 + i * frameMs;
  await p.evaluate(async (ms) => {
    window.__cityGLFilm.seek(ms);
    window.__cityGL.renderNow();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, t);
  await p.screenshot({ path: path.join(OUT, `f${String(i).padStart(5, '0')}.jpg`), clip, type: 'jpeg', quality: 90 });
  if (i % 240 === 0) { const st = await p.evaluate(() => ({ t: Math.round(window.__cityGLFilm.t), running: window.__cityGLFilm.running })); console.log(`frame ${i}/${frames}  film t=${st.t} running=${st.running}  ${((Date.now() - t0) / 1000).toFixed(0)}s`); }
}
console.log(`done: ${frames} frames -> ${OUT}`);
await b.close();
