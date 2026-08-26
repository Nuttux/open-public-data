import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/bc7d00c1-9840-411b-b508-70e1907b5017/scratchpad/shots';
const [,,tag,blockId,W='1600',H='1100']=process.argv;
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:+W,height:+H},deviceScaleFactor:2,extraHTTPHeaders:{'Accept-Language':'en-US,en;q=0.9'}});
await ctx.addCookies([{name:'dl_locale',value:'en',url:'http://localhost:3000'}]);
const p=await ctx.newPage();
await p.goto('http://localhost:3000/us/city/sf/the-city',{waitUntil:'domcontentloaded',timeout:120000});
await p.waitForFunction(()=>!!globalThis.__cityRenderer,{timeout:120000});
await p.waitForTimeout(6000);
console.log(JSON.stringify(await p.evaluate(async(id)=>{
  const ix=await (await fetch('/data/us/sf/city/blocks/block-index.json')).json();
  const i=ix.b.indexOf(id); if(i<0) return {ok:false};
  globalThis.__cityRenderer.opts.onPick(i); return {ok:true};
},blockId)));
await p.waitForTimeout(3500);
await p.evaluate(()=>{
  for(const s of ['.fx-city-panel','.fx-city-panel-body','.fx-city-ledger'])
    document.querySelectorAll(s).forEach(e=>{e.style.maxHeight='none';e.style.height='auto';e.style.overflow='visible';});
  // hide the floating chat bubble and the scrub so they do not sit over the copy
  document.querySelectorAll('.fx-chat-fab,[class*="chat-fab"],[class*="ChatFab"]').forEach(e=>e.style.display='none');
});
await p.waitForTimeout(400);
const box=await p.evaluate(()=>{
  const rail=document.querySelector('.fx-block-rail');
  const r=rail.getBoundingClientRect();
  const top=r.bottom+window.scrollY-170;
  const par=rail.parentElement.getBoundingClientRect();
  return {x:Math.round(par.left+window.scrollX)-4,y:Math.round(top),w:Math.round(par.width)+8,h:330};
});
await p.screenshot({path:`${OUT}/${tag}-foot.png`,fullPage:true,clip:{x:box.x,y:box.y,width:box.w,height:box.h}});
console.log('foot ok',JSON.stringify(box));
await b.close();
