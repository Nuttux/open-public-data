/* On the WebGL 2 fallback: which programs fail the uniform-block limit and
   what is in that block; which program draws with a null attribute type. */
import { chromium } from 'playwright';
import { ARGS } from './x_common.mjs';
const BASE = process.env.BASE || 'http://localhost:3007';
const b = await chromium.launch({ args: ARGS });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.addInitScript(() => {
  const P = WebGL2RenderingContext.prototype;
  const src = new WeakMap(); const progSh = new WeakMap();
  window.__fail = []; window.__nulltype = [];
  const oS = P.shaderSource; P.shaderSource = function (sh, s) { src.set(sh, s); return oS.call(this, sh, s); };
  const oA = P.attachShader; P.attachShader = function (pr, sh) { (progSh.get(pr) || progSh.set(pr, []).get(pr)).push(sh); return oA.call(this, pr, sh); };
  const oL = P.getProgramInfoLog; P.getProgramInfoLog = function (pr) {
    const log = oL.call(this, pr);
    if (log && /exceeds/.test(log) && window.__fail.length < 3) {
      const shs = progSh.get(pr) || []; const vs = shs.map((s) => src.get(s) || '').find((s) => /gl_Position|vertex|VERTEX/i.test(s)) || '';
      const block = vs.match(/uniform\s+NodeBuffer_\d+\s*\{[^}]*\}/s); const members = block ? block[0].split('\n').filter((l) => /\[|vec|float|int|mat/.test(l)).map((l) => l.trim()) : [];
      const big = members.filter((m) => /\[\s*\d+\s*\]/.test(m)).sort((a, b) => Number(b.match(/\[(\d+)\]/)[1]) - Number(a.match(/\[(\d+)\]/)[1])).slice(0, 8);
      const attrs = [...vs.matchAll(/in\s+\w+\s+(\w+)\s*;/g)].map((m) => m[1]).slice(0, 20);
      window.__fail.push({ log: log.slice(0, 90), members: members.length, big, attrs });
    }
    return log;
  };
  const oV = P.vertexAttribPointer; P.vertexAttribPointer = function (i, size, type, n, st, off) {
    if (type == null && window.__nulltype.length < 4) { const pr = this.getParameter(this.CURRENT_PROGRAM); const shs = progSh.get(pr) || []; const vs = shs.map((s) => src.get(s) || '').find((s) => /gl_Position/.test(s)) || ''; const attrs = [...vs.matchAll(/in\s+(\w+)\s+(\w+)\s*;/g)].map((m) => m[1] + ' ' + m[2]).slice(0, 20); window.__nulltype.push({ index: i, size, attrs }); }
    return oV.call(this, i, size, type, n, st, off);
  };
});
await p.goto(`${BASE}/us/city/sf/the-city?tiles=0&probe=1&gl=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
await p.waitForFunction(() => window.__cityGL && !document.querySelector('.fx-city-loading'), null, { timeout: 180000 });
await p.waitForTimeout(6000);
console.log(JSON.stringify(await p.evaluate(() => ({ fail: window.__fail, nulltype: window.__nulltype })), null, 1));
await b.close();
