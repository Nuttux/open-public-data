"""Measure the real pixel geometry of the current renderer at each zoom.
Nothing here changes anything; it reads cam/UPBB/UD out of the live page."""
import json, sys
from playwright.sync_api import sync_playwright
URL="http://127.0.0.1:8787/mock-frame.html"
JS = r"""(()=>{
  const W=innerWidth, H=innerHeight;
  const k=cam.scale, W2=W/2, H2=H/2;
  // px per world metre along each screen axis at ROT 315
  const o=proj(0,0,0), px1=proj(1,0,0), py1=proj(0,1,0);
  const mx=(px1[0]-o[0])*k, my=(py1[1]-o[1])*k;
  const hz=(proj(0,0,1)[1]-o[1])*k;           // px per metre of TERRAIN
  const hb=0.7071067811865476*0.5*2*1.6*k;    // not used; computed below properly
  // building sizes
  let n=0, widths=[], tall=0, inframe=0;
  const cx0=-24, cy0=-24, cx1=W+24, cy1=H+40;
  const iy=Math.floor(S.year||2018);
  for(let i=0;i<UN;i++){
    const bo=i*4;
    const sminx=(UPBB[bo]-cam.cx)*k+W2, smaxx=(UPBB[bo+2]-cam.cx)*k+W2;
    const zZ=UZ[i]*ZEX;
    const smaxy=H2-(UPBB[bo+1]+zZ-cam.cy)*k, sminy=H2-(UPBB[bo+3]+zZ-cam.cy)*k;
    const dh=UH[i]*ZEXB*k;
    if(smaxx<cx0||sminx>cx1||smaxy<cy0||sminy-dh>cy1)continue;
    inframe++;
    if(UYR[i]>iy)continue;
    n++; widths.push(smaxx-sminx);
    if(dh>1.5)tall++;
  }
  widths.sort((a,b)=>a-b);
  const q=p=>widths.length?+widths[Math.min(widths.length-1,Math.floor(p*widths.length))].toFixed(2):0;
  return {W,H, base:+cam.base.toFixed(5), scale:+cam.scale.toFixed(5), z:+(cam.scale/cam.base).toFixed(3),
          step:cam.step, pxPerM_x:+mx.toFixed(4), pxPerM_y:+my.toFixed(4),
          pxPerM_terrainZ:+hz.toFixed(4), pxPerM_bldZ:+(hz/ZEX*ZEXB).toFixed(4),
          inframe, drawn:n, extruded:tall,
          bw_p10:q(0.10), bw_p50:q(0.50), bw_p90:q(0.90), bw_p99:q(0.99), bw_max:q(0.999)};
})()"""
with sync_playwright() as p:
    b=p.chromium.launch()
    pg=b.new_page(viewport={"width":1440,"height":940})
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(2600)
    pg.evaluate("setState('watch',true);dismissEntry();pause()")
    for yr in (1906, 2018):
        pg.evaluate(f"goTo({yr})")
        for step in (0,1,2):
            pg.evaluate(f"applyZoom({step},{'null' if step==0 else 'BEATS.find(b=>b.id===`new-city-hall`)'});pause();draw()")
            pg.wait_for_timeout(500)
            r=pg.evaluate(JS); r["year"]=yr
            print(json.dumps(r))
    # and the deepest free zoom
    pg.evaluate("cam.scale=cam.base*12; cam.clamp(innerWidth,innerHeight,288); draw()")
    pg.wait_for_timeout(400)
    r=pg.evaluate(JS); r["year"]="2018 @12x"; print(json.dumps(r))
    print("errs", errs[:3])
    b.close()
