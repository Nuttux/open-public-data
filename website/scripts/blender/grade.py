"""Post grade applied to every render (tiles, overviews, sheets, film).
python3 grade.py in.png out.png [fine_sharpen=40] [broad_sharpen=12]

Look B, chosen by Daniel on 24/09 over the old cool grade: a neutral white
balance (a touch warm), the blue sky-fill pulled out of the shadows, no
cool-shadow/warm-highlight split, saturation 1.08 with lilac/violet hues
softened (x0.7). Then a gentle S-curve, a soft bloom on the brightest
highlights, and local contrast. No haze, no vignette: the frame stays crisp
and tile-able. (color/grade2.py holds the variants A-D.)"""
import sys
import numpy as np
from PIL import Image, ImageFilter
WB = np.array([1.03, 1.0, 0.95]); SHADOW_NEUTRAL = 0.6; SAT = 1.08; PURPLE_SAT = 0.7; S = 0.22
im = Image.open(sys.argv[1]).convert('RGB')
x = np.asarray(im, dtype=np.float32) / 255 * WB
lum = (x * [0.2126, 0.7152, 0.0722]).sum(-1, keepdims=True)
sh = np.clip(1 - lum / 0.45, 0, 1) * SHADOW_NEUTRAL                   # the cool cast out of the shadows
cool = np.clip((x - lum)[..., 2:3] - (x - lum)[..., 0:1], 0, None)
x = x - sh * cool * np.array([-0.35, 0.05, 0.65])
x = x * (1 - S) + S * (3 * x * x - 2 * x ** 3)                         # S-curve
lum = (x * [0.2126, 0.7152, 0.0722]).sum(-1, keepdims=True)
r, g, b = x[..., 0], x[..., 1], x[..., 2]
mx = x.max(-1); d = mx - x.min(-1) + 1e-6
hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
purple = np.exp(-((hue - 275) / 30) ** 2)[..., None]
x = lum + (x - lum) * SAT * (1 + (PURPLE_SAT - 1) * purple)          # saturation, lilacs softened
hi = np.clip((x - 0.82) / 0.18, 0, 1)
blur = np.asarray(Image.fromarray((hi * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(max(2, im.width // 240))), dtype=np.float32) / 255
x = x + blur * np.array([1.0, 0.92, 0.80]) * 0.10                    # bloom
out = Image.fromarray((np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8))
out = out.filter(ImageFilter.UnsharpMask(radius=max(1, im.width // 1200), percent=int(sys.argv[3]) if len(sys.argv) > 3 else 60, threshold=2))
out = out.filter(ImageFilter.UnsharpMask(radius=max(8, im.width // 150), percent=int(sys.argv[4]) if len(sys.argv) > 4 else 18, threshold=0))
out.save(sys.argv[2])
