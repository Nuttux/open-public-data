import sys, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
x0, x1, y0, y1 = map(int, sys.argv[1].split(','))       # canvas box (frame 5:2 coords = canvas since frame 5:2 origin 0,0)
def score(a):             # the strongest column jump: mean |I[x] - I[x-1]| over rows vs the median column jump
    a = a.astype(np.float32); d = np.abs(a[:, 1:] - a[:, :-1]).mean((0, 2)); k = int(d.argmax()); return k + x0 + 1, round(float(d[k] / (np.median(d) + 1e-3)), 1)
E = '/Volumes/DANI-SD-DRIVE2/transitions'
for y in ('1938', '1959', '1985', '2006'):
    im = Image.open(f'{E}/ek2/{y}/m_5_2.jpg').crop((x0, y0, x1, y1)); print('ek2', y, score(np.asarray(im)))
    cv = np.asarray(Image.open(f'{E}/ek2/{y}/cov_5_2.png').crop((x0, y0, x1, y1))) > 0; print('   cov', cv.mean().round(3))
print('now', score(np.asarray(Image.open('/Volumes/DANI-SD-DRIVE2/qipu-eras/fin3/now_m_5_2.png').convert('RGB').crop((x0, y0, x1, y1)))))
for y in ('1938', '1959', '1985', '2006'):
    K = np.load(f'{E}/emb2/K_{y}.npy', mmap_mode='r'); print('K*', y, score(np.asarray(K[y0 - 3500:y1 - 3500, x0 - 6560:x1 - 6560])))
