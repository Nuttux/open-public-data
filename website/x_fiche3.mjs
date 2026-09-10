import { chromium } from "playwright";
const out = process.argv[2];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto("http://fr.localhost:3021/fr/city/paris/lieux", { waitUntil: "networkidle" });
await p.addStyleTag({ content: "nextjs-portal,.fx-chat-launcher{display:none!important}" });
const a = await p.$('a[href$="/lieu/theatre-du-chatelet"]');
if (!a) { console.log("no link"); process.exit(1); }
await a.click();
await p.waitForSelector(".fx-v3-years", { timeout: 15000 });
await p.waitForTimeout(800);
const body = await p.$(".fx-drawer-body");
const box = await body.boundingBox();
console.log("drawer body width", box.width);
await p.screenshot({ path: `${out}/drawer-desk.png` });
const hero = await p.$(".fx-v3-years");
await hero.screenshot({ path: `${out}/drawer-hero.png` });
await ctx.close(); await b.close();
