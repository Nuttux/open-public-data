"""Ground truth: where does each landmark actually land, through the real proj()?

Runs against a FROZEN copy of the built page (orient/mock-o.html) so the other
agent's rebuilds cannot move the answer under us. Nothing here writes to gen/.
"""
import json, sys
from playwright.sync_api import sync_playwright

ROOT = "/Users/daniel/code/open-public-data/scratchpad/sf-city-anim/"
URL  = "http://127.0.0.1:8791/orient/mock-o.html"

# lon, lat. Public coordinates, rounded to ~10 m.
PTS = [
    ("Golden Gate Bridge (S tower)", -122.4783, 37.8100),
    ("Ferry Building",               -122.3937, 37.7955),
    ("Bay Bridge (W anchorage)",     -122.3860, 37.7910),
    ("Coit Tower",                   -122.4058, 37.8024),
    ("Twin Peaks",                   -122.4477, 37.7544),
    ("Ocean Beach (mid)",            -122.5100, 37.7600),
    ("Candlestick Point",            -122.3860, 37.7130),
    ("Hunters Point",                -122.3730, 37.7300),
    ("Lake Merced",                  -122.4900, 37.7280),
    ("Civic Center",                 -122.4194, 37.7793),
    ("Cliff House",                  -122.5136, 37.7787),
    ("Sunset (Judah & 30th)",        -122.4940, 37.7610),
]

JS = r"""
(pts)=>{
  const out=[];
  for(const [n,lo,la] of pts){
    const m=toM(lo,la);
    const z=elevM(m[0],m[1]);
    const p=proj(m[0],m[1],z);
    out.push({n, mx:m[0], my:m[1], z, px:p[0], py:p[1],
              sx:SX(p,W), sy:SY(p,H), depth:depth(m[0],m[1])});
  }
  // which compass direction is SCREEN-UP / SCREEN-RIGHT at this bearing?
  // world +x = east, world +y = north (toM). Probe the projection directly.
  const o=proj(0,0,0), e=proj(1,0,0), nn=proj(0,1,0);
  // screen delta for a unit step east / north (SY flips the sign of py)
  const E=[e[0]-o[0], -(e[1]-o[1])], Nn=[nn[0]-o[0], -(nn[1]-o[1])];
  // solve for the world vector that maps to screen up (0,-1) and right (1,0)
  const det=E[0]*Nn[1]-E[1]*Nn[0];
  const inv=(sx,sy)=>[( sy*Nn[0]*-1 + sx*Nn[1])/det, ( sx*-E[1] + sy*E[0])/det];
  const up=inv(0,-1), rt=inv(1,0);
  const bear=(v)=>{let b=Math.atan2(v[0],v[1])*180/Math.PI; return (b+360)%360;};
  return {pts:out, W, H, rot:ROT*180/Math.PI, step:cam.step,
          upBearing:bear(up), rightBearing:bear(rt),
          camW:W, ledger:288};
}
"""

def run(rots, year=1936):
    res={}
    with sync_playwright() as p:
        b=p.chromium.launch()
        pg=b.new_page(viewport={"width":1440,"height":900})
        pg.goto(URL); pg.wait_for_timeout(3000)
        pg.evaluate("setState('watch',true);pause();dismissEntry();goTo(%d)"%year)
        pg.wait_for_timeout(400)
        for r in rots:
            pg.evaluate(f"setRot({r});fitCity(W,H);setCam(W,H,null);tKey=tKeyA=cKey='';draw()")
            pg.wait_for_timeout(500)
            res[r]=pg.evaluate(JS, PTS)
        b.close()
    return res

if __name__=="__main__":
    rots=[int(x) for x in (sys.argv[1:] or ["210"])]
    r=run(rots)
    json.dump(r, open(ROOT+"orient/truth.json","w"), indent=1)
    for rot,d in r.items():
        print(f"\n=== ROT {rot}deg  (screen-up = compass {d['upBearing']:.1f}deg, "
              f"screen-right = compass {d['rightBearing']:.1f}deg) ===")
        print(f"{'landmark':30s} {'sx':>7s} {'sy':>7s}  {'x/W':>5s} {'y/H':>5s}  quadrant")
        for q in sorted(d['pts'], key=lambda a:a['sy']):
            fx=q['sx']/d['W']; fy=q['sy']/d['H']
            vert = "top" if fy<0.34 else ("mid" if fy<0.67 else "BOTTOM")
            horz = "left" if fx<0.34 else ("centre" if fx<0.67 else "right")
            print(f"{q['n']:30s} {q['sx']:7.0f} {q['sy']:7.0f}  {fx:5.2f} {fy:5.2f}  {vert}-{horz}")
