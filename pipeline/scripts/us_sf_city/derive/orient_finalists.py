"""Finalist bearings, with an optional PREVIEW of the one-line sun fix.

SUN is a WORLD vector, so its screen direction rotates with the bearing. To hold
the key light where it is (up and to the right) at a new bearing, rotate SUN's
horizontal part by (210 - ROT_new). That is exact, not eyeballed: the world->
screen map is D.Rot(R) with D fixed, so D.Rot(Rn).s_new == D.Rot(210).s_old
iff s_new == Rot(210-Rn).s_old.

Preview only. Nothing here touches gen/.
"""
import sys, math
from playwright.sync_api import sync_playwright
sys.path.insert(0,"/Users/daniel/code/open-public-data/scratchpad/sf-city-anim/orient")
from sheet import OVERLAY, HIDE, LM, upbear, name, ROOT, URL

SUNFIX = r"""
(deg)=>{
  const a=deg*Math.PI/180, c=Math.cos(a), s=Math.sin(a);
  const sx=-0.676, sy=0.071;                     // the 210-degree solution
  SUN[0]=sx*c-sy*s; SUN[1]=sx*s+sy*c;            // rotate by (210 - ROT_new)
  const Z=3.3;                                   // LAM/XLAM were built at ZEX 3.3
  for(let i=1;i<N-1;i++)for(let j=1;j<N-1;j++){
    const gx=(elevAt(i+1,j)-elevAt(i-1,j))/2*Z, gy=(elevAt(i,j+1)-elevAt(i,j-1))/2*Z;
    const nz=1/Math.sqrt(gx*gx+gy*gy+1), nx=-gx*nz, ny=-gy*nz;
    LAM[i*N+j]=Math.max(0,Math.min(1,nx*SUN[0]+ny*SUN[1]+nz*SUN[2]));}
  for(let j=1;j<XH-1;j++)for(let i=1;i<XW-1;i++){
    const gx=(xzAt(i+1,j)-xzAt(i-1,j))/2*Z/1.8, gy=(xzAt(i,j+1)-xzAt(i,j-1))/2*Z/1.8;
    const nz=1/Math.sqrt(gx*gx+gy*gy+1);
    XLAM[j*XW+i]=Math.max(0,Math.min(1,(-gx*nz)*SUN[0]+(-gy*nz)*SUN[1]+nz*SUN[2]));}
  shadeCache.clear();
  const o=proj(0,0,0), p=proj(SUN[0],SUN[1],0);
  return {sx:p[0]-o[0], syScreen:-(p[1]-o[1]), SUN:[SUN[0],SUN[1],SUN[2]]};
}
"""

def shoot(rots, year, step, prefix, focus=None, sunfix=False):
    with sync_playwright() as p:
        b=p.chromium.launch(); pg=b.new_page(viewport={"width":1440,"height":900})
        pg.goto(URL); pg.wait_for_timeout(3200)
        pg.evaluate("setState('watch',true);pause();dismissEntry();goTo(%d)"%year)
        pg.evaluate(HIDE); pg.wait_for_timeout(400)
        pg.evaluate("const _d=window.draw;window.draw=function(){_d();if(window.__OV)window.__OV();}")
        for r in rots:
            if sunfix:
                info=pg.evaluate(SUNFIX, (210-r)%360)
                print(f"  ROT {r}: SUN -> [{info['SUN'][0]:.3f},{info['SUN'][1]:.3f},{info['SUN'][2]:.2f}]"
                      f"  screen dx={info['sx']:+.3f} dy={info['syScreen']:+.3f}"
                      f"  {'UP-RIGHT ok' if info['sx']>0 and info['syScreen']<0 else 'WRONG SIDE'}")
            up=upbear(r)
            note=f"ROT {r}°  —  screen-up = {up:.0f}° {name(up)}"
            if r==210: note+="   [CURRENT]"
            if sunfix: note+="   sun re-solved"
            pg.evaluate(OVERLAY, {"pts":LM,"rot":r,"note":note})
            js=f"setRot({r});fitCity(W,H);cam.step={step};ZEX=ZEX_BY_STEP[{step}];"
            js+=("const _m=toM(%r,%r);setCam(W,H,{ll:1,mx:_m[0],my:_m[1],mz:elevM(_m[0],_m[1])});"%focus) if focus else "setCam(W,H,null);"
            js+="tKey=tKeyA=cKey='';draw()"
            pg.evaluate(js); pg.wait_for_timeout(900)
            pg.locator("#stage").screenshot(path=f"{ROOT}orient/shots/{prefix}{r:03d}.png")
            print("shot", prefix, r)
        b.close()

if __name__=="__main__":
    what=sys.argv[1]
    rots=[int(x) for x in sys.argv[2:]]
    if what=="city":      shoot(rots,1955,0,"o-city-")
    if what=="cityfix":   shoot(rots,1955,0,"o-fix-city-",sunfix=True)
    if what=="dist":      shoot(rots,1955,1,"o-dist-",focus=(-122.4050,37.7880))
    if what=="distfix":   shoot(rots,1955,1,"o-fix-dist-",focus=(-122.4050,37.7880),sunfix=True)
    if what=="sunsetfix": shoot(rots,1955,1,"o-fix-sunset-",focus=(-122.4880,37.7570),sunfix=True)
    if what=="sunset":    shoot(rots,1955,1,"o-sunset-",focus=(-122.4880,37.7570))
