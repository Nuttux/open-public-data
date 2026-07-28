import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/ae39e695-b7df-40d0-91fe-a78de4ad2142/scratchpad/shots';
const b=await chromium.launch();
for(const s of ['lake-merced','golden-gate-park']){
  const p=await b.newPage({viewport:{width:1440,height:1000}});
  await p.goto(`http://localhost:3000/us/city/sf/places/place/${s}`,{waitUntil:'networkidle',timeout:60000});
  await p.waitForTimeout(1200);
  const i=await p.evaluate(()=>({h:document.body.scrollHeight,
    credit:document.body.innerText.match(/UNVERIFIED/i)?'UNVERIFIED!':'ok',
    ia:[...document.querySelectorAll('a[href*="archive.org"]')].length}));
  console.log(s,JSON.stringify(i));
  await p.screenshot({path:`${OUT}/final-${s}.png`,fullPage:true});
  await p.close();
}
await b.close();
