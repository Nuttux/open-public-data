/* Where the main thread goes during desktop boot: long tasks (>50 ms) and a
   sampled CPU profile aggregated by function self-time.
   SCR=... BASE=http://localhost:3007 node scripts/probes/boot_profile.mjs */
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:3007';
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.addInitScript(() => {
  window.__lt = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true });
});
const cdp = await ctx.newCDPSession(p);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
const t0 = Date.now();
await p.goto(`${BASE}/us/city/sf/the-city?tiles=0&probe=1`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__cityGL && window.__cityGL.getStats && window.__cityGL.getStats().frames > 5, null, { timeout: 90000 }).catch(() => console.log('no frames>5'));
await p.waitForTimeout(4000);
const { profile } = await cdp.send('Profiler.stop');
const lt = await p.evaluate(() => window.__lt);
console.log('boot ms', Date.now() - t0, 'long tasks (start,dur):', lt.filter(x => x[1] >= 50).map(x => x.join('/')).join(' '), 'total long', lt.reduce((a, x) => a + x[1], 0));
const self = new Map(); const byId = new Map(profile.nodes.map(n => [n.id, n]));
const dt = profile.timeDeltas; const samples = profile.samples;
for (let i = 0; i < samples.length; i++) { const n = byId.get(samples[i]); const cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-1)[0].split('?')[0]}:${cf.lineNumber}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000); }
console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${v.toFixed(0)}ms ${k}`).join('\n'));
await b.close();
