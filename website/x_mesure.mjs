import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://fr.localhost:3021/fr/city/paris/lieu/theatre-du-chatelet", { waitUntil: "networkidle" });
const m = await p.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const box = (s) => { const e = q(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width) }; };
  return {
    viewport: window.innerWidth,
    titre: box("h1"),
    lede: box(".fx-page-lede"),
    section: box(".fx-v3-section"),
    ligne: box(".fx-v3-line"),
    annees: box(".fx-v3-years"),
    part: box(".fx-v3-line .bar .track"),
    hero: box(".fx-v3-hero-num"),
    photo: box(".fx-fiche-thumb-wrap"),
  };
});
console.log(JSON.stringify(m, null, 1));
await b.close();
