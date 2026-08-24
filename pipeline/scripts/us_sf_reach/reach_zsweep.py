"""How far CAN the camera pull back before the world runs out?

`shot-3-peninsula.png` showed that pulling back past the shipped fit exposes the
surround plate's own rectangular edge — the world becomes a slab floating on
paper. That edge is the real budget for any wider camera, so this measures it
instead of guessing: pull back in steps, and at each step count how much of the
frame is the page behind the map rather than land or water.

The test is a corner probe: the four corners of the stage are sampled from the
canvas. While the plate covers the frame they are land or water; the moment the
plate edge enters, they become the page. Read-only — no source file is touched.

    python3 pipeline/scripts/us_sf_reach/reach_zsweep.py
"""
from __future__ import annotations

import asyncio
import pathlib

from playwright.async_api import async_playwright

HERE = pathlib.Path(__file__).resolve().parent
URL = "http://localhost:3000/us/city/sf/the-city"
W, H, DPR = 1440, 940, 2
STEPS = [1.00, 0.85, 0.80, 0.78, 0.76, 0.74, 0.72, 0.70, 0.65]

RR_INIT = (HERE / "reach_shots.py").read_text().split('RR_INIT = """')[1].split('"""')[0]

PROBE = """(()=>{
  const R=RR(), cv=R.canvas || document.querySelector('canvas.fx-city-canvas');
  const g=cv.getContext('2d'); const w=cv.width, h=cv.height;
  // sample a ring of points just inside each edge, plus the four corners
  const pts=[]; const m=8;
  for(let i=1;i<=9;i++){ const f=i/10;
    pts.push([Math.round(w*f), m], [Math.round(w*f), h-m],
             [m, Math.round(h*f)], [w-m, Math.round(h*f)]); }
  pts.push([m,m],[w-m,m],[m,h-m],[w-m,h-m]);
  let paper=0; const seen={};
  for(const [x,y] of pts){
    const d=g.getImageData(x,y,1,1).data;
    const k=d[0]+','+d[1]+','+d[2];
    seen[k]=(seen[k]||0)+1;
    // THE VOID IS ONE MEASURED COLOUR, not a heuristic. Sampled off
    // shot-3-peninsula.png where the plate demonstrably ends: (219,219,215),
    // against the pale surround terrain at (228,223,210). The two are only
    // 9 apart on red, so the test is an exact-ish distance, not a brightness
    // threshold - a loose threshold counted the terrain as void and reported
    // an edge at z=1.00 where shot-1-today plainly has none.
    const dr=d[0]-219, dg=d[1]-219, db=d[2]-215;
    if(dr*dr+dg*dg+db*db < 36) paper++;
  }
  return {n:pts.length, paper, pct:+(100*paper/pts.length).toFixed(1)};
})()"""


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
        await pg.evaluate(f"""(()=>{{
          const host=document.querySelector('.fx-city-stage');
          host.style.width='{W}px'; host.style.height='{H}px'; host.style.maxWidth='none';
          RR().resize({W},{H},{DPR});}})()""")
        await pg.wait_for_timeout(2500)
        await pg.evaluate("""(()=>{const R=RR();
          if(R.filmOn) R.driveFilm(null);
          R.scene.filmHide=null; R.scene.filmRunning=false; R.scene.filmUnderlay=null;
          R.glide=null; R.mode='idle';})()""")

        print(f"{'z':>6} {'km across':>10} {'edge samples that are PAGE':>28}   verdict")
        man = await pg.evaluate("({pxA:RR().scene.proj?1.2247:1.2247, base:RR().cam.base})")
        first_bad = None
        for z in STEPS:
            CY = 0  # camera on the city's own centre: the fair pull-back test
            await pg.evaluate("""([z,CY])=>{const R=RR(), c=R.cam, P=R.scene.proj;
              if(R.filmOn) R.driveFilm(null);
              c.scale=c.base*z;
              const q=P.proj(0,CY,0); c.cx=q[0]; c.cy=q[1];
              R.render(true);}""", [z, CY])
            await pg.wait_for_timeout(900)
            r = await pg.evaluate(PROBE)
            km = W / (1.2247 * man["base"] * z) / 1000
            ok = r["paper"] == 0
            if not ok and first_bad is None:
                first_bad = z
            print(f"{z:6.2f} {km:10.1f} {r['paper']:>10d} / {r['n']:<3d} = {r['pct']:5.1f}%"
                  f"      {'world fills the frame' if ok else 'PLATE EDGE VISIBLE'}")
        print()
        print(f"first z at which the plate edge shows: {first_bad}")
        await b.close()


if __name__ == "__main__":
    asyncio.run(main())
