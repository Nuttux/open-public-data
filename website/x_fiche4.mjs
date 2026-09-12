import { chromium } from "playwright";
const out = process.argv[2];
const url = "http://fr.localhost:3021/fr/city/paris/lieu/theatre-du-chatelet";
const b = await chromium.launch();
for (const [name, vp, mobile] of [["desk", { width: 1440, height: 900 }, false], ["mobile", { width: 390, height: 844 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: "networkidle" });
  await p.addStyleTag({ content: "nextjs-portal,.fx-chat-launcher{display:none!important}" });
  await p.waitForTimeout(600);
  const sec = await p.$(".fx-v3-section");
  await sec.screenshot({ path: `${out}/argent-${name}.png` });
  await ctx.close();
}
await b.close();
