"""D1 diagnostic — the downtown skyline at three zooms, before and after.

Requires the dev server on :3000. The camera is parked on the manifest's own
`proj.downtown` anchor and only the ZOOM changes, so the three frames are the
same place at the whole-city, district and block presets.

    D1_SHOTS=/tmp/x D1_TAG=before python3 pipeline/scripts/us_sf_city/diag_downtown_shots.py
"""
import asyncio, json, os, sys, tempfile
from playwright.async_api import async_playwright

OUT = os.environ.get("D1_SHOTS") or os.path.join(tempfile.gettempdir(), "d1-downtown")
TAG = os.environ.get("D1_TAG", "shot")
os.makedirs(OUT, exist_ok=True)
URL = "http://localhost:3000/us/city/sf/the-city"
PRESETS = {"city": 0, "district": 1, "block": 2, "street": 3}
# The Transamerica Pyramid, 600 Montgomery, through projection.ts's proj() at
# the 315 deg bearing: world (3101, 3919) -> plane (3798, 2328).
TOWERS = "3798,2328"


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1400, "height": 900}, device_scale_factor=1)
        await pg.goto(URL, wait_until="domcontentloaded")
        await pg.wait_for_timeout(9000)
        for _ in range(25):
            if await pg.evaluate("()=>!!globalThis.__cityRenderer"):
                break
            await pg.wait_for_timeout(1500)
        await pg.mouse.click(700, 300)
        await pg.wait_for_timeout(1500)
        if os.environ.get("D1_ANCHOR"):
            cx, cy = (float(v) for v in os.environ["D1_ANCHOR"].split(","))
        else:
            man = await pg.evaluate(
                "()=>globalThis.__cityRenderer.data.manifest.proj.downtown")
            cx, cy = float(man[0]), float(man[1])
        print("downtown anchor:", cx, cy, flush=True)
        for name, i in PRESETS.items():
            await pg.evaluate("(i)=>{globalThis.__cityRenderer.goToPreset(i);}", i)
            await pg.wait_for_timeout(2600)
            await pg.evaluate("([cx,cy])=>{const r=globalThis.__cityRenderer;"
                              "r.cam.cx=cx;r.cam.cy=cy;r.cam.follow=false;r.invalidate();}", [cx, cy])
            await pg.wait_for_timeout(2600)
            st = await pg.evaluate("()=>{const r=globalThis.__cityRenderer;"
                                   "return {z:+(r.cam.scale/r.cam.base).toFixed(2),step:r.cam.step};}")
            el = await pg.query_selector(".fx-city-stage")
            await el.screenshot(path=os.path.join(OUT, f"dt-{TAG}-{name}.png"))
            print("shot", name, json.dumps(st), flush=True)
        await b.close()


asyncio.run(main())
