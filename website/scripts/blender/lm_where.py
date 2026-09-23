"""Where a world point lands in the site's tile pyramid (plain python3): the
level-7 frame (i, j) and the pixel in that 5120 x 3072 frame, and the
BORDER hq_city.py takes to render just a crop of it at the pass's own scale
(the landmarks agent's look tests: the landmark exactly as the pass will
draw it, 37 cm a pixel, for a few seconds of GPU).

python3 lm_where.py x y [z] [w h]      -> frame, pixel, BORDER=... (w x h px crop)
python3 lm_where.py <landmark key> [w h]
The geometry is hq_city.py's PYRAMID MODE, exactly."""
import math, sys

CA_ = math.cos(math.radians(30)); SA_ = 0.42
KX = math.sqrt(2) * CA_; KY = math.sqrt(2) * SA_; ZT = math.sqrt(2 * (CA_ ** 2 - SA_ ** 2))
REF = dict(cx=241.427019126574, cy=707.0567508859249, scale=2 ** (round(math.log2(0.06898352692062097) * 24) / 24))
FW, FH = 5120, 3072

def where(x, y, z=0.0, Z=7):
    f = 2 ** (Z - 3); sz = REF['scale'] * f; cw, ch = round(2560 * f), round(1536 * f)
    px, py = KX * x, KY * y + ZT * z
    ccx = (px - REF['cx']) * sz + cw / 4; ccy = (REF['cy'] - py) * sz + ch / 4
    i, j = int(ccx // (FW / 2)), int(ccy // (FH / 2))
    u, v = (ccx - i * FW / 2) * 2, (ccy - j * FH / 2) * 2
    return i, j, u, v

def border(u, v, w=1200, h=800):
    u0 = min(max(u - w / 2, 0), FW - w); v0 = min(max(v - h / 2, 0), FH - h)
    # hq_city's BORDER: fractions, x then y from the BOTTOM
    return f'{u0 / FW:.4f},{(u0 + w) / FW:.4f},{1 - (v0 + h) / FH:.4f},{1 - v0 / FH:.4f}'

SPOTS = {   # world x, y (footprints.json centroids, lm_bridges / lm_civic constants), a height to aim at (m)
    'goldengate': (-3570.0, 6650.0, 70.0), 'gg_south': (-3510.8, 6012.8, 110.0), 'fortpoint': (-3439.0, 5631.0, 10.0),
    'baybridge': (5290.0, 4250.0, 60.0), 'bay_w2': (4592.0, 3423.4, 80.0),
    'cityhall': (1647.0, 2151.0, 30.0), 'coit': (2830.0, 4717.0, 90.0), 'pofa': (-915.0, 4778.0, 20.0),
    'ferry': (3929.0, 3953.0, 15.0), 'salesforce': (3612.0, 3315.0, 150.0), 'transamerica': (3111.0, 3917.0, 100.0),
    'oracle': (4242.0, 2074.0, 20.0), 'chase': (4443.0, 882.0, 20.0), 'sutro': (-1306.8, -529.5, 350.0),
    'grace': (2147.0, 3544.0, 90.0), 'stmarys': (1119.0, 2669.0, 60.0), 'conservatory': (-1952.0, 1401.0, 30.0),
    'deyoung': (-2721.0, 1251.0, 30.0), 'legion': (-5529.0, 2730.0, 90.0), 'calacademy': (-2475.0, 1097.0, 30.0),
    'alcatraz': (1305.0, 7425.0, 30.0), 'lombard': (1689.0, 4687.0, 60.0), 'twinpeaks': (-1150.0, -700.0, 250.0),
}

if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] in SPOTS:
        x, y, z = SPOTS[a[0]]; rest = a[1:]
    else:
        x, y = float(a[0]), float(a[1]); z = float(a[2]) if len(a) > 2 else 0.0; rest = a[3:]
    w, h = (int(rest[0]), int(rest[1])) if len(rest) >= 2 else (1200, 800)
    i, j, u, v = where(x, y, z)
    print(f'frame {i}:{j}  pixel {u:.0f},{v:.0f}  BORDER={border(u, v, w, h)}')
