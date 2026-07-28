import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/ae39e695-b7df-40d0-91fe-a78de4ad2142/scratchpad/shots';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:1000}});
await p.goto('http://localhost:3111/us/city/sf/places/place/coit-tower',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(1000);
await p.screenshot({path:`${OUT}/coit-tower-after.png`,fullPage:true});
await b.close(); console.log('ok');
