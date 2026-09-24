"""Post grade applied to every render (tiles, overviews, sheets, film).
python3 grade.py in.png out.png [fine_sharpen=40] [broad_sharpen=12] [key=val …]

Look B, chosen by Daniel on 24/09 over the old cool grade: a neutral white
balance (a touch warm), the blue sky-fill pulled out of the shadows, no
cool-shadow/warm-highlight split, saturation 1.08 with lilac/violet hues
softened (x0.7). Then a gentle S-curve, a soft bloom on the brightest
highlights, and local contrast. No haze, no vignette: the frame stays crisp
and tile-able. (color/grade2.py holds the variants A-D.)

Options for the global look pass (24/09 evening; all OFF by default, look B
is unchanged without them), as key=val arguments after the positionals:
  wb=r/g/b  shn=  sat=  purple=  s=     override look B's constants
  black=    black point: (x - b) / (1 - b), deeper shadows
  shsat=    extra saturation in the shadows, (1 - lum)-weighted: rich, not grey
  green= water= beige=   saturation gain per hue band (110°, 195°, 35°)
  chroma=   colour local contrast: each pixel's chroma pushed away from its
            neighbourhood's (radius width/300) — neighbours stop sharing one beige
  clarity=  luminance local contrast at a large radius (width/clarity_r, default
            80), midtone-masked so skies and deep shadows do not halo
  split=    warm/cool colour script: warm highlights, teal (never violet) shadows
  bloom= bloom_t=   bloom amount (0.10) and threshold (0.82)"""
import sys
import numpy as np
from PIL import Image, ImageFilter
_pos = [a for a in sys.argv[1:] if '=' not in a]; O = dict(a.split('=', 1) for a in sys.argv[1:] if '=' in a)
def o(k, d): return float(O[k]) if k in O else d
WB = np.array([float(v) for v in O['wb'].split('/')]) if 'wb' in O else np.array([1.03, 1.0, 0.95])
SHADOW_NEUTRAL = o('shn', 0.6); SAT = o('sat', 1.08); PURPLE_SAT = o('purple', 0.7); S = o('s', 0.22)
LW = np.array([0.2126, 0.7152, 0.0722])
def blur(a, r):   # float HxWxC gaussian blur (sigma r, like PIL's radius); scipy only when an option needs it
    from scipy.ndimage import gaussian_filter
    return gaussian_filter(a, sigma=(r, r, 0), mode='nearest')
im = Image.open(_pos[0]).convert('RGB')
x = np.asarray(im, dtype=np.float32) / 255 * WB
if 'black' in O: x = np.clip((x - o('black', 0)) / (1 - o('black', 0)), 0, None)
lum = (x * LW).sum(-1, keepdims=True)
sh = np.clip(1 - lum / 0.45, 0, 1) * SHADOW_NEUTRAL                   # the cool cast out of the shadows
cool = np.clip((x - lum)[..., 2:3] - (x - lum)[..., 0:1], 0, None)
x = x - sh * cool * np.array([-0.35, 0.05, 0.65])
if 'clarity' in O:   # large-radius local contrast on luminance, midtones only
    lum = (x * LW).sum(-1, keepdims=True); lb = blur(lum, max(4, im.width / o('clarity_r', 80)))
    m = np.clip(1 - np.abs(lum - 0.45) / 0.45, 0, 1) ** 0.7
    x = x * np.clip((lum + (lum - lb) * o('clarity', 0) * m) / np.maximum(lum, 1e-4), 0, 3)
x = x * (1 - S) + S * (3 * x * x - 2 * x ** 3)                         # S-curve
lum = (x * LW).sum(-1, keepdims=True)
r, g, b = x[..., 0], x[..., 1], x[..., 2]
mx = x.max(-1); d = mx - x.min(-1) + 1e-6
hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
purple = np.exp(-((hue - 275) / 30) ** 2)[..., None]
x = lum + (x - lum) * SAT * (1 + (PURPLE_SAT - 1) * purple)          # saturation, lilacs softened
if any(k in O for k in ('green', 'water', 'beige', 'shsat')):
    def band(h0, w): return np.exp(-(((hue - h0 + 180) % 360 - 180) / w) ** 2)[..., None]
    gain = 1 + (o('green', 1) - 1) * band(110, 35) + (o('water', 1) - 1) * band(195, 30) + (o('beige', 1) - 1) * band(35, 18)
    gain = gain * (1 + (o('shsat', 1) - 1) * np.clip(1 - lum / 0.5, 0, 1))
    x = lum + (x - lum) * gain
if 'chroma' in O:   # neighbours stop sharing one beige: chroma local contrast
    lum = (x * LW).sum(-1, keepdims=True); c = x - lum; cb = blur(c, max(2, im.width / 300))
    x = lum + cb + (c - cb) * (1 + o('chroma', 0))
if 'split' in O:     # warm light, teal shade (red down, green and blue up together: never violet)
    lum = (x * LW).sum(-1, keepdims=True); k_ = o('split', 0)
    x = x + k_ * np.clip((lum - 0.55) / 0.45, 0, 1) * np.array([0.06, 0.015, -0.05]) \
          + k_ * np.clip(1 - lum / 0.35, 0, 1) * np.array([-0.03, 0.012, 0.02])
BT = o('bloom_t', 0.82)
hi = np.clip((x - BT) / (1 - BT), 0, 1)
bl_ = np.asarray(Image.fromarray((hi * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(max(2, im.width // 240))), dtype=np.float32) / 255
x = x + bl_ * np.array([1.0, 0.92, 0.80]) * o('bloom', 0.10)          # bloom
out = Image.fromarray((np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8))
out = out.filter(ImageFilter.UnsharpMask(radius=max(1, im.width // 1200), percent=int(_pos[2]) if len(_pos) > 2 else 60, threshold=2))
out = out.filter(ImageFilter.UnsharpMask(radius=max(8, im.width // 150), percent=int(_pos[3]) if len(_pos) > 3 else 18, threshold=0))
out.save(_pos[1])
