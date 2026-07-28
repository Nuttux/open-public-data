import { chromium } from 'playwright';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:1000}});
await p.goto('http://localhost:3000/us/city/sf/places',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(1200);
await p.evaluate(()=>window.scrollTo(0,2500));   // scroll down the index, like a human browsing
await p.waitForTimeout(600);
console.log('index scrollY before click', await p.evaluate(()=>window.scrollY));
const ls=await p.$$('a[href*="/places/place/"]');
const l=ls[Math.min(12,ls.length-1)];
const href=await l.getAttribute('href');
await l.click();
await p.waitForTimeout(2500);
const r=await p.evaluate(()=>({y:window.scrollY,h:document.body.scrollHeight}));
console.log(`-> ${href}  scrollY=${r.y} of ${r.h}  ${r.y>200?'*** JUMPED ***':'ok'}`);
await b.close();
