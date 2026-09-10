import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage();
for (const u of ['https://www.sf.gov/departments--board-supervisors/events/upcoming',
                 'https://www.sf.gov/departments--board-supervisors']) {
  try {
    const r = await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(2500);
    const t = await p.title();
    const links = await p.$$eval('a[href]', (as) => as.map((a) => a.href).filter((h) => /minute|agenda|\.pdf/i.test(h)).slice(0, 12));
    const dates = await p.evaluate(() => (document.body.innerText.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, 20\d\d/g) || []).slice(0, 8));
    console.log(`\n${u}\n  ${r.status()} · ${t}`);
    console.log('  dates:', dates.join(' | ') || '—');
    console.log('  links:', links.slice(0, 6).join('\n         ') || '—');
  } catch (e) { console.log(u, 'failed:', e.message.slice(0, 80)); }
}
await b.close();
