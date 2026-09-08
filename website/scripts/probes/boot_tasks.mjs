/* attribute each long task during boot to the functions sampled inside it */
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:3007';
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.addInitScript(() => { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); window.__t0 = performance.timeOrigin; });
const cdp = await ctx.newCDPSession(p);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); const nowAtStart = await p.evaluate(() => performance.now()); await cdp.send('Profiler.start');
await p.goto(`${BASE}/us/city/sf/the-city?tiles=0&probe=1`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__cityGL && window.__cityGL.getStats().frames > 5, null, { timeout: 90000 }).catch(() => console.log('no frames'));
await p.waitForTimeout(9000);
const { profile } = await cdp.send('Profiler.stop');
const lt = await p.evaluate(() => ({ lt: window.__lt, origin: performance.timeOrigin }));
const byId = new Map(profile.nodes.map(n => [n.id, n]));
// sample absolute times (µs since epoch) -> ms since timeOrigin
let t = profile.startTime; const times = [];
for (let i = 0; i < profile.samples.length; i++) { t += profile.timeDeltas[i]; times.push((t - profile.startTime) / 1000 + nowAtStart); }
const parents = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parents.set(c, n.id);
const nameOf = (id) => { const cf = byId.get(id).callFrame; return `${cf.functionName || '(anon)'}:${cf.lineNumber}`; };
for (const [s, d] of lt.lt.filter(x => x[1] >= 50)) {
  const self = new Map(); const tops = new Map(); let n = 0;
  for (let i = 0; i < times.length; i++) { if (times[i] < s || times[i] > s + d) continue; n++; const id = profile.samples[i];
    self.set(nameOf(id), (self.get(nameOf(id)) || 0) + 1);
    // walk up to the deepest frame from src (not three/node_modules) with a real name
    let cur = id; let path = []; while (cur) { const cf = byId.get(cur).callFrame; if (cf.functionName && !/three|node_modules|react/.test(cf.url)) path.push(cf.functionName); cur = parents.get(cur); }
    const top = path.slice(-3).reverse().join('>'); tops.set(top, (tops.get(top) || 0) + 1); }
  const fmt = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}=${Math.round(100 * v / n)}%`).join(' ');
  console.log(`task @${Math.round(s)} ${Math.round(d)}ms samples=${n}\n  self: ${fmt(self)}\n  from: ${fmt(tops)}`);
}
const g = new Map(); const walk = (id) => { let cur = id; const path = []; while (cur) { const cf = byId.get(cur).callFrame; if (cf.functionName && !/three|node_modules|react/.test(cf.url)) path.push(cf.functionName); cur = parents.get(cur); } return path.slice(-3).reverse().join('>'); };
for (let i = 0; i < profile.samples.length; i++) { const k = walk(profile.samples[i]); g.set(k, (g.get(k) || 0) + (profile.timeDeltas[i] || 0) / 1000); }
console.log('GLOBAL ms by entry path:\n' + [...g.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22).map(([k, v]) => `${v.toFixed(0)} ${k}`).join('\n'));
const span = new Map();
for (let i = 0; i < profile.samples.length; i++) { const k = walk(profile.samples[i]); const e = span.get(k) || { a: Infinity, z: -Infinity, ms: 0, n: 0 }; e.a = Math.min(e.a, times[i]); e.z = Math.max(e.z, times[i]); e.ms += (profile.timeDeltas[i] || 0) / 1000; e.n++; span.set(k, e); }
console.log('SPANS:\n' + [...span.entries()].filter(([k]) => /Layer|warmBands|tick$/.test(k)).sort((a, b) => a[1].a - b[1].a).map(([k, e]) => `${Math.round(e.a)}→${Math.round(e.z)} (${Math.round(e.z - e.a)} ms wall, ${e.ms.toFixed(0)} ms cpu) ${k}`).join('\n'));
console.log('LONG TASKS:', lt.lt.filter(x => x[1] >= 50).map(x => `${Math.round(x[0])}+${Math.round(x[1])}`).join(' '));
await b.close();
