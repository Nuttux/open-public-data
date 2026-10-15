"""wh/scan.py: 1/4-scale arrays of the sc block (render L, roof mask, painted L/RGB) for the warehouse search."""
import sys, os, numpy as np
sys.path.insert(0, '/Volumes/QIPU-SSD/qipu-render-work/combo/vancouver/lmk')
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
from lib import T
B = '/Volumes/QIPU-SSD/qipu-render-work/combo/vancouver/work_ct_sc/blk'; OX, OY = 75264, 53760
X0, Y0, X1, Y1 = 76800, 55296, 112640, 76800; S = 4
W, H = (X1 - X0) // S, (Y1 - Y0) // S
# painted at 1/4
P = np.zeros((H, W, 3), np.uint8)
for tx in range(X0 // 512, X1 // 512):
    for ty in range(Y0 // 512, Y1 // 512):
        p = f'{T}/{tx}/{ty}.webp'
        if os.path.exists(p):
            a = Image.open(p).convert('RGB').resize((128, 128), Image.BOX); x = (tx * 512 - X0) // S; y = (ty * 512 - Y0) // S
            if 0 <= x < W - 127 and 0 <= y < H - 127: P[y:y + 128, x:x + 128] = np.asarray(a)
R = Image.open(f'{B}/R.jpg').crop((X0 - OX, Y0 - OY, X1 - OX, Y1 - OY)).resize((W, H), Image.BOX); Rn = np.asarray(R)
C = Image.open(f'{B}/R.class.png').crop((X0 - OX, Y0 - OY, X1 - OX, Y1 - OY)).resize((W, H), Image.NEAREST); Cn = np.asarray(C)
np.savez('/Volumes/QIPU-SSD/qipu-render-work/combo/vancouver/lmk/wh/q4.npz', P=P, R=Rn, C=Cn)
print(P.shape)
