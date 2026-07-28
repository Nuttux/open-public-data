import { chromium } from 'playwright';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1440,height:1000}});
await p.goto('http://localhost:3000/us/city/sf',{waitUntil:'networkidle',timeout:60000});
await p.waitForTimeout(1500);
const before=await p.evaluate(()=>({y:window.scrollY,h:document.documentElement.scrollHeight}));
const cards=await p.$$('a[href*="/place/"], a[href*="/payee/"], a[href*="/contract/"]');
console.log('before',JSON.stringify(before),'cards',cards.length);
if(cards.length){
  const href=await cards[0].getAttribute('href');
  const box=await cards[0].boundingBox();
  console.log('first card',href,'at y=',box&&Math.round(box.y+before.y));
  await cards[0].scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  const atClick=await p.evaluate(()=>window.scrollY);
  await cards[0].click();
  await p.waitForTimeout(2000);
  const after=await p.evaluate(()=>({
    bodyPos:document.body.style.position, bodyTop:document.body.style.top,
    y:window.scrollY, url:location.pathname,
    drawer:!!document.querySelector('[role="dialog"], [aria-modal="true"]')}));
  console.log('scrollY at click',atClick);
  console.log('after click',JSON.stringify(after));
}
await b.close();
