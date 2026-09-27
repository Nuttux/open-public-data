"""BUILDINGS KIT v1 (27/09, assets_buildings): the ordinary building's typology and skin, called from gen_buildings.

Every switch is an env flag (default ON); BK=0 turns the whole kit off (the b27a88d91 generator exactly), for A/B
in one snapshot. Nothing here changes a footprint or a height: it changes what is drawn on them.

- BK_FIRE: the 1906 burned district (DataSF ff3a-iqhv via era.burned). A house the roll dates 1906 or before that
  stands inside it was built after the fire (the assessor's '1900' is a default for 'old'): an Edwardian flat
  (flat roof behind a bracketed cornice, bays stacked up the front), not a Queen Anne gable or an Italianate.
  SOURCED on where (the burn map), CONVENTION on the type. And a house of 1901-11 anywhere is of the Edwardian years
  (the generator drew Queen Annes up to 1911).
- BK_PAL: facade paint drawn from the 3,071 fronts MEASURED on registered KartaView street photos (bk_palette.py,
  CC BY-SA 4.0), matched on decade and type; saturated reds corrected for the render's light (RED_CAL: a red asked
  for renders pink, BAR 25/09).
- BK_CAP: a flat roof's coating wraps over its side and back parapets (their cap is the roof's own membrane), the
  street walls keep their cornice or coping: no light outline round every roof (game look).
- BK_SIDE: the side and back walls of a wood house: weathered brown shingle or plain boards as often as paint
  (North Beach / Telegraph Hill drone photos, refs/photos c_1124a23f95: reference only).
"""
import os, random, colorsys

def _on(k, d='1'): return os.environ.get('BK', '1') == '1' and os.environ.get(k, d) == '1'
FIRE = _on('BK_FIRE'); PAL = _on('BK_PAL'); CAP = _on('BK_CAP'); SIDE = _on('BK_SIDE')
print('[bk_kit] v1 FIRE', FIRE, 'PAL', PAL, 'CAP', CAP, 'SIDE', SIDE, flush=True)


# ── the burned district ─────────────────────────────────────────────────────
def fire_rebuilt(b, style, era):
    """True: a 'vic' by its record that the fire says went up after 1906"""
    if not FIRE or style != 'vic' or b.get('standin') or b.get('places'): return False
    y = b.get('year') or 0
    if era is not None and era < 1907: return False
    if y >= 1901: return True          # SF's Edwardian years (1901-14): the flats, not a Queen Anne gable
    try:
        import era as EA
        return EA.burned(b['cx'], b['cy'])
    except Exception as ex:
        print('[bk_kit] burned() failed', ex); return False


# ── paint from the measured street photos ───────────────────────────────────
_POOL = None
def _pool():
    global _POOL
    if _POOL is None:
        try:
            from bk_palette import KV
        except Exception as ex:
            print('[bk_kit] no palette', ex); KV = []
        _POOL = KV
    return _POOL


def red_cal(c):
    """a saturated red / maroon / brick paint renders pink under the city's light: G and B held down (linear), by
    how red and how saturated it is (famb.RED_CAL spirit, softer for a painted wall)"""
    h, l, s = colorsys.rgb_to_hls(*c)
    red = max(0.0, 1.0 - min(abs(h - 0.0), abs(h - 1.0)) / 0.075)       # hue within ~27 deg of red
    k = red * max(0.0, min(1.0, (s - 0.25) / 0.4))
    if k <= 0: return c
    lin = [v ** 2.2 for v in c]
    lin = [lin[0], lin[1] * (1 - 0.30 * k), lin[2] * (1 - 0.38 * k)]
    return tuple(v ** (1 / 2.2) for v in lin)


def paint(b, style, sub):
    """(body, trim) from the measured pool, or None"""
    if not PAL or style not in ('vic', 'stucco', 'midcentury'): return None
    P = _pool()
    if not P: return None
    y = (b.get('year') or 1920) // 10 * 10
    t = (b.get('ty') or '').upper()
    grp = 'apt' if t in ('APARTMENT', 'FLATS') else ('house' if t == 'HOUSE' else 'other')
    r = random.Random(b['gid'] * 4099 + 71)
    for dy, gg in ((0, True), (10, True), (10, False), (30, False), (99, False)):
        cand = [p for p in P if abs(p[0] - y) <= dy and (not gg or p[1] == grp)]
        if len(cand) >= 12: break
    if not cand: return None
    _, _, body, trim = r.choice(cand)
    return red_cal(photo_to_paint(tuple(body))), tuple(trim)


PAL2 = _on('BK_PAL2')
def photo_to_paint(c):
    """(BK_PAL2) a colour measured on a street photo is the paint under that photo's light: shade and a warm or
    magenta white balance. Lift it to a paint (L 0.38 -> 0.57, 0.76 -> 0.85) and take the tint out of the low-
    saturation warm-pinks and violets (they rendered mauve); real hues (blue, green, yellow, tan, red) kept"""
    if not PAL2: return c
    h, l, s = colorsys.rgb_to_hls(*c)
    l = min(0.95, 0.30 + 0.72 * l)
    if (h < 0.06 or h > 0.72) and s < 0.30: s *= 0.35
    elif 0.72 < h < 0.93: s *= 0.4
    return colorsys.hls_to_rgb(h, l, s)


# ── side and back walls of a wood house ─────────────────────────────────────
SHINGLE_BROWN = ((0.46, 0.37, 0.29), (0.52, 0.43, 0.34), (0.40, 0.33, 0.27), (0.56, 0.49, 0.41))
PLAIN = ((0.84, 0.82, 0.78), (0.78, 0.77, 0.74), (0.88, 0.87, 0.84), (0.72, 0.71, 0.68))
def side_walls(b, style, wall_mat, fam):
    """(side, back) wall (mat, colour) or None to keep the generator's own"""
    if not SIDE or style not in ('vic', 'stucco'): return None
    r = random.Random(b['gid'] * 8191 + 17); x = r.random()
    if wall_mat == 'siding' or (style == 'vic' and x < 0.5):
        if x < 0.40: s = ('siding', r.choice(SHINGLE_BROWN))
        elif x < 0.65: s = ('stucco', r.choice(PLAIN))
        else: return None
    else:
        if x < 0.35: s = ('stucco', r.choice(PLAIN))
        elif x < 0.45: s = ('siding', r.choice(SHINGLE_BROWN))
        else: return None
    back = s if r.random() < 0.6 else (s[0], r.choice(PLAIN))
    return s, back


# ── BK_MASS: the roof massing measured by the LiDAR (bk_massing.json, assets_buildings/tools/lidar_parts.py) ─────────
# A footprint whose returns show a lower rear wing, a stepped back, or a light well open to the ground is drawn as its
# parts: each part the same building (gid, paint, style), its height the record's less the measured drop (the main part
# keeps the record's height exactly), the wells cut out. USGS 3DEP CA_SanFrancisco_1_B23 (public domain). Today only.
MASS = _on('BK_MASS')
_MS = None
def _mass():
    global _MS
    if _MS is None:
        import json
        p = os.environ.get('BK_MASS_FILE') or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bk_massing.json')
        _MS = json.load(open(p)) if (MASS and os.path.exists(p)) else {}
        print('[bk_kit] massing', p, len(_MS), flush=True)
    return _MS


def parts_of(b, ground, style, era):
    """the sub-records of a measured building, or None"""
    if not MASS or era is not None or b.get('_bkpart') or b.get('standin') or b.get('places') or b.get('rise') is not None: return None
    m = _mass().get(str(b['gid']))
    if not m: return None
    zs = [ground(x, y) for x, y in b['ring']]; zg = sum(zs) / len(zs)
    out = []
    for k, p in enumerate(m['parts']):
        h = b['h'] - p['d']
        if h < 2.6: continue
        r = [tuple(q) for q in p['ring']]
        st = max(1, round((b.get('st') or max(1, round(b['h'] / 3.2))) * h / max(b['h'], 1.0)))
        out.append(dict(b, ring=r, roles=list(p['roles']), h=h, st=st, _bkpart=k + 1, _zg=zg, _style=style,
                        _rear=not any(q == 1 for q in p['roles']), cx=sum(q[0] for q in r) / len(r), cy=sum(q[1] for q in r) / len(r)))
    return out or None


# ── BK_ROOFMAT: the flat roof's membrane patched in sheets (hq_scene.roof_flat_mat) ─────────────────────────────────
ROOFMAT = _on('BK_ROOFMAT')
