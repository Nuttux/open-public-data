"""What a bearing change actually costs, measured on the page rather than argued.

Three things are bearing-sensitive and they are NOT the same three the spec
names. Measured here:
  A. wall visibility  — does every block still show at least one wall and never
     all of them?  (functional.py SS21 asserts this)
  B. wall width       — the 2:1 dimetric squashes one screen axis. At some
     bearings a whole street direction collapses to zero width and the fabric
     stops being 3D.
  C. the sun          — SUN is a WORLD vector, so its SCREEN direction rotates
     with the bearing. SS21 asserts it lands up-and-right.
"""
import json, math
from playwright.sync_api import sync_playwright
ROOT="/Users/daniel/code/open-public-data/scratchpad/sf-city-anim/"
URL="http://127.0.0.1:8791/orient/mock-o.html"

JS=r"""
()=>{
  const dx=(cR+sR), dy=(cR-sR);
  const ax=(cR-sR)*Math.cos(Math.PI/6), ay=(-sR-cR)*Math.cos(Math.PI/6);
  const H2=Math.hypot(ax,ay);
  // A. blocks with no visible wall / all walls visible
  let none=0, all=0;
  for(let i=0;i<NBK;i++){const o=VOFF[i],n=GCNT[i];let v=0;
    for(let k=0;k<n;k++)v+=EVIS[o+k];
    if(v===0)none++; if(v===n)all++;}
  // A2. same for the 166k real buildings
  let bnone=0;
  for(let i=0;i<UN;i++){const o=UOFF[i],n=UCNT[i];let v=0;
    for(let k=0;k<n;k++)v+=UEVIS[o+k];
    if(v===0)bnone++;}
  // B. relative on-screen width of a wall running along compass bearing b
  const wid=b=>{const r=b*Math.PI/180;
    return Math.abs(ax*Math.sin(r)+ay*Math.cos(r))/H2;};
  // C. where does the sun point on screen?
  const o0=proj(0,0,0), ps=proj(SUN[0],SUN[1],0);
  const sx=ps[0]-o0[0], sy=-(ps[1]-o0[1]);           // SY flips py
  const sunDeg=Math.atan2(sy,sx)*180/Math.PI;         // 0=right, +90=up
  // D. how much of the frame does San Francisco itself occupy?
  return {none, all, bnone,
          w_NS:wid(0), w_EW:wid(90), w_dtNE:wid(42), w_dtNW:wid(132),
          sunScreenDeg:sunDeg, sunUpRight:(sx>0 && sy>0)};
}
"""
ROTS=[0,30,45,75,90,120,135,165,180,195,210,225,240,255,270,285,300,315,330,345]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1440,"height":900})
    pg.goto(URL); pg.wait_for_timeout(3200)
    pg.evaluate("setState('watch',true);pause();dismissEntry();goTo(1955)")
    rows=[]
    for r in ROTS:
        pg.evaluate(f"setRot({r})"); pg.wait_for_timeout(120)
        d=pg.evaluate(JS); d["rot"]=r; d["up"]=(r+45)%360; rows.append(d)
    b.close()
json.dump(rows, open(ROOT+"orient/cost.json","w"), indent=1)
print(f"{'ROT':>4} {'up':>4} | {'blk 0-wall':>10} {'blk all':>8} {'bld 0-wall':>10} |"
      f" {'N-S st':>7} {'E-W st':>7} {'dt NE':>7} {'dt NW':>7} | {'sun deg':>8} {'up-right?':>9}")
for d in rows:
    print(f"{d['rot']:>4} {d['up']:>4} | {d['none']:>10} {d['all']:>8} {d['bnone']:>10} |"
          f" {d['w_NS']:7.3f} {d['w_EW']:7.3f} {d['w_dtNE']:7.3f} {d['w_dtNW']:7.3f} |"
          f" {d['sunScreenDeg']:8.1f} {str(d['sunUpRight']):>9}")
