"""Why did the pixel->block test drop at 315? Measured, not guessed.

The test asserts blockAtScreen(project(inner point of block i)) === i. A MISS is
only a bug if the returned block is NOT actually painted over that pixel. If the
returned block is drawn LATER in blockOrder and contains the pixel at its own
height, then the hit test agrees with the painter and what changed is OCCLUSION,
not correctness.
"""
import sys
from playwright.sync_api import sync_playwright
U="http://127.0.0.1:8787/mock-frame.html"
JS=r"""(()=>{
  function inner(i){const o=VOFF[i],n=GCNT[i];let a=1e18,b=1e18,c=-1e18,d=-1e18;
    for(let k=0;k<n;k++){const x=RX[o+k],y=RY[o+k];
      if(x<a)a=x;if(x>c)c=x;if(y<b)b=y;if(y>d)d=y;}
    for(let gy=1;gy<8;gy++)for(let gx=1;gx<8;gx++){
      const x=a+(c-a)*gx/8,y=b+(d-b)*gy/8; if(ptInBlock(i,x,y))return[x,y];}
    return null;}
  const ordPos=new Int32Array(NBK).fill(-1);
  for(let k=0;k<blockOrder.length;k++)ordPos[blockOrder[k]]=k;
  let n=0, ok=0, occl=0, wrong=0, nores=0;
  const samples=[];
  for(let i=0;i<NBK;i+=3){const w=inner(i); if(!w)continue;
    const p=proj(w[0],w[1],B.z[i]),x=SX(p,W),y=SY(p,H);
    if(x<4||x>W-4||y<4||y>H-4)continue; n++;
    const got=blockAtScreen(x,y,W,H);
    if(got===i){ok++;continue;}
    if(got<0){nores++; if(samples.length<6)samples.push({i,got:-1}); continue;}
    // does the returned block really paint this pixel, and is it drawn later?
    const a0=invAt((x-W/2)/cam.scale+cam.cx, cam.cy-(y-H/2)/cam.scale, 0);
    const a1=invAt((x-W/2)/cam.scale+cam.cx, cam.cy-(y-H/2)/cam.scale, 1);
    const rx=a1[0]-a0[0], ry=a1[1]-a0[1];
    const bz=B.z[got];
    const paints=ptInBlock(got, a0[0]+rx*bz, a0[1]+ry*bz);
    const later=ordPos[got]>ordPos[i];
    if(paints&&later)occl++;
    else{wrong++; if(samples.length<6)samples.push({i,got,paints,later,
        dExp:+depth(BCX[i],BCY[i]).toFixed(1), dGot:+depth(BCX[got],BCY[got]).toFixed(1),
        zExp:+B.z[i].toFixed(1), zGot:+B.z[got].toFixed(1)});}
  }
  return {n, ok, occl, wrong, nores,
          pct:+(100*ok/n).toFixed(1), pctWithOccl:+(100*(ok+occl)/n).toFixed(1), samples};})()"""
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1440,"height":900})
    pg.goto(U); pg.wait_for_timeout(3000)
    pg.evaluate("pause();dismissEntry();NAV.goHome()"); pg.wait_for_timeout(800)
    d=pg.evaluate(JS)
    print("whole city:", {k:v for k,v in d.items() if k!="samples"})
    for s in d["samples"]: print("   sample:", s)
    pg.evaluate("NAV.toPreset(1)"); pg.wait_for_timeout(800)
    d2=pg.evaluate(JS)
    print("district :", {k:v for k,v in d2.items() if k!="samples"})
    for s in d2["samples"]: print("   sample:", s)
    b.close()
