import { chromium } from 'playwright';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1300,height:1200},deviceScaleFactor:2});
await p.goto('file:///Users/daniel/qipu-ia/mock/options.html');await p.waitForTimeout(800);
await p.screenshot({path:'/Users/daniel/qipu-ia/mock/options.png',fullPage:true});
console.log('h=',await p.evaluate(()=>document.body.scrollHeight));
await b.close();
