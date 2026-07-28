import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/ae39e695-b7df-40d0-91fe-a78de4ad2142/scratchpad/shots';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:1000}});
await p.goto('http://localhost:3000/us/city/sf',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(1500); await p.evaluate(()=>window.scrollTo(0,400)); await p.waitForTimeout(500);
const t=await p.evaluate(()=>{
  for(const a of document.querySelectorAll('a[href*="/place/"]')){
    const r=a.getBoundingClientRect();
    if(r.top>60&&r.bottom<980&&r.width>20&&r.height>10) return {x:r.x+r.width/2,y:r.y+r.height/2};
  } return null;});
await p.mouse.click(t.x,t.y);
await p.waitForTimeout(2200);
await p.screenshot({path:`${OUT}/drawer-fixed.png`});   // viewport only — what the user sees
console.log('shot taken, url', p.url());
await b.close();
