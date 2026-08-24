"""D1 diagnostic — the 846 streets no block implies, on screen, and not flickering.

Requires the dev server on :3000. Three cameras, because the finding is not
Bayview's: Presidio 478 lines, Bayview Hunters Point 113, Treasure Island 110.

Plane coordinates are projection.ts's own proj() at the 315 deg bearing,
evaluated on each place's world metres:

    xr = x*cos315 - y*sin315 ; yr = x*sin315 + y*cos315
    plane = ((xr - yr) * cos30, (xr + yr) * 0.42)

THE FLICKER TEST. The 30 m and quarter-length rules are thresholds, and a
threshold is a step in the derivative. They are evaluated ONCE, in the
pipeline, so they cannot flicker with the camera — but the BAND gate in
streets.ts can, and a whole 131 km network appearing at a zoom boundary would
read as a bug. So the sweep walks the camera across the band boundary in small
steps and counts drawn features at each, and walks the year across the span,
and reports any step where the count jumps.
"""
import asyncio, json, os, sys, tempfile
from playwright.async_api import async_playwright

OUT = os.environ.get("D1_SHOTS") or os.path.join(tempfile.gettempdir(), "d1-unimplied")
os.makedirs(OUT, exist_ok=True)
URL = "http://localhost:3000/us/city/sf/the-city"

PLACES = {
    "bayview":  (7470.0, -2382.0),
    "presidio": (-3021.0, 2512.0),
    "treasure": (7337.0, 4166.0),
}
YEARS = [1906, 1940, 1990, 2025]

COUNT = """() => {
  const cd = globalThis.__cityRenderer?.data;
  if (!cd || !cd.streetLines) return null;
  const u = cd.streetLines().find(c => c.key === 'strt/street-unimplied');
  return u ? {n: u.fid.length, undated: [...u.yr].filter(v => v === 0).length} : null;
}"""


async def park(pg, cx, cy):
    await pg.evaluate("([cx,cy])=>{const r=globalThis.__cityRenderer;"
                      "r.cam.cx=cx;r.cam.cy=cy;r.cam.follow=false;r.invalidate();}", [cx, cy])


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
        await pg.evaluate("()=>{globalThis.__cityRenderer.goToPreset(1);}")
        await pg.wait_for_timeout(3000)
        print("chunk on the wire:", json.dumps(await pg.evaluate(COUNT)), flush=True)

        for name, (cx, cy) in PLACES.items():
            await park(pg, cx, cy)
            await pg.wait_for_timeout(2500)
            for y in YEARS:
                await pg.evaluate("([y,cx,cy])=>{const r=globalThis.__cityRenderer;"
                                  "r.setYear(y);r.cam.cx=cx;r.cam.cy=cy;r.invalidate();}",
                                  [y, cx, cy])
                await pg.wait_for_timeout(2200)
                el = await pg.query_selector(".fx-city-stage")
                await el.screenshot(path=os.path.join(OUT, f"u-{name}-{y}.png"))
                print("shot", name, y, flush=True)

        # ── the flicker sweep ────────────────────────────────────────────
        await park(pg, *PLACES["presidio"])
        await pg.evaluate("()=>{globalThis.__cityRenderer.setYear(undefined);}")
        await pg.wait_for_timeout(2000)
        print("\\nzoom sweep across the band boundary (drawn features per frame):", flush=True)
        rows = []
        for i in range(24):
            z = 1.30 + i * 0.05
            await pg.evaluate("([z,cx,cy])=>{const r=globalThis.__cityRenderer;"
                              "r.cam.scale=r.cam.base*z;r.cam.syncStep();"
                              "r.cam.cx=cx;r.cam.cy=cy;r.invalidate();}",
                              [z, *PLACES["presidio"]])
            await pg.wait_for_timeout(320)
            st = await pg.evaluate("()=>{const r=globalThis.__cityRenderer;"
                                   "return {z:+(r.cam.scale/r.cam.base).toFixed(2),"
                                   "step:r.cam.step,lines:r.lastStats?.lines ?? null};}")
            rows.append(st)
            print(f"   z={st['z']:<5} step={st['step']} lines={st['lines']}", flush=True)
        await b.close()


asyncio.run(main())
