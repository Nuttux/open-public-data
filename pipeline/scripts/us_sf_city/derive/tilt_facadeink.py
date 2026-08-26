"""HOW MUCH OF BLOCK FACADE IS ACTUALLY ON THE SCREEN.

    python3 tilt/facadeink.py <frame> <sa,sa,..> <zexb,..> [url]

The brief's observation, turned into a number, using Block FACADE's own FA5
instrument: render the same frame twice into the same offscreen context, once
with FA.on = 0 and once with FA.on = 1, and count the pixels that MOVED.
Those pixels are the facade — openings, sills, cornices, shopfronts, bays —
and they are counted AFTER occlusion, because they are counted off the raster.

Reported alongside: the unoccluded ink ratio (tilt/ratio.py's identity), the
buildings in frame and the openings the pass drew, so a rise in facade pixels
can be attributed to more wall per building rather than to more buildings.
"""
import asyncio, math, os, sys
from playwright.async_api import async_playwright

FRAMES = {
  "mission":  (2201.,  -835.,  2.00,  2018, 0),
  "sunset":   (-4577., -779.,  2.00,  2018, 0),
  "fidi":     (3433.,  3562.,  2.00,  2018, 0),
  "marina":   (88.,    4675.,  2.00,  2018, 0),
  "hayes":    (1056.,  1503.,  2.00,  2018, 0),
  "missionb": (2201.,  -835.,  0.40,  2018, 0),
  "fidib":    (3433.,  3562.,  0.40,  2018, 0),
  "sunsetb":  (-4577., -779.,  0.40,  2018, 0),
  "whole":    (0.,      500.,  0.00,  2018, 1),
}
FRAME = sys.argv[1]
SAS   = [float(v) for v in sys.argv[2].split(",")]
ZBS   = [float(v) for v in sys.argv[3].split(",")]
URL   = sys.argv[4] if len(sys.argv) > 4 else "http://127.0.0.1:8796/mock-frame.html"

DIFF = """(()=>{
  const W=innerWidth-288,H=innerHeight,D=1;
  const mk=()=>{const c=document.createElement('canvas');
    c.width=Math.round(W*D); c.height=Math.round(H*D);
    const g=c.getContext('2d',{willReadFrequently:true});
    g.setTransform(D,0,0,D,0,0); return [c,g];};
  const [ca,ga]=mk(), [cb,gb]=mk();
  const paint=(g,on)=>{ FA.on=on;
    try{tKey=cKey=tKeyA="";}catch(e){}
    try{FA_BLD=0;FA_OPEN=0;}catch(e){}
    g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,W*D,H*D); g.setTransform(D,0,0,D,0,0);
    drawCity(g,W,H,Math.floor(S.year),
             {marks:buildMarks(S.year,Math.floor(S.year),S.focus).marks});
    return {faced:FA_BLD, open:FA_OPEN}; };
  paint(ga,1);                       // warm
  paint(ga,0); const st=paint(gb,1);
  const A=ga.getImageData(0,0,ca.width,ca.height).data;
  const B=gb.getImageData(0,0,cb.width,cb.height).data;
  let moved=0, ink=0;
  for(let p=0;p<A.length;p+=4){
    if(A[p]!==B[p]||A[p+1]!==B[p+1]||A[p+2]!==B[p+2]||A[p+3]!==B[p+3])moved++;
    ink+=Math.abs(A[p]-B[p])+Math.abs(A[p+1]-B[p+1])+Math.abs(A[p+2]-B[p+2]);
  }
  FA.on=1;
  return {px:ca.width*ca.height, moved:moved, ink:ink,
          faced:st.faced, open:st.open};})()"""

RATIO = """(()=>{
  const W=innerWidth-288,H=innerHeight,k2=cam.scale,W2=W/2,H2=H/2;
  let roof=0, wall=0, n=0;
  for(let i=0;i<UN;i++){
    if(UYR[i]>S.year)continue;
    const o=UOFF[i], nv=UCNT[i];
    let mnx=1e18,mxx=-1e18,mny=1e18,mxy=-1e18;
    for(let k=0;k<nv;k++){const px=UPRX[o+k],py=UPRY[o+k];
      if(px<mnx)mnx=px; if(px>mxx)mxx=px; if(py<mny)mny=py; if(py>mxy)mxy=py;}
    const sx0=(mnx-cam.cx)*k2+W2, sx1=(mxx-cam.cx)*k2+W2, h=UH[i];
    const sy1=H2-(mny-cam.cy)*k2, sy0=H2-(mxy+h*ZEXB-cam.cy)*k2;
    if(sx1<0||sx0>W||sy1<0||sy0>H)continue;
    n++;
    let a2=0;
    for(let k=0;k<nv;k++){const b=(k+1)%nv;
      a2+=UPRX[o+k]*UPRY[o+b]-UPRX[o+b]*UPRY[o+k];}
    roof+=Math.abs(a2)/2;
    for(let k=0;k<nv;k++){ if(!UEVIS[o+k])continue; const b=(k+1)%nv;
      wall+=Math.abs(UPRX[o+b]-UPRX[o+k])*h*ZEXB; }
  }
  return {n:n, frac:+(wall/(wall+roof)).toFixed(4)};})()"""

async def main():
    x, y, sc, yr, wide = FRAMES[FRAME]
    async with async_playwright() as p:
        br = await p.chromium.launch()
        pg = await br.new_page(viewport={"width":1440,"height":940}, device_scale_factor=1)
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(URL, wait_until="networkidle"); await pg.wait_for_timeout(4200)
        await pg.evaluate("setState('watch',true);dismissEntry();pause();"
                          "try{FILM&&FILM.exit&&FILM.exit()}catch(e){}")
        print("  frame=%s   stage %d x %d, DPR 1" % (FRAME, 1440-288, 940))
        print("  %-6s %-6s %-6s %7s %7s %8s %10s %8s %8s" %
              ("sA","phi","ZEXB","in fr","faced","openings","facade px","of stage","unocc %"))
        for sa in SAS:
          for zb in ZBS:
            await pg.evaluate(f"""(()=>{{
              NAV.cancel&&NAV.cancel(); setTilt({sa},{zb});
              pause(); goTo({yr});
              const f={{mx:{x},my:{y},mz:elevM({x},{y}),ll:1}};
              applyZoom({0 if wide else 2}, f);
              if({wide}){{ cam.scale=cam.base; cam.cx=cam.bx; cam.cy=cam.by; }}
              else {{ cam.scale={sc}; const p=proj(f.mx,f.my,f.mz);
                cam.cx=p[0]; cam.cy=p[1]+(innerHeight*0.10)/cam.scale; }}
              cam.clamp&&cam.clamp(innerWidth,innerHeight,288); draw();}})()""")
            d = await pg.evaluate(DIFF); r = await pg.evaluate(RATIO)
            print("  %-6.3f %-6.2f %-6.2f %7d %7d %8d %10d %7.2f%% %7.1f%%" %
                  (sa, math.degrees(math.asin(sa/math.cos(math.pi/6))), zb,
                   r["n"], d["faced"], d["open"], d["moved"],
                   100.0*d["moved"]/d["px"], r["frac"]*100))
        if errs: print("  PAGE ERRORS", errs[:3])
        await br.close()
asyncio.run(main())
