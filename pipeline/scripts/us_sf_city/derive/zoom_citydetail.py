"""Edge density of the CITY LAYER ALONE — drawCity() into a blank canvas, no
terrain under it — reported as edge LENGTH in world metres per 1000 m2, which
is scale-free. Flat means the same published edges drawn larger. Rising means
edges that were not resolved before have appeared: either new record, or the
renderer's own ramps and blurs coming apart.

    python3 zoomlabels/citydetail.py [URL]
"""
import sys, os, base64, io
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
URL=sys.argv[1] if len(sys.argv)>1 else "http://127.0.0.1:8787/mock-frame.html"
BEAT=sys.argv[2] if len(sys.argv)>2 else "new-city-hall"
ZS=[2.35,2.9,4.57,7.2,10,14,20,28,36,44,52,64,80,112]
W,H=1440,940; SIDE_M=240.0
JS=r"""(z)=>{
  const b=BEATS.find(x=>x.id===(window.ZBEAT||'new-city-hall'));
  applyZoom(2,b); pause(); goTo(2018);
  cam.scale=cam.base*z;
  const p=proj(b.mx,b.my,b.mz); cam.centreOn(p,W,H,288);
  cam.frozenStep=null; if(cam.syncStep)cam.syncStep(); ZEX=ZEX_BY_STEP[cam.step];
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const g=c.getContext('2d');
  g.fillStyle='#ffffff'; g.fillRect(0,0,W,H);
  const M=buildMarks(2018,2018,null);
  drawCity(g,W,H,2018.999,{marks:M.marks});
  const q=proj(b.mx,b.my,b.mz);
  return {z:+cam.z().toFixed(4), scale:cam.scale, sx:SX(q,W), sy:SY(q,H),
          png:c.toDataURL('image/png')};
}"""
def sobel(a):
    a=a.astype(np.float32)
    gx=np.abs(a[1:-1,2:]-a[1:-1,:-2]); gy=np.abs(a[2:,1:-1]-a[:-2,1:-1])
    return np.hypot(gx,gy)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":W,"height":H},device_scale_factor=1)
    pg.goto(URL); pg.wait_for_timeout(3000)
    pg.evaluate("if(typeof FILM!=='undefined'&&FILM.on&&FILM.exit)FILM.exit();"
                "setState('watch',true);dismissEntry();pause();window.ZDET_NOLBL=1")
    pg.evaluate("b=>window.ZBEAT=b", BEAT)
    pg.wait_for_timeout(300)
    print(f"  CITY LAYER ALONE — 240 m window, {BEAT}, 2018")
    print(f"  {'z':>7} {'px/m':>7} {'med bldg px':>12} {'edge m/1000m2':>14} {'rel':>6}")
    base=None
    for z in ZS:
        r=pg.evaluate(JS,z)
        im=np.asarray(Image.open(io.BytesIO(base64.b64decode(r["png"].split(",")[1]))).convert("L"))
        pxm=1.2247*r["scale"]; side=SIDE_M*pxm
        cx,cy=r["sx"],r["sy"]
        x0=int(max(0,cx-side/2)); x1=int(min(im.shape[1],cx+side/2))
        y0=int(max(0,cy-side/2)); y1=int(min(im.shape[0],cy+side/2))
        crop=im[y0:y1,x0:x1]
        e=sobel(crop); n=float((e>6).sum())
        area=((x1-x0)/pxm)*((y1-y0)/pxm)
        d=n/pxm/area*1000.0
        if base is None: base=d
        print(f"  {z:>7.2f} {pxm:>7.3f} {1.02*z:>12.1f} {d:>14.2f} {d/base:>6.2f}")
    b.close()
