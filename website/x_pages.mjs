import { chromium } from "playwright";
const out = process.argv[2];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
for (const [nom, url] of [["subventions", "http://fr.localhost:3021/fr/city/paris/subventions"],
                          ["investissements", "http://fr.localhost:3021/fr/city/paris/investissements"]]) {
  try {
    await p.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await p.addStyleTag({ content: "nextjs-portal,.fx-chat-launcher{display:none!important}" });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${out}/page-${nom}.png` });
    console.log(nom, "ok");
  } catch (e) { console.log(nom, "ERR", String(e).slice(0, 90)); }
}
await ctx.close(); await b.close();
