import { chromium } from 'playwright';
const SHOT='/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/f483229c-dea2-4de9-ade7-0745c0da1a5e/scratchpad';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2});
p.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p.goto('http://localhost:3000/us/city/sf/the-city',{waitUntil:'networkidle',timeout:120000});
await p.waitForSelector('canvas',{timeout:60000});
await p.waitForTimeout(11000);
const x=p.locator('button[aria-label*="lose"], button:has-text("×")').first();
if(await x.count()){await x.click().catch(()=>{});await p.waitForTimeout(1000);}
// zoom in a few steps so a click lands on a block, then click the middle
for (let i=0;i<4;i++){ await p.keyboard.press('+'); await p.waitForTimeout(900); }
const box=await p.locator('canvas').first().boundingBox();
await p.mouse.click(box.x+box.width*0.5, box.y+box.height*0.5);
await p.waitForTimeout(4000);
const has = await p.locator('.fx-city-record-list, .fx-block-row').count();
console.log('block panel rows present:', has);
await p.screenshot({path:`${SHOT}/block-panel.png`, clip:{x:1152,y:130,width:288,height:800}});
const t=await p.locator('body').innerText();
const i=t.search(/DECADE BY DECADE|What the Board decided here/);
if(i>=0) console.log(t.slice(i,i+520));
await b.close();
