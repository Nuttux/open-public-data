import { chromium } from 'playwright';
const OUT='/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/ae39e695-b7df-40d0-91fe-a78de4ad2142/scratchpad/shots';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1600,height:1000}});
p.on('console',m=>{const t=m.text(); if(/error|fail|warn/i.test(t)) console.log('  [console]',t.slice(0,110));});
await p.goto('http://localhost:3000/us/city/sf/the-city',{waitUntil:'domcontentloaded',timeout:90000});
for (const [i,ms] of [[1,4000],[2,7000],[3,10000]]) {
  await p.waitForTimeout(ms);
  await p.screenshot({path:`${OUT}/city-${i}.png`});
  console.log('frame',i,'at',ms,'ms cumulative');
}
console.log('title:', await p.title());
console.log('canvases:', await p.evaluate(()=>document.querySelectorAll('canvas').length));
console.log('text:', (await p.evaluate(()=>document.body.innerText)).slice(0,600).replace(/\n+/g,' | '));
await b.close();
