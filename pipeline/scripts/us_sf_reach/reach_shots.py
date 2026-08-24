"""Photograph the extent limit, and probe what lies just past it.

READ-ONLY against the product: this script edits no source file. It drives the
live renderer through the hook the parity harness already uses
(`globalThis.__cityRenderer`, with the React-fiber walk as the fallback) and
puts the camera where the shipped clamp will not let a reader put it, purely to
find out what is already drawable.

Three shots:

  1-today       the whole-city preset, exactly as it ships
  2-clamped     proof that asking for a wider frame does nothing: cam.scale is
                set to base*0.35 and the shipped clamp pulls it back
  3-peninsula   the same frame with the clamp stepped over at runtime, so the
                already-shipped surround plate is visible. NOTHING NEW IS
                LOADED. If this picture has land in it, the land was in the
                published files all along.

Traps observed, from website/.parity/NIGHT.md:
  - a film frame looks like a valid capture; `filmOn` is asserted false
  - a forced stage resize reverts on recompile; the size is asserted at the shutter
  - one toDataURL is not a frame; two identical frames 700 ms apart are

    python3 pipeline/scripts/us_sf_reach/reach_shots.py
"""
from __future__ import annotations

import asyncio
import pathlib

from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
URL = "http://localhost:3000/us/city/sf/the-city"
W, H, DPR = 1440, 940, 2

RR_INIT = """
window.RR = function(){
  const g = globalThis.__cityRenderer;
  if (g && typeof g.goToPreset === 'function' && !g.disposed) return g;
  const cv=document.querySelector('canvas.fx-city-canvas');
  if(!cv) throw new Error('no canvas');
  const key=Object.keys(cv).find(k=>k.startsWith('__reactFiber$'));
  if(!key) throw new Error('no fiber');
  let f=cv[key], seen=0, found=null;
  while(f && seen<40){
    let h=f.memoizedState, i=0;
    while(h && i<40){
      const v=h.memoizedState;
      if(v&&typeof v==='object'&&'current' in v&&v.current&&typeof v.current.goToPreset==='function') found=v.current;
      h=h.next; i++;
    }
    if(found) break;
    f=f.return; seen++;
  }
  if(!found) throw new Error('renderer not on fiber');
  return found;
};
"""

KILL_FILM = """(()=>{
  const R=RR();
  if (R.filmOn) R.driveFilm(null);
  R.scene.filmHide=null; R.scene.filmRunning=false; R.scene.filmUnderlay=null;
  R.glide=null; R.mode='idle'; R.zTarget=0; R.settleAt=0;
  return {filmOn:!!R.filmOn};
})()"""


async def ready(pg):
    for _ in range(120):
        try:
            await pg.evaluate(RR_INIT)
            r = await pg.evaluate("""(()=>{const R=RR(),d=R.data;
              const base=d.manifest.chunks.filter(c=>c.tier==='base');
              const s=d.stats();
              return {miss:base.filter(c=>!d.has(c.k)).length,
                      inFlight:s.inFlight, queued:s.queued, cells:R.lastStats.cells};})()""")
            if r["miss"] == 0 and r["inFlight"] == 0 and r["queued"] == 0 and r["cells"] > 0:
                return
        except Exception:
            pass
        await pg.wait_for_timeout(1000)
    raise RuntimeError("prod never became ready")


async def shoot(pg, name):
    st = await pg.evaluate(
        "({filmOn:!!RR().filmOn, W:RR().W, H:RR().H, scale:RR().cam.scale,"
        " base:RR().cam.base, z:RR().cam.scale/RR().cam.base,"
        " cx:RR().cam.cx, cy:RR().cam.cy, cells:RR().lastStats.cells,"
        " bldg:RR().lastStats.buildings})")
    assert st["filmOn"] is False, "SHUTTER WHILE FILM RUNNING — see NIGHT.md trap 2"
    # NIGHT.md trap 3: a forced stage resize reverts on recompile. The size is
    # asserted at the shutter and the ACTUAL size is printed, never assumed.
    assert abs(st["W"] - W) <= 4 and abs(st["H"] - H) <= 4, (
        f"stage drifted too far: {st['W']}x{st['H']}")
    out = HERE / f"shot-{name}.png"
    await pg.locator(".fx-city-stage").screenshot(path=str(out))
    print(f"  {out.name:22s} {st['W']}x{st['H']} z={st['z']:.3f} "
          f"scale={st['scale']:.5f} cells={st['cells']} bldg={st['bldg']}")
    return st


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": W + 420, "height": H + 400},
                              device_scale_factor=DPR)
        pg.on("pageerror", lambda e: print("  pageerror:", e))
        await pg.add_init_script(RR_INIT)
        await pg.goto(URL, wait_until="domcontentloaded")
        await ready(pg)
        await pg.evaluate(f"""(()=>{{
          const host=document.querySelector('.fx-city-stage');
          host.style.width='{W}px'; host.style.height='{H}px'; host.style.maxWidth='none';
          RR().resize({W},{H},{DPR});
        }})()""")
        await pg.wait_for_timeout(2500)
        print(" film:", await pg.evaluate(KILL_FILM))

        # 1 — as it ships
        await pg.evaluate("(()=>{RR().goToPreset(0); RR().render(true);})()")
        await pg.wait_for_timeout(2000)
        await pg.evaluate(KILL_FILM)
        await pg.wait_for_timeout(400)
        a = await shoot(pg, "1-today")

        # 2 — ask for a wider frame through the shipped path
        await pg.evaluate("""(()=>{const R=RR();
          R.cam.scale = R.cam.base*0.35;      // a third of the fit
          R.cam.clamp(R.W, R.H, 0);           // the shipped clamp
          R.render(true);})()""")
        await pg.wait_for_timeout(1200)
        bshot = await shoot(pg, "2-clamped")
        print(f"  ASKED z=0.350  GOT z={bshot['z']:.3f}  "
              f"-> the clamp refused {'YES' if bshot['z'] > 0.36 else 'NO'}")

        # 3 — step over the clamp at runtime and look south. Nothing new loads.
        st = await pg.evaluate("""(()=>{const R=RR(), c=R.cam, P=R.scene.proj;
          const before = R.data.stats();
          c.scale = c.base*0.34;
          // world (0, -5000): the city's own centre pushed 5 km south, so the
          // frame covers the peninsula the surround plate already holds.
          const q = P.proj(0, -5000, 0); c.cx=q[0]; c.cy=q[1];
          R.render(true);
          const after = R.data.stats();
          return {inFlightBefore:before.inFlight, inFlightAfter:after.inFlight,
                  queued:after.queued};})()""")
        await pg.wait_for_timeout(2500)
        c = await pg.evaluate(
            "({filmOn:!!RR().filmOn,W:RR().W,H:RR().H,scale:RR().cam.scale,"
            " base:RR().cam.base,z:RR().cam.scale/RR().cam.base,cells:RR().lastStats.cells,"
            " bldg:RR().lastStats.buildings})")
        assert c["filmOn"] is False
        print(f"  stage at shutter: {c['W']}x{c['H']}")
        await pg.locator(".fx-city-stage").screenshot(path=str(HERE / "shot-3-peninsula.png"))
        print(f"  shot-3-peninsula.png   z={c['z']:.3f} cells={c['cells']} bldg={c['bldg']}")
        print(f"  chunks fetched for this view: queued={st['queued']} "
              f"inFlight {st['inFlightBefore']} -> {st['inFlightAfter']}")
        await b.close()


if __name__ == "__main__":
    asyncio.run(main())
