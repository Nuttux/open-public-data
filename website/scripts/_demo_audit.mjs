import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/ae39e695-b7df-40d0-91fe-a78de4ad2142/scratchpad/shots';
const B='http://localhost:3000/us/city/sf/places/place/';
const slugs=['coit-tower','hetch-hetchy','laguna-honda-hospital'];
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:1000}});
for(const s of slugs){
  await p.goto(B+s,{waitUntil:'networkidle',timeout:90000});
  await p.waitForTimeout(900);
  const h=await p.evaluate(()=>document.body.scrollHeight);
  await p.screenshot({path:`${OUT}/demo-${s}.png`,fullPage:true});
  console.log(`${s}: ${h}px`);
}
await b.close();
