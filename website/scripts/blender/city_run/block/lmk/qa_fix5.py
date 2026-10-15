import sys, json, os
from lib import *
H=os.path.dirname(os.path.abspath(__file__))
def comp(x0,y0,x1,y1,names):
    cur=np.asarray(tiles(x0,y0,x1,y1)).astype(np.float32); out=cur.copy()
    for n in names:
        d=f'{H}/patches/{n}'; cx0,cy0,cx1,cy1=json.load(open(f'{d}/canvas.json'))['canvas']
        P=np.asarray(Image.open(f'{d}/patch.png').convert('RGB')).astype(np.float32); A=np.asarray(Image.open(f'{d}/alpha.png')).astype(np.float32)[...,None]/255
        ix0,iy0,ix1,iy1=max(x0,cx0),max(y0,cy0),min(x1,cx1),min(y1,cy1)
        if ix1<=ix0 or iy1<=iy0: continue
        a=A[iy0-cy0:iy1-cy0,ix0-cx0:ix1-cx0]; p=P[iy0-cy0:iy1-cy0,ix0-cx0:ix1-cx0]; o=out[iy0-y0:iy1-y0,ix0-x0:ix1-x0]; out[iy0-y0:iy1-y0,ix0-x0:ix1-x0]=o*(1-a)+p*a
    return cur.astype(np.uint8),out.clip(0,255).astype(np.uint8)
def save(name,box,names,scale=1.0):
    b,a=comp(*box,names); w,h=b.shape[1],b.shape[0]; sb=Image.new('RGB',(w,h*2+10),'white'); sb.paste(Image.fromarray(b),(0,0)); sb.paste(Image.fromarray(a),(0,h+10))
    if scale!=1: sb=sb.resize((int(sb.width*scale),int(sb.height*scale)))
    sb.save(f'{H}/qa/{name}.jpg',quality=90)
if __name__=='__main__':
    R=[f'fix5_river_0{i}' for i in range(4)]
    save('fix5_river_zoom',(88000,73500,92000,75600),R,0.4)
    save('fix5_river_native_a',(88900,74800,90100,75500),R)
    save('fix5_river_native_b',(100000,73500,101400,74300),R)
    save('fix5_river_native_c',(80000,72300,81400,73100),R)
    save('fix5_river_overview',(78000,71500,112000,76800),R,0.06)
