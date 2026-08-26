import { chromium } from 'playwright';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1200,height:800}});
await p.goto('file:///Users/daniel/qipu-ia/mock/themes-register.svg');
await p.waitForTimeout(600);
await p.screenshot({path:'/Users/daniel/qipu-ia/mock/themes-register.png'});
await b.close();
