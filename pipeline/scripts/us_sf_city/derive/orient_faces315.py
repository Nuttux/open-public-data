"""Does the wall table still resolve at 315 deg? Runs functional.py SS21's own
assertions, verbatim where possible, at 210 and at 315."""
from playwright.sync_api import sync_playwright
URL="http://127.0.0.1:8791/orient/mock-o.html"

CHECKS = {
 "no wall painted that faces away (all real block edges)": """(()=>{const dx=(cR+sR), dy=(cR-sR); let bad=0;
   for(let i=0;i<NBK;i++){const o=VOFF[i],n=GCNT[i];
     for(let k=0;k<n;k++){const q=(k+1)%n;
       const ex=RX[o+q]-RX[o+k], ey=RY[o+q]-RY[o+k];
       const L=Math.hypot(ex,ey)||1, nx=ey/L, ny=-ex/L;
       if(EVIS[o+k] !== ((dx*nx+dy*ny)<0?1:0)) bad++;}}
   return bad===0;})()""",
 "every block shows >=1 wall and never all of them": """(()=>{let bad=0;
   for(let i=0;i<NBK;i++){const o=VOFF[i],n=GCNT[i];let v=0;
     for(let k=0;k<n;k++)v+=EVIS[o+k];
     if(v===0||v===n)bad++;}
   return bad===0;})()""",
 "per-edge table reproduces the old two-frame FACES (vis==2 && lit==1)": """(()=>{
   const o0=proj(0,0,0), dx=(cR+sR), dy=(cR-sR);
   return C.blocks.frames.every(f=>{
     const rot=f[0],ca=Math.cos(rot),sa=Math.sin(rot);
     const qq=[[-1,-1],[1,-1],[1,1],[-1,1]].map(c=>[c[0]*ca-c[1]*sa,c[0]*sa+c[1]*ca]);
     let vis=0, lit=0;
     for(let k=0;k<4;k++){const b=(k+1)%4;
       const ex=qq[b][0]-qq[k][0], ey=qq[b][1]-qq[k][1];
       const L=Math.hypot(ex,ey)||1, nx=ey/L, ny=-ex/L;
       if((dx*nx+dy*ny)<0){vis++; if((proj(nx,ny,0)[0]-o0[0])>0)lit++;}}
     return vis===2 && lit===1;});})()""",
 "SUN points up and to the RIGHT on screen (as shipped)": """(()=>{const o=proj(0,0,0),p=proj(SUN[0],SUN[1],0);
   return (p[0]-o[0])>0 && (-(p[1]-o[1]))<0;})()""",
}
DETAIL = """(()=>{
  const o0=proj(0,0,0), dx=(cR+sR), dy=(cR-sR);
  const per=C.blocks.frames.map(f=>{
    const rot=f[0],ca=Math.cos(rot),sa=Math.sin(rot);
    const qq=[[-1,-1],[1,-1],[1,1],[-1,1]].map(c=>[c[0]*ca-c[1]*sa,c[0]*sa+c[1]*ca]);
    let vis=0,lit=0;
    for(let k=0;k<4;k++){const b=(k+1)%4;
      const ex=qq[b][0]-qq[k][0], ey=qq[b][1]-qq[k][1];
      const L=Math.hypot(ex,ey)||1, nx=ey/L, ny=-ex/L;
      if((dx*nx+dy*ny)<0){vis++; if((proj(nx,ny,0)[0]-o0[0])>0)lit++;}}
    return {gridDeg:+(rot*180/Math.PI).toFixed(1), vis, lit};});
  // how many of the 166k real buildings show only ONE wall?
  let one=0,two=0,more=0;
  for(let i=0;i<UN;i++){const o=UOFF[i],n=UCNT[i];let v=0;
    for(let k=0;k<n;k++)v+=UEVIS[o+k];
    if(v===1)one++; else if(v===2)two++; else more++;}
  return {frames:per, bld1wall:one, bld2wall:two, bldmore:more, UN};})()"""

with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1440,"height":900})
    pg.goto(URL); pg.wait_for_timeout(3200)
    pg.evaluate("setState('watch',true);pause();dismissEntry();goTo(1955)")
    for rot,sun in ((210,None),(315,[0.2435,0.6346])):
        pg.evaluate(f"setRot({rot})")
        if sun: pg.evaluate("(s)=>{SUN[0]=s[0];SUN[1]=s[1];}", sun)
        print(f"\n===== ROT {rot}"+(f"  (SUN re-solved to {sun})" if sun else "  (SUN as shipped)")+" =====")
        for name,js in CHECKS.items():
            ok=pg.evaluate(js)
            print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
        d=pg.evaluate(DETAIL)
        print("   street frames (the two grids):", d["frames"])
        tot=d["UN"]
        print(f"   real buildings by visible-wall count: 1 wall {d['bld1wall']:,} "
              f"({100*d['bld1wall']/tot:.1f}%) | 2 walls {d['bld2wall']:,} "
              f"({100*d['bld2wall']/tot:.1f}%) | 3+ {d['bldmore']:,}")
    b.close()
