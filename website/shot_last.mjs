import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1100 } });
const p = await ctx.newPage();
// Budget overview
await p.goto("http://localhost:3000/budget", { waitUntil: "networkidle", timeout: 30000 });
await p.waitForTimeout(1500);
const bo = p.locator("#sec-overview").first();
await bo.scrollIntoViewIfNeeded();
await p.waitForTimeout(300);
const bob = await bo.boundingBox();
if (bob) await p.screenshot({ path: "/tmp/bud-overview.png", clip: { x: 0, y: Math.max(0, bob.y-20), width: 1280, height: Math.min(1100, bob.height+40) } });
console.log(`budget overview h=${Math.round(bob.height)}`);

// QR evolution
await p.goto("http://localhost:3000/qui-recoit", { waitUntil: "networkidle", timeout: 30000 });
await p.waitForTimeout(1500);
const qe = p.locator("#sec-evolution").first();
await qe.scrollIntoViewIfNeeded();
await p.waitForTimeout(300);
const qeb = await qe.boundingBox();
if (qeb) await p.screenshot({ path: "/tmp/qr-evol.png", clip: { x: 0, y: Math.max(0, qeb.y-20), width: 1280, height: Math.min(1100, qeb.height+40) } });
console.log(`qr evolution h=${Math.round(qeb.height)}`);

await b.close();
