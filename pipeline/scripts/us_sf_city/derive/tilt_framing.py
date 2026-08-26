"""THE FRAMING ASSERTION IS THE CONSTRAINT ON THE TILT — measured, not guessed.

    python3 tilt/framing.py [url] [w] [h]

functional.py Section 17 (mock finding #1, "a small pale plane occupying ~25 %
of the frame") requires San Francisco to fill 0.72 of the visible strip's WIDTH
and 0.72 of the frame's HEIGHT at whole-city zoom.  Lowering sA compresses the
projected box vertically and cannot compress it horizontally, so the height
clause is a hard ceiling on how far the camera may tilt.  This reproduces the
assertion's own measurement across a sweep, at the suite's own viewport.
"""
import asyncio, math, sys
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8796/mock-frame.html"
VW  = int(sys.argv[2]) if len(sys.argv) > 2 else 1440
VH  = int(sys.argv[3]) if len(sys.argv) > 3 else 940
SAS = [0.50,0.48,0.46,0.44,0.42,0.41,0.40,0.38,0.34]

JS = """((sa)=>{ setTilt(sa,1.6); applyZoom(0,null);
  let lo=[1e9,1e9],hi=[-1e9,-1e9];
  for(let i=0;i<N;i+=2)for(let j=0;j<N;j+=2){ if(!maskAt(i,j))continue;
    const p=proj(P.X0+i/P.s,P.Y0+j/P.s,elevAt(i,j));
    const x=SX(p,W),y=SY(p,H);
    if(x<lo[0])lo[0]=x; if(y<lo[1])lo[1]=y;
    if(x>hi[0])hi[0]=x; if(y>hi[1])hi[1]=y;}
  return {w:hi[0]-lo[0], h:hi[1]-lo[1], W:W, H:H, vis:W-288,
          right:hi[0], base:cam.base};})"""

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        pg = await br.new_page(viewport={"width":VW,"height":VH})
        await pg.goto(URL, wait_until="networkidle"); await pg.wait_for_timeout(4200)
        # the suite reaches Section 17 with the entry card dismissed and the reader in
        # 'watching', which is what gives the stage its real height (659, not 940)
        await pg.evaluate("dismissEntry();setState('watch',true);pause();try{FILM&&FILM.exit&&FILM.exit()}catch(e){}")
        await pg.wait_for_timeout(600)
        await pg.evaluate("applyZoom(0,null)")
        await pg.wait_for_timeout(300)
        print("  stage W x H =", await pg.evaluate("[W,H]"))
        print("  viewport %d x %d" % (VW, VH))
        print("  %-6s %-7s %9s %9s %9s %9s  %s" %
              ("sA","phi","width px","of strip","height px","of frame","verdict"))
        for sa in SAS:
            r = await pg.evaluate(JS, sa)
            fw, fh = r["w"]/r["vis"], r["h"]/r["H"]
            ok = "ok" if (fw > 0.72 and fh > 0.72) else "FAIL"
            print("  %-6.3f %-7.2f %9.0f %8.3f %10.0f %8.3f  %s" %
                  (sa, math.degrees(math.asin(sa/math.cos(math.pi/6))),
                   r["w"], fw, r["h"], fh, ok))
        await br.close()
asyncio.run(main())
