import { chromium } from "playwright";
const out = process.argv[2];
const url = "http://fr.localhost:3021/fr/city/paris/lieu/theatre-du-chatelet";
const b = await chromium.launch();
for (const [name, vp, mobile] of [["desk", { width: 1440, height: 900 }, false], ["mobile", { width: 390, height: 844 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: "networkidle" });
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/fiche-${name}.png`, fullPage: true });
  // zoom sur le haut (héros + argent) pour lecture
  await p.screenshot({ path: `${out}/fiche-${name}-top.png`, fullPage: false });
  await ctx.close();
}
await b.close();
