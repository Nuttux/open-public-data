// Open a specific block's fiche on the real page and screenshot the panel.
// usage: node _shot_block.mjs <tag> <blockId> [width] [height]
import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/bc7d00c1-9840-411b-b508-70e1907b5017/scratchpad/shots';
const [,,tag,blockId,W='1600',H='1100']=process.argv;
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:+W,height:+H},deviceScaleFactor:2,
  extraHTTPHeaders:{'Accept-Language':'en-US,en;q=0.9'}});
await ctx.addCookies([{name:'dl_locale',value:'en',url:'http://localhost:3000'}]);
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('  [pageerror]',String(e).slice(0,200)));
await p.goto('http://localhost:3000/us/city/sf/the-city',{waitUntil:'domcontentloaded',timeout:120000});
await p.waitForFunction(()=>!!globalThis.__cityRenderer,{timeout:120000});
await p.waitForTimeout(6000);
const res=await p.evaluate(async(id)=>{
  const ix=await (await fetch('/data/us/sf/city/blocks/block-index.json')).json();
  const i=ix.b.indexOf(id);
  if(i<0) return {ok:false,msg:'block not in index'};
  globalThis.__cityRenderer.opts.onPick(i);
  return {ok:true,i,n:ix.n[i],y0:ix.y0[i],y1:ix.y1[i]};
},blockId);
console.log(tag,blockId,JSON.stringify(res));
await p.waitForTimeout(3500);
// In-situ: the panel as it really sits, scrolled to the rail head.
const shot=async(name,sel)=>{const el=await p.$(sel); if(el) await el.screenshot({path:`${OUT}/${name}.png`}); else console.log('missing',sel);};
await p.evaluate(()=>{
  const h=document.querySelector('.fx-block-rail')?.previousElementSibling?.previousElementSibling
       || document.querySelector('.fx-block-rail');
  h?.scrollIntoView({block:'start'});
});
await p.waitForTimeout(600);
await p.screenshot({path:`${OUT}/${tag}-insitu.png`});
// Unrolled: let the panel grow so the whole rail is one picture.
await p.evaluate(()=>{
  for(const s of ['.fx-city-panel','.fx-city-panel-body','.fx-city-ledger']){
    document.querySelectorAll(s).forEach(e=>{e.style.maxHeight='none';e.style.height='auto';e.style.overflow='visible';});
  }
});
await p.waitForTimeout(400);
await shot(`${tag}-panel`,'.fx-city-panel');
await shot(`${tag}-rail`,'.fx-block-rail');
const panel=await p.$('.fx-city-panel');
if(panel) console.log('--- PANEL TEXT ---\n'+(await panel.innerText()).slice(0,3000));
await b.close();
