import { chromium } from 'playwright';
const SHOT='/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/f483229c-dea2-4de9-ade7-0745c0da1a5e/scratchpad';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2});
await p.goto('http://localhost:3000/us/city/sf/the-city',{waitUntil:'networkidle',timeout:120000});
await p.waitForSelector('canvas',{timeout:60000});
await p.waitForTimeout(11000);
const x=p.locator('button[aria-label*="lose"], button:has-text("×")').first();
if(await x.count()){await x.click().catch(()=>{});await p.waitForTimeout(1000);}
for (let i=0;i<4;i++){ await p.keyboard.press('+'); await p.waitForTimeout(900); }
const box=await p.locator('canvas').first().boundingBox();
await p.mouse.click(box.x+box.width*0.5, box.y+box.height*0.5);
await p.waitForTimeout(4000);
console.log('details blocks:', await p.locator('details.fx-block-row').count());
const d = p.locator('details.fx-block-row').first();
if (await d.count()) {
  await d.evaluate(n => { n.open = true; });
  await p.waitForTimeout(2000);
  console.log('after opening, record lists:', await p.locator('.fx-city-record-list').count());
  console.log('shelf rows still:', await p.locator('.fx-shelf-says').count());
  const box2 = await d.boundingBox();
  if (box2) await p.screenshot({ path:`${SHOT}/block-rows.png`, clip:{x:box2.x,y:box2.y,width:box2.width,height:Math.min(box2.height,700)} });
  console.log((await d.innerText()).slice(0,400));
}
await b.close();
