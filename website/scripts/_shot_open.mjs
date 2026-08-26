import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/bc7d00c1-9840-411b-b508-70e1907b5017/scratchpad/shots';
const [,,tag,blockId,decade,W='1600',H='1100']=process.argv;
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:+W,height:+H},deviceScaleFactor:2,extraHTTPHeaders:{'Accept-Language':'en-US,en;q=0.9'}});
await ctx.addCookies([{name:'dl_locale',value:'en',url:'http://localhost:3000'}]);
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('  [pageerror]',String(e).slice(0,200)));
await p.goto('http://localhost:3000/us/city/sf/the-city',{waitUntil:'domcontentloaded',timeout:120000});
await p.waitForFunction(()=>!!globalThis.__cityRenderer,{timeout:120000});
await p.waitForTimeout(6000);
console.log(JSON.stringify(await p.evaluate(async(id)=>{
  const ix=await (await fetch('/data/us/sf/city/blocks/block-index.json')).json();
  const i=ix.b.indexOf(id); if(i<0) return {ok:false};
  globalThis.__cityRenderer.opts.onPick(i); return {ok:true,i};
},blockId)));
await p.waitForTimeout(3500);
await p.evaluate((dec)=>{
  for(const s of ['.fx-city-panel','.fx-city-panel-body','.fx-city-ledger'])
    document.querySelectorAll(s).forEach(e=>{e.style.maxHeight='none';e.style.height='auto';e.style.overflow='visible';});
  for(const d of document.querySelectorAll('.fx-block-row')){
    if(d.querySelector('.fx-block-dec')?.textContent?.trim()===dec) d.open=true;
  }
},decade);
await p.waitForTimeout(700);
for(const d of await p.$$('.fx-block-row')){
  const lab=await d.$eval('.fx-block-dec',e=>e.textContent.trim()).catch(()=>'');
  if(lab===decade){ await d.screenshot({path:`${OUT}/${tag}-open.png`}); console.log('--- OPEN ---\n'+(await d.innerText()).slice(0,2200)); }
}
await b.close();
