import { chromium } from 'playwright';
const b=await chromium.launch();
for(const start of ['http://localhost:3000/us/city/sf','http://localhost:3000/']){
  const p=await b.newPage({viewport:{width:1440,height:1000}});
  try{
    await p.goto(start,{waitUntil:'networkidle',timeout:60000});
    await p.waitForTimeout(1500);
    const l=await p.$('a[href*="/places/place/"]');
    if(!l){ console.log(start,'-> no place link on page'); await p.close(); continue; }
    const href=await l.getAttribute('href');
    await l.click();
    await p.waitForTimeout(2500);
    const r=await p.evaluate(()=>({y:window.scrollY,h:document.body.scrollHeight}));
    console.log(`${start} -> ${href}\n   scrollY=${r.y} of ${r.h}  ${r.y>200?'*** JUMPED ***':'ok'}  url=${p.url()}`);
  }catch(e){ console.log(start,'ERR',e.message.slice(0,70)); }
  await p.close();
}
await b.close();
