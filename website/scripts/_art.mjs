import { chromium } from 'playwright';
const F='file:///private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/ae39e695-b7df-40d0-91fe-a78de4ad2142/scratchpad/art/drawing-the-record.html';
const O='/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/ae39e695-b7df-40d0-91fe-a78de4ad2142/scratchpad/shots';
const b=await chromium.launch();
for (const [n,cs] of [['light','light'],['dark','dark']]) {
  const p=await b.newPage({viewport:{width:1400,height:1100},colorScheme:cs});
  await p.goto(F,{waitUntil:'networkidle'}); await p.waitForTimeout(900);
  await p.screenshot({path:`${O}/art-${n}.png`});
  const bg=await p.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  const fg=await p.evaluate(()=>getComputedStyle(document.body).color);
  console.log(n,'bg',bg,'fg',fg,'h',await p.evaluate(()=>document.body.scrollHeight));
  await p.close();
}
await b.close();
