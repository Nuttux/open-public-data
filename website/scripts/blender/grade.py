"""Post grade applied to every render: a gentle S-curve, a little more colour,
cool shadows / warm highlights, and a soft bloom on the brightest highlights
(sun on glass and water). No haze, no vignette: the frame stays crisp and
tile-able. usage: python3 grade.py in.png out.png"""
import sys
import numpy as np
from PIL import Image, ImageFilter
im = Image.open(sys.argv[1]).convert('RGB')
x = np.asarray(im, dtype=np.float32) / 255
k = 0.22
x = x * (1 - k) + k * (3 * x * x - 2 * x ** 3)                       # S-curve
lum = (x * [0.2126, 0.7152, 0.0722]).sum(-1, keepdims=True)
x = lum + (x - lum) * 1.14                                           # saturation
x = x + (1 - lum) * np.array([-0.010, 0.000, 0.012]) + lum * np.array([0.014, 0.006, -0.010])
hi = np.clip((x - 0.82) / 0.18, 0, 1)
blur = np.asarray(Image.fromarray((hi * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(max(2, im.width // 240))), dtype=np.float32) / 255
x = x + blur * np.array([1.0, 0.92, 0.80]) * 0.10                    # bloom
# local contrast: an unsharp mask at ~1/1200 of the width (fine detail) and a
# broad one at ~1/150 (clarity) — the crispness of a game capture, no halo
out = Image.fromarray((np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8))
out = out.filter(ImageFilter.UnsharpMask(radius=max(1, im.width // 1200), percent=int(sys.argv[3]) if len(sys.argv) > 3 else 60, threshold=2))
out = out.filter(ImageFilter.UnsharpMask(radius=max(8, im.width // 150), percent=int(sys.argv[4]) if len(sys.argv) > 4 else 18, threshold=0))
out.save(sys.argv[2])
