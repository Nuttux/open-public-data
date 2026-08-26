"""The value spread of the in-band roof step, at four amplitudes, same frame.
ART-SPEC 7.5 / colourLUT's own note: 'a few per cent of value between
neighbours is invisible', which is why the three roof tones already run ~30 %
apart. This is the same question asked of the step INSIDE one of them."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL="http://127.0.0.1:8787/roofs/mock-roofs.html"
S=dict(mx=-5282,my=-1781,mz=25) if (len(sys.argv)<2 or sys.argv[1]=="sunset") else dict(mx=3258,my=3562,mz=8)
NAME=sys.argv[1] if len(sys.argv)>1 else "sunset"
SETS=[("flat (off)",None),
      ("+-8%",[0.925,0.975,1.025,1.080]),
      ("+-14%",[0.875,0.958,1.042,1.140]),
      ("+-20%",[0.825,0.940,1.060,1.200])]
BOX=(420,120,900,440)
async def main():
    async with async_playwright() as p:
        br=await p.chromium.launch(); pg=await br.new_page(viewport={"width":1440,"height":940})
        await pg.goto(URL,wait_until="networkidle"); await pg.wait_for_timeout(2600)
        await pg.evaluate("if(window.FILM&&FILM.on)FILM.exit();setState('watch',true);dismissEntry();pause();goTo(2018)")
        f=json.dumps({**S,"ll":1}); ims=[]
        for lab,v in SETS:
            await pg.evaluate("(v=>{if(v){for(let i=0;i<4;i++)RSHADE[i]=v[i];ROOFSapply({tone:1});}"
                              "else ROOFSapply({tone:0});})(%s)"%json.dumps(v))
            await pg.evaluate(f"""(()=>{{NAV.cancel&&NAV.cancel();applyZoom(2,{f});
              cam.scale=(cam.maxScale?cam.maxScale():2.0);cam.clamp(innerWidth,innerHeight,288);
              if(window.NAV&&NAV.invalidate)NAV.invalidate();
              try{{tKey=tKeyA=cKey="";}}catch(e){{}} draw();}})()""")
            await pg.wait_for_timeout(600)
            p2=os.path.join(ROOT,"shots","_f2t-%s.png"%lab.replace("%","").replace(" ","").replace("(","").replace(")",""))
            await pg.locator("#scenewrap").screenshot(path=p2); ims.append((lab,p2))
        await br.close()
    I=[(l,Image.open(p2).convert("RGB").crop(BOX)) for l,p2 in ims]
    w,h=I[0][1].size
    out=Image.new("RGB",(2*w,2*(h+16)),(15,15,15)); d=ImageDraw.Draw(out)
    for k,(l,im) in enumerate(I):
        x,y=(k%2)*w,(k//2)*(h+16); out.paste(im,(x,y+14)); d.text((x+4,y+2),l,fill=(255,225,140))
    o=os.path.join(ROOT,"shots","f2-tonelab-%s.png"%NAME); out.save(o); print("wrote",o)
asyncio.run(main())
