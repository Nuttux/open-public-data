import { chromium } from 'playwright';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1400,height:1000}});
for (const u of ['https://www.sf.gov/departments/board-supervisors','https://sfbos.archive.sf.gov/meetings']) {
  try{
    await p.goto(u,{waitUntil:'domcontentloaded',timeout:60000});
    await p.waitForTimeout(2500);
    const t=await p.evaluate(()=>document.body.innerText);
    const yrs=[...new Set([...t.matchAll(/\b(20[12]\d)\b/g)].map(m=>m[1]))].sort();
    console.log(`\n=== ${u}\n  years: ${yrs.slice(-8)}`);
    const hit=t.split('\n').filter(l=>/minutes|agenda|legistar|archive/i.test(l)).slice(0,8);
    hit.forEach(l=>console.log('   •',l.trim().slice(0,110)));
  }catch(e){ console.log(`\n=== ${u}\n  ERR ${e.message.slice(0,70)}`); }
}
await b.close();
