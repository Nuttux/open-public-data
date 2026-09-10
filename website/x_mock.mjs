import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
const S = process.argv[2];
await p.goto("http://fr.localhost:3021/fr/city/paris/lieux", { waitUntil: "domcontentloaded" });
await p.setContent(await (await import("fs")).promises.readFile(`${S}/mockup.html`, "utf8"), { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
await p.screenshot({ path: `${S}/mockup.png`, fullPage: true });
await b.close();
