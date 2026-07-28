import { chromium } from 'playwright';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:1000}});

// CASE A — click while scrolled down: background must stay at that offset, and
// closing must land back there.
await p.goto('http://localhost:3000/us/city/sf',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(1200);
await p.evaluate(()=>window.scrollTo(0,900));
await p.waitForTimeout(500);
const at=await p.evaluate(()=>window.scrollY);
const cards=await p.$$('a[href*="/place/"]');
await cards[0].click({force:true});
await p.waitForTimeout(1800);
const open=await p.evaluate(()=>document.body.style.top);
await p.keyboard.press('Escape');
await p.waitForTimeout(1500);
const closed=await p.evaluate(()=>({y:window.scrollY,pos:document.body.style.position}));
console.log(`A scrolled=${at} -> lock top=${open} -> after close y=${closed.y} pos="${closed.pos}" ${Math.abs(closed.y-at)<60?'OK':'*** BAD ***'}`);

// CASE B — drawer to drawer: the original page offset must survive the chain.
await p.goto('http://localhost:3000/us/city/sf',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(1200);
await p.evaluate(()=>window.scrollTo(0,700));
await p.waitForTimeout(400);
const at2=await p.evaluate(()=>window.scrollY);
const c2=await p.$$('a[href*="/place/"]');
await c2[0].click({force:true});
await p.waitForTimeout(1800);
const inner=await p.$('a[href*="/place/"], a[href*="/payee/"]');
if(inner){ await inner.click({force:true}); await p.waitForTimeout(1800); }
const top2=await p.evaluate(()=>document.body.style.top);
console.log(`B scrolled=${at2} -> after drawer→drawer lock top=${top2} ${top2===`-${at2}px`||top2==='0px'&&at2===0?'OK':'check'}`);
await b.close();
