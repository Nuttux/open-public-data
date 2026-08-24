"""D1 diagnostic — shoot the Hunters Point Shipyard across the 2015 cliff.

Requires the dev server on :3000. Only the YEAR changes between frames: the
camera is parked on the shipyard and re-parked after every setYear so a glide
cannot move it. See DATA-TRUTH.md 1.8.

The plane coordinate below is projection.ts's own proj() at the 315 deg
bearing, evaluated on the midpoint of DataSF's STREETS_HUNTERSP centreline
bounding box (world 6099.5, -4010.0):

    xr = x*cos315 - y*sin315 ; yr = x*sin315 + y*cos315
    plane = ((xr - yr) * cos30, (xr + yr) * 0.42)   = (7470, -2382)

Output goes to a `shots/` directory beside wherever this file is run from; the
images are not committed.
"""
import asyncio, os, json
from playwright.async_api import async_playwright
OUT=os.path.dirname(os.path.abspath(__file__))+"/shots"; os.makedirs(OUT, exist_ok=True)
URL="http://localhost:3000/us/city/sf/the-city"
YEARS=[1940,1990,2013,2014,2015,2016]
CX, CY = 7470.0, -2382.0
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await b.new_page(viewport={"width":1400,"height":900}, device_scale_factor=1)
        await pg.goto(URL, wait_until="domcontentloaded"); await pg.wait_for_timeout(9000)
        for _ in range(25):
            if await pg.evaluate("()=>!!globalThis.__cityRenderer"): break
            await pg.wait_for_timeout(1500)
        await pg.mouse.click(700,300); await pg.wait_for_timeout(1500)
        await pg.evaluate("()=>{globalThis.__cityRenderer.goToPreset(1);}"); await pg.wait_for_timeout(3000)
        await pg.evaluate("([cx,cy])=>{const r=globalThis.__cityRenderer;r.cam.cx=cx;r.cam.cy=cy;r.cam.follow=false;r.invalidate();}", [CX,CY])
        await pg.wait_for_timeout(3500)
        print(json.dumps(await pg.evaluate("()=>{const r=globalThis.__cityRenderer;return{z:+(r.cam.scale/r.cam.base).toFixed(2),cx:+r.cam.cx.toFixed(1),cy:+r.cam.cy.toFixed(1)};}")), flush=True)
        for y in YEARS:
            await pg.evaluate("([y,cx,cy])=>{const r=globalThis.__cityRenderer;r.setYear(y);r.cam.cx=cx;r.cam.cy=cy;r.invalidate();}", [y,CX,CY])
            await pg.wait_for_timeout(3000)
            el=await pg.query_selector(".fx-city-stage")
            await el.screenshot(path=os.path.join(OUT,f"bv-{y}.png"))
            print("shot", y, flush=True)
        await b.close()
asyncio.run(main())
