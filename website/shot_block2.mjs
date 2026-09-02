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
// open the newest decade so the rows render
const sum = p.locator('.fx-block-sum').first();
if (await sum.count()) { await sum.click(); await p.waitForTimeout(2500); }
const n = await p.locator('.fx-city-record-list .fx-city-record-line').count();
console.log('decision rows rendered:', n);
if (n) {
  const el = p.locator('.fx-city-record-list').first();
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(600);
  await el.screenshot({ path: `${SHOT}/block-rows.png` });
  console.log(await el.innerText());
}
await b.close();
