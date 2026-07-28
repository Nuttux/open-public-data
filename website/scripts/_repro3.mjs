import { chromium } from 'playwright';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:1000}});
await p.goto('http://localhost:3000/us/city/sf',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(1200);
await p.evaluate(()=>window.scrollTo(0,900));
await p.waitForTimeout(600);
const at=await p.evaluate(()=>window.scrollY);
// pick a link ALREADY visible in the viewport, then click by coordinates so the
// browser never scrolls (mirrors what a human actually does)
const target=await p.evaluate(()=>{
  for(const a of document.querySelectorAll('a[href*="/place/"]')){
    const r=a.getBoundingClientRect();
    if(r.top>80 && r.bottom<900 && r.width>20) return {x:r.x+r.width/2,y:r.y+r.height/2,href:a.getAttribute('href')};
  }
  return null;
});
console.log('scrolled to',at,'clicking',target&&target.href);
await p.mouse.click(target.x,target.y);
await p.waitForTimeout(2000);
const open=await p.evaluate(()=>({top:document.body.style.top,drawer:!!document.querySelector('[role="dialog"],[aria-modal="true"]')}));
console.log(`  lock top=${open.top} drawer=${open.drawer}  expected -${at}px  ${open.top===`-${at}px`?'OK':'*** BAD ***'}`);
await p.keyboard.press('Escape');
await p.waitForTimeout(1500);
const closed=await p.evaluate(()=>window.scrollY);
console.log(`  after close y=${closed} expected ${at}  ${Math.abs(closed-at)<40?'OK':'*** BAD ***'}`);
await b.close();
