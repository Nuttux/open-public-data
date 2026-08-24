"""Does the shipped zoom path actually refuse to pull back past the fit?

REACH.md §1.2 claims MINZ = 1 is what stops a reader leaving the city. That was
read off lib/city/camera.ts, and reading is not measuring — reach_shots.py
already showed that assigning `cam.scale` directly sails straight past it,
because the floor lives in the zoom ENTRY POINTS and not in clamp(). So this
asks the camera the way a reader's wheel does, and reports what it gets.

    python3 pipeline/scripts/us_sf_reach/reach_minz_probe.py
"""
from __future__ import annotations

import asyncio
import pathlib

from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
URL = "http://localhost:3000/us/city/sf/the-city"
W, H, DPR = 1440, 940, 2
RR_INIT = (HERE / "reach_shots.py").read_text().split('RR_INIT = """')[1].split('"""')[0]


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": W + 420, "height": H + 400},
                              device_scale_factor=DPR)
        await pg.add_init_script(RR_INIT)
        await pg.goto(URL, wait_until="domcontentloaded")
        for _ in range(120):
            try:
                await pg.evaluate(RR_INIT)
                r = await pg.evaluate("""(()=>{const R=RR(),d=R.data;
                  const base=d.manifest.chunks.filter(c=>c.tier==='base');
                  const s=d.stats();
                  return {miss:base.filter(c=>!d.has(c.k)).length,
                          q:s.queued+s.inFlight, cells:R.lastStats.cells};})()""")
                if r["miss"] == 0 and r["q"] == 0 and r["cells"] > 0:
                    break
            except Exception:
                pass
            await pg.wait_for_timeout(1000)
        await pg.evaluate("""(()=>{const R=RR();
          if(R.filmOn) R.driveFilm(null);
          R.scene.filmHide=null; R.scene.filmRunning=false; R.glide=null; R.mode='idle';})()""")
        await pg.wait_for_timeout(1200)

        print("methods on the renderer that a reader's gestures reach:")
        print(" ", await pg.evaluate(
            "Object.getOwnPropertyNames(Object.getPrototypeOf(RR()))"
            ".filter(k=>/zoom|scale|preset|wheel|nudge|fit/i.test(k))"))
        print(" cam:", await pg.evaluate(
            "Object.getOwnPropertyNames(Object.getPrototypeOf(RR().cam))"
            ".filter(k=>/zoom|scale|preset|clamp|fit/i.test(k))"))

        # zoomAt's FIRST ARGUMENT IS AN ABSOLUTE SCALE, not a factor
        # (camera.ts:391 - `newScale`). A first pass at this probe passed 0.85
        # as though it were a multiplier, which is ~14x the fit, and the camera
        # dutifully clamped to maxScale and reported z=11.95. The floor was
        # never under test. Both calls below pass base*f, which is what a wheel
        # event computes before it hands it over.

        # 1. the wheel path, asked for a tenth of the fit, repeatedly
        r = await pg.evaluate("""(()=>{const R=RR(), c=R.cam;
          R.goToPreset(0); const z0=c.scale/c.base;
          for(let i=0;i<60;i++) c.zoomAt(c.scale*0.85, R.W/2, R.H/2, R.W, R.H, 0);
          return {z_before:z0, z_after:c.scale/c.base};})()""")
        print(f"\n  zoomAt(scale x0.85) x60  z {r['z_before']:.4f} -> {r['z_after']:.4f}")

        # 2. the reduced-motion cut, asked for a tenth of the fit
        r2 = await pg.evaluate("""(()=>{const R=RR(), c=R.cam;
          R.goToPreset(0);
          c.cutTo(c.base*0.1, R.W, R.H, 0);
          return {z:c.scale/c.base, had:typeof c.cutTo};})()""")
        print(f"  cutTo(base*0.10)         -> z {r2['z']:.4f}   (cutTo is {r2['had']})")

        # 3. the raw assignment, for contrast — this is NOT a reader path
        r3 = await pg.evaluate("""(()=>{const R=RR(), c=R.cam;
          R.goToPreset(0); c.scale=c.base*0.1; c.clamp(R.W,R.H,0);
          return {z:c.scale/c.base};})()""")
        print(f"  cam.scale = base*0.10    -> z {r3['z']:.4f}   (bypasses the floor)")

        floor_holds = r["z_after"] > 0.99 and r2["z"] > 0.99
        print(f"\n  VERDICT: the reader-facing floor {'HOLDS at z=1' if floor_holds else 'DOES NOT HOLD'}")
        await b.close()


if __name__ == "__main__":
    asyncio.run(main())
