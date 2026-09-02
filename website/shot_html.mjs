import { chromium } from 'playwright';
const SHOT='/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/f483229c-dea2-4de9-ade7-0745c0da1a5e/scratchpad';
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1340,height:900},deviceScaleFactor:2});
await p.goto('file:///tmp/surfaces.html');
await p.waitForTimeout(400);
await p.screenshot({path:`${SHOT}/mock-all.png`, fullPage:true});
await b.close(); console.log('ok');
