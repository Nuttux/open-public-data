"""Contact sheet: the same populated frame at a spread of bearings.

Same camera model, same year, same zoom step, ONLY `setRot` varies. Chrome is
hidden so the judgement is about the landmass; the camera still reserves the
288 px ledger strip in every frame, so the offset is identical across the set
and the comparison stays fair.

Reads a frozen copy of the built page. Writes only into orient/.
"""
import sys, json
from playwright.sync_api import sync_playwright

ROOT="/Users/daniel/code/open-public-data/scratchpad/sf-city-anim/"
URL="http://127.0.0.1:8791/orient/mock-o.html"

LM = [  # name, lon, lat, label anchor ("r" right of dot, "l" left)
 ("Golden Gate Br", -122.4783, 37.8100, "r"),
 ("Ferry Bldg",     -122.3937, 37.7955, "r"),
 ("Coit Tower",     -122.4058, 37.8024, "r"),
 ("Twin Peaks",     -122.4477, 37.7544, "r"),
 ("Ocean Beach",    -122.5100, 37.7600, "l"),
 ("Candlestick",    -122.3860, 37.7130, "l"),
 ("Lake Merced",    -122.4900, 37.7280, "l"),
 ("Civic Center",   -122.4194, 37.7793, "r"),
]

OVERLAY = r"""
(args)=>{
 const {pts,rot,note}=args;
 window.__OV=function(){
  const g=ctx; g.save();
  g.font='600 14px ui-monospace,Menlo,monospace';
  for(const [n,lo,la,side] of pts){
    const m=toM(lo,la); const p=proj(m[0],m[1],elevM(m[0],m[1])+45);
    const x=SX(p,W), y=SY(p,H);
    g.strokeStyle='#fff'; g.lineWidth=2.5;
    g.beginPath(); g.arc(x,y,5,0,7); g.stroke();
    g.fillStyle='#e11d1d'; g.beginPath(); g.arc(x,y,4.2,0,7); g.fill();
    const w=g.measureText(n).width+10;
    const bx = side==='r' ? x+9 : x-9-w;
    g.fillStyle='rgba(255,255,255,0.92)'; g.fillRect(bx,y-19,w,19);
    g.strokeStyle='rgba(0,0,0,0.25)'; g.lineWidth=1; g.strokeRect(bx+0.5,y-18.5,w-1,18);
    g.fillStyle='#0a0a0a'; g.fillText(n,bx+5,y-5);
  }
  /* compass rose: where is true north on this screen? */
  const o=proj(0,0,0), nn=proj(0,1,0);
  let nx=nn[0]-o[0], ny=-(nn[1]-o[1]);
  const L=Math.hypot(nx,ny)||1; nx/=L; ny/=L;
  const cx=96, cy=H-104, R=46;
  g.fillStyle='rgba(255,255,255,0.93)'; g.beginPath(); g.arc(cx,cy,R+14,0,7); g.fill();
  g.strokeStyle='#0a0a0a'; g.lineWidth=1.4; g.beginPath(); g.arc(cx,cy,R+14,0,7); g.stroke();
  g.lineWidth=3; g.strokeStyle='#0a0a0a';
  g.beginPath(); g.moveTo(cx-nx*R*0.55,cy-ny*R*0.55); g.lineTo(cx+nx*R,cy+ny*R); g.stroke();
  g.beginPath(); g.moveTo(cx+nx*R,cy+ny*R);
  g.lineTo(cx+nx*R*0.72-ny*R*0.20, cy+ny*R*0.72+nx*R*0.20);
  g.lineTo(cx+nx*R*0.72+ny*R*0.20, cy+ny*R*0.72-nx*R*0.20);
  g.closePath(); g.fillStyle='#0a0a0a'; g.fill();
  g.font='700 17px ui-monospace,Menlo,monospace'; g.fillStyle='#0a0a0a';
  g.textAlign='center'; g.textBaseline='middle';
  g.fillText('N', cx+nx*(R+27), cy+ny*(R+27));
  g.textAlign='left'; g.textBaseline='alphabetic';
  /* caption */
  g.font='700 22px ui-monospace,Menlo,monospace';
  const cap=note;
  const cw=g.measureText(cap).width+22;
  g.fillStyle='rgba(255,255,255,0.93)'; g.fillRect(20,20,cw,38);
  g.strokeStyle='#0a0a0a'; g.lineWidth=1.4; g.strokeRect(20.5,20.5,cw-1,37);
  g.fillStyle='#0a0a0a'; g.fillText(cap,31,47);
  g.restore();
 };
}
"""

HIDE = """
 for(const s of ['.ledger','.hud','.qbtn','.zoom','.navhome','.legend','#resume'])
   document.querySelectorAll(s).forEach(e=>e.style.display='none');
"""

def upbear(rot): return (rot+45)%360
def name(b):
    b%=360
    names=[(0,'N'),(22.5,'NNE'),(45,'NE'),(67.5,'ENE'),(90,'E'),(112.5,'ESE'),(135,'SE'),
           (157.5,'SSE'),(180,'S'),(202.5,'SSW'),(225,'SW'),(247.5,'WSW'),(270,'W'),
           (292.5,'WNW'),(315,'NW'),(337.5,'NNW'),(360,'N')]
    return min(names,key=lambda n:abs(n[0]-b))[1]

def shoot(rots, year, step, prefix, focus=None):
    with sync_playwright() as p:
        b=p.chromium.launch()
        pg=b.new_page(viewport={"width":1440,"height":900})
        pg.goto(URL); pg.wait_for_timeout(3200)
        pg.evaluate("setState('watch',true);pause();dismissEntry();goTo(%d)"%year)
        pg.evaluate(HIDE)
        pg.wait_for_timeout(500)
        pg.evaluate("const _d=window.draw;window.draw=function(){_d();if(window.__OV)window.__OV();}")
        for r in rots:
            up=upbear(r)
            note=f"ROT {r}°  —  screen-up = {up:.0f}° {name(up)}"
            if r==210: note+="   [CURRENT]"
            pg.evaluate(OVERLAY, {"pts":LM,"rot":r,"note":note})
            js=f"setRot({r});fitCity(W,H);cam.step={step};ZEX=ZEX_BY_STEP[{step}];"
            if focus:
                js+=("const _m=toM(%r,%r);setCam(W,H,{ll:1,mx:_m[0],my:_m[1],mz:elevM(_m[0],_m[1])});"%focus)
            else:
                js+="setCam(W,H,null);"
            js+="tKey=tKeyA=cKey='';draw()"
            pg.evaluate(js)
            pg.wait_for_timeout(900)
            pg.locator("#stage").screenshot(path=f"{ROOT}orient/shots/{prefix}{r:03d}.png")
            print("shot", prefix, r)
        b.close()

if __name__=="__main__":
    mode=sys.argv[1] if len(sys.argv)>1 else "city"
    if mode=="city":
        shoot([30,75,120,165,210,255,300,315,345], 1955, 0, "o-city-")
    elif mode=="district":
        rots=[int(x) for x in sys.argv[2:]] or [210,300,315]
        # downtown / Market & the burned district
        shoot(rots, 1955, 1, "o-dist-", focus=(-122.4050,37.7880))
    elif mode=="district2":
        rots=[int(x) for x in sys.argv[2:]] or [210,300,315]
        shoot(rots, 1955, 1, "o-mission-", focus=(-122.4190,37.7600))
