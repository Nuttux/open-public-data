"""python3 veg_preview.py out.png [name ...] — the tree kit drawn outside
Blender, as the city camera sees it (29° above the horizon, looking north, sun
from 215° at 24°), at the pyramid's 37.4 cm/px and 4x that, with each proto's
faces. A crude painter's-algorithm shading: for silhouettes, sizes and colours
before a render slot, not a substitute for one."""
import sys, math, os
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import veg_protos as VP
from veg_geom import triangulate

E = math.radians(29.0); SE_, CE_ = math.sin(E), math.cos(E)
A, EL = math.radians(215), math.radians(24)
SUN = np.array([math.sin(A) * math.cos(EL), math.cos(A) * math.cos(EL), math.sin(EL)])
VIEW = np.array([0.0, CE_, -SE_])        # from the camera into the scene


def ramp_rgb(name, c):
    r = VP.RAMPS[name]; lin = [np.array(VP.hex_lin(h)) for h in r]
    xs = [0.0, VP.BARK_HI, VP.LEAF_LO, VP.LEAF_HI, 0.88, 1.0]; cols = [lin[0], lin[1], lin[2], lin[3], lin[4], lin[4]]
    return np.stack([np.interp(c, xs, [col[i] for col in cols]) for i in range(3)], -1)


def draw(mesh, ramp, ppm, rot=0.0):
    V, F, C = mesh.arrays()
    ca, sa = math.cos(rot), math.sin(rot)
    V = V @ np.array([[ca, sa, 0], [-sa, ca, 0], [0, 0, 1]])
    T = triangulate(F)
    P = V[T]                                            # (t, 3, 3)
    n = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0]); n /= np.linalg.norm(n, axis=1)[:, None] + 1e-12
    n[(n @ VIEW) > 0] *= -1                             # two-sided: face the camera
    lam = np.clip(n @ SUN, 0, None)
    alb = ramp_rgb(ramp, C[T].mean(1))
    # sun (warm) + sky (cool), then a plain display transform
    lit = alb * (lam[:, None] * np.array([1.0, 0.8, 0.58]) * 2.2 + np.array([0.30, 0.36, 0.45]) * 0.9)
    srgb = np.clip(lit, 0, 1) ** (1 / 2.2)
    depth = (P.mean(1) @ VIEW)
    sx = P[..., 0] * ppm; sy = -(P[..., 1] * SE_ + P[..., 2] * CE_) * ppm
    x0, x1 = sx.min() - 4, sx.max() + 4; y0, y1 = sy.min() - 4, sy.max() + 4
    im = Image.new('RGB', (int(x1 - x0) + 1, int(y1 - y0) + 1), (222, 214, 196)); d = ImageDraw.Draw(im)
    for i in np.argsort(-depth):
        d.polygon([(sx[i, k] - x0, sy[i, k] - y0) for k in range(3)], fill=tuple(int(v * 255) for v in srgb[i]))
    return im


if __name__ == '__main__':
    out = sys.argv[1]; names = sys.argv[2:]
    K = VP.kit(); names = names or list(K)
    PPM = 1 / 0.374
    tiles = []
    for nm in names:
        b, ramp, tall, hmax = K[nm]; M = b()
        V, F, C = M.arrays(); w = max(np.ptp(V[:, 0]), np.ptp(V[:, 1])); h = V[:, 2].max()
        big = draw(M, ramp, PPM * 4 * 3)              # 4x, drawn at 3x and reduced (antialias)
        big = big.resize((big.width // 3, big.height // 3), Image.LANCZOS)
        nat = draw(M, ramp, PPM * 4).resize((0, 0) if False else (max(1, big.width // 4), max(1, big.height // 4)), Image.LANCZOS)
        tiles.append((f'{nm} {len(F)}f w{w:.0f} h{h:.0f}', big, nat))
    W = sum(t[1].width for t in tiles) + 20 * len(tiles); H = max(t[1].height for t in tiles) + max(t[2].height for t in tiles) + 60
    S = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(S); x = 0
    for lab, big, nat in tiles:
        d.text((x + 2, 2), lab, fill=(0, 0, 0))
        S.paste(big, (x, 16)); S.paste(nat, (x, 30 + max(t[1].height for t in tiles)))
        x += big.width + 20
    S.save(out); print(out, S.size)
