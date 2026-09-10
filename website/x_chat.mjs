import { chromium } from "playwright";
const out = process.argv[2];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.goto("http://fr.localhost:3021/fr/city/paris/lieu/theatre-du-chatelet", { waitUntil: "networkidle" });
await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await p.evaluate(() => window.scrollBy(0, 1800));
await p.waitForTimeout(600);
await p.screenshot({ path: `${out}/chat-viewport.png` });     // écran réel, pas pleine page
const m = await p.evaluate(() => {
  const el = document.querySelector(".fx-chat-launcher");
  if (!el) return null;
  const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
  return { position: cs.position, zIndex: cs.zIndex, bottom: Math.round(window.innerHeight - r.bottom), right: Math.round(window.innerWidth - r.right), w: Math.round(r.width), h: Math.round(r.height) };
});
console.log("lanceur:", JSON.stringify(m));
await ctx.close(); await b.close();
