import os, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
B='/Volumes/QIPU-SSD/qipu-render-work/combo/vancouver/work_ct_dt/blk'
OX,OY=75264,29184
T='/Users/daniel/code/qipu-render-work/cloud/ckpt_van_city_today/tiles/9'
def tiles(x0,y0,x1,y1,root=T):
    im=Image.new('RGB',(x1-x0,y1-y0),(255,0,255))
    for tx in range(x0//512,(x1-1)//512+1):
        for ty in range(y0//512,(y1-1)//512+1):
            p=f'{root}/{tx}/{ty}.webp'
            if os.path.exists(p): im.paste(Image.open(p).convert('RGB'),(tx*512-x0,ty*512-y0))
    return im
def blk(name,x0,y0,x1,y1):
    return Image.open(f'{B}/{name}').crop((x0-OX,y0-OY,x1-OX,y1-OY))
