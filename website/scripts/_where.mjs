import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/ae39e695-b7df-40d0-91fe-a78de4ad2142/scratchpad/shots';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1600,height:1000}});
await p.goto('http://localhost:3000/us/city/sf/the-city',{waitUntil:'domcontentloaded',timeout:90000});
await p.waitForTimeout(9000);
// find the City Hall label position on the canvas overlay if it's DOM, else just shoot
const pos = await p.evaluate(()=>{
  const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0 && /City Hall/i.test(e.textContent||''));
  return els.map(e=>{const r=e.getBoundingClientRect();return {t:e.textContent.trim(),x:Math.round(r.x),y:Math.round(r.y)};});
});
console.log('City Hall label found in DOM:', JSON.stringify(pos));
await p.screenshot({path:`${OUT}/where-civic.png`});
await b.close();
