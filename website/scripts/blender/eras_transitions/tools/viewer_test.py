"""viewer_test.py <out prefix> [lat lng zoom] [slider values...]: opens eras2/transitions/viewer/eras_tr.html in headless Chromium,
centres the map, sets the slider to each value (0..1 over 1938..today), waits for the tiles, screenshots each state, and reports
console errors. For checking the per-building slider without a person at the screen."""
import sys, json, asyncio
from playwright.async_api import async_playwright
out = sys.argv[1]; lat, lng, zm = (float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])) if len(sys.argv) > 4 else (-60.0, 185.0, 8.0)
vals = [float(v) for v in sys.argv[5:]] or [0.0, 0.35, 0.5, 1.0]
URL = 'http://127.0.0.1:8797/eras2/transitions/viewer/eras_tr.html'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errs = []; pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(2500)
        await pg.evaluate(f'map.setView([{lat}, {lng}], {zm}, {{animate: false}})'); await pg.wait_for_timeout(1500)
        for v in vals:
            await pg.evaluate(f"(() => {{ const s = document.getElementById('slider'); s.value = {v}; s.dispatchEvent(new Event('input')); }})()")
            await pg.wait_for_timeout(4000)
            yr = await pg.evaluate("document.getElementById('year').textContent")
            await pg.screenshot(path=f'{out}_{v:.3f}.png'); print('slider', v, 'year', yr, flush=True)
        print('console errors:', errs[:10]); await b.close()
asyncio.run(main())
