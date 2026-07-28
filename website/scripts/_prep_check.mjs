import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/ae39e695-b7df-40d0-91fe-a78de4ad2142/scratchpad/shots';
const ports=[3000,3021];
const b=await chromium.launch();
for(const port of ports){
  const p=await b.newPage({viewport:{width:1440,height:1000}});
  try{
    await p.goto(`http://localhost:${port}/us/city/sf/places/place/hetch-hetchy`,{waitUntil:'networkidle',timeout:60000});
    await p.waitForTimeout(1500);
    const info=await p.evaluate(()=>({
      h:document.body.scrollHeight,
      styled:getComputedStyle(document.body).fontFamily,
      title:document.querySelector('h1')?.textContent?.trim(),
      docs:document.body.innerText.match(/documents behind/i)?1:0,
      links:[...document.querySelectorAll('a[href*="archive.org"]')].length,
    }));
    console.log(port, JSON.stringify(info));
    await p.screenshot({path:`${OUT}/prep-${port}.png`,fullPage:true});
  }catch(e){ console.log(port,'ERR',e.message.slice(0,80)); }
  await p.close();
}
await b.close();
