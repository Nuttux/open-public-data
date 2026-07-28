import { chromium } from 'playwright';
const b=await chromium.launch();
for(const idx of [0,1,2,3]){
  const p=await b.newPage({viewport:{width:1440,height:1000}});
  await p.goto('http://localhost:3000/us/city/sf',{waitUntil:'networkidle',timeout:60000});
  await p.waitForTimeout(1400);
  await p.evaluate(()=>window.scrollTo(0,400)); await p.waitForTimeout(500);
  const at=await p.evaluate(()=>window.scrollY);
  const t=await p.evaluate((i)=>{
    const as=[...document.querySelectorAll('a')].filter(a=>{
      const r=a.getBoundingClientRect();
      return r.top>60&&r.bottom<980&&r.width>20&&r.height>10&&/Open the place|See the recipient|See the contract|Open the/i.test(a.textContent||'');
    });
    const a=as[i]; if(!a) return null;
    const r=a.getBoundingClientRect();
    return {x:r.x+r.width/2,y:r.y+r.height/2,label:(a.textContent||'').trim().slice(0,28),href:a.getAttribute('href')};
  },idx);
  if(!t){ console.log(idx,'no card'); await p.close(); continue; }
  await p.mouse.click(t.x,t.y);
  await p.waitForTimeout(2200);
  const r=await p.evaluate(()=>({top:document.body.style.top,pos:document.body.style.position,url:location.pathname}));
  const ok = r.top===`-${at}px`||(at===0&&(r.top==='0px'||r.top===''));
  console.log(`${idx} "${t.label}" ${t.href}\n    scrolled=${at} lockTop=${r.top||'(empty)'} pos=${r.pos||'(none)'} ${ok?'OK':'*** BAD ***'}`);
  await p.close();
}
await b.close();
