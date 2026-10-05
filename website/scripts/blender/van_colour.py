"""VAN_COLOUR: another city's own wall / trim / roof / glass colours (Vancouver first), in place of San Francisco's
palettes (STUCCO, VIC, BLOCK, NEUTRAL, the Painted-Lady and fronts tables), which made Vancouver read as California.

Plain Python (no bpy): gen_buildings calls it from three hook points, only when CITY != sf (SF never imports it):
  H1 walls   building(), just before `ctx = dict(...)`: wall material, body, trim, accent, tower glass
  H2 pitched building(), after `roof_colour()`, before `measured_pitched()` (a measured roof still wins)
  H3 flat    building(), after `flat_roof()`,   before `measured_flat()`    (idem)
Per-building measured roofs (the 2025 ortho, van_roof_ortho.py) go through gen_buildings' own ROOFS=1 / ROOFS_FILE path.

The palettes (cities/<city>/look/colour/palettes.json, built from open Commons photos by build_palettes.py; a frozen copy
colour_<city>.json sits next to this file so a snapshot carries it to the pods) are TRUE display colours (photo-measured,
exposure-corrected). They become the render's paint as SF's measured colours do: a wall's measured colour is its body
(BCOL_REAL precedent); a brick wall's is a tint on the red-brick texture (tint_k 0.5); a roof's is an albedo divided by
its texture (measured_pitched / measured_flat precedent).

Which type a building is: the record's own key (b['vtype'], set by the types pass), else the types pass's gid table
(VAN_TYPES or look/types/types.json when it carries a gid map), else a rule on the record (use, year, height, footprint,
district). Draws are seeded by gid on their own Random, so no other draw of the generator moves.

Env: VAN_COLOUR=0 off · VAN_PAL=<palettes.json> · VAN_TYPES=<gid->type json> · VAN_SAT (1.0) · VAN_COLOUR_ERAS=1 also in
past years (default: today only)."""
import json, math, os, random

CITY = os.environ.get('CITY', 'sf')
HERE = os.path.dirname(os.path.abspath(__file__))
TYPES = ('character_house', 'vancouver_special', 'postwar_bungalow', 'modern_infill', 'laneway_house', 'west_end_walkup',
         'concrete_tower', 'point_tower', 'podium', 'stucco_lowrise', 'heritage_brick', 'chinatown_society', 'townhouse',
         'institutional', 'industrial_shed', 'granville_island_shed')
# the render textures' mean linear albedo (Poly Haven diffuse maps, measured): a brick wall's paint is a tint on this
BRICK_TEX = (0.236, 0.126, 0.063)
# districts (lon0, lat0, lon1, lat1), loose boxes: the rule's fallback only
GASTOWN = (-123.1125, 49.2810, -123.0990, 49.2865)
CHINATOWN = (-123.1040, 49.2770, -123.0940, 49.2815)
WEST_END = (-123.1480, 49.2800, -123.1215, 49.2960)
GRANVILLE_I = (-123.1415, 49.2675, -123.1300, 49.2740)
DOWNTOWN = (-123.1350, 49.2730, -123.1000, 49.2900)
FLAT_TYPES = {'west_end_walkup', 'concrete_tower', 'point_tower', 'podium', 'stucco_lowrise', 'heritage_brick',
              'chinatown_society', 'industrial_shed', 'institutional'}


def s2l(v): return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
def l2d(v): return max(0.0, v) ** (1 / 2.2)          # the generator's emit() raises paint back to 2.2
def lum(c): return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def _first(*paths):
    for p in paths:
        if p and os.path.exists(p): return p
    return None


class Colour:
    def __init__(self, pal, types, pal_path):
        self.P, self.T, self.path = pal, types, pal_path
        self.sat = float(os.environ.get('VAN_SAT', 1.0))
        self.eras = os.environ.get('VAN_COLOUR_ERAS', '0') == '1'
        self._cc = None
        self.n = {}                                      # draws per type (the hook's own tally, printed by stats())

    # ── which type ──
    def lonlat(self, b):
        if self._cc is None:
            import cityconf as CC; self._cc = CC
        return self._cc.unproj(b['cx'], b['cy'])

    def vtype(self, b):
        t = b.get('vtype') or self.T.get(str(b['gid']))
        if t in self.P: return t
        g = b.get('parent')
        if g is not None and self.T.get(str(g)) in self.P and b.get('src') == 'tower': return self.T[str(g)]
        return self.rule(b)

    def rule(self, b):
        """the record's use, year, height and footprint, and the district: a fallback until the types pass's table"""
        y = b.get('year') or 1950; h = b.get('h') or 6.0; use = (b.get('use') or '').lower(); ty = b.get('ty') or ''
        r = b.get('ring') or []; n = len(r)
        area = abs(sum(r[i][0] * r[(i + 1) % n][1] - r[(i + 1) % n][0] * r[i][1] for i in range(n))) / 2 if n > 2 else 100.0
        lon, lat = self.lonlat(b)
        inb = lambda bx: bx[0] <= lon <= bx[2] and bx[1] <= lat <= bx[3]
        if inb(GRANVILLE_I) and h < 20: return 'granville_island_shed'
        if b.get('h_src') == 'podium': return 'podium'
        if b.get('src') == 'tower' or h > 40: return 'point_tower' if y >= 1985 else 'concrete_tower'
        if h > 22: return 'concrete_tower' if y < 1985 else ('point_tower' if inb(DOWNTOWN) or inb(WEST_END) else 'concrete_tower')
        if 'industrial' in use or ty in ('INDUSTRIAL', 'GARAGE'): return 'industrial_shed'
        if inb(CHINATOWN) and y < 1950: return 'chinatown_society'
        if inb(GASTOWN) and y < 1950: return 'heritage_brick'
        if 'institution' in use or 'hotel' in use or ty in ('INSTITUTION', 'HOTEL'):
            return 'heritage_brick' if y < 1930 and h > 9 else 'institutional'
        if use in ('office', 'retail') or ty in ('OFFICE', 'RETAIL'):
            if y < 1935 and h > 7: return 'heritage_brick'
            return 'institutional' if area > 1500 else 'stucco_lowrise'
        if 'multi' in use or ty in ('APARTMENT', 'FLATS'):
            if inb(WEST_END) or y < 1940: return 'west_end_walkup' if h > 7 else 'character_house'
            if y >= 1975 and h < 12 and area < 900: return 'townhouse'
            return 'stucco_lowrise'
        if area < 75 and y >= 2009: return 'laneway_house'
        if y < 1940: return 'character_house'
        if y < 1965: return 'postwar_bungalow'
        if y < 1986: return 'vancouver_special' if h >= 5.5 else 'postwar_bungalow'
        return 'modern_infill'

    # ── draws ──
    def pick(self, rng, L):
        if not L: return None
        tot = sum(e[3] for e in L); u = rng.random() * tot
        for e in L:
            u -= e[3]
            if u <= 0: return tuple(e[:3])
        return tuple(L[-1][:3])

    def satur(self, c, k):
        if k == 1.0: return c
        L = lum(c); return tuple(min(1.0, max(0.0, L + k * (v - L))) for v in c)

    def active(self, era):
        return era is None or self.eras

    # H1
    def walls(self, b, style, sub, wall_mat, body, trim, accent, gcol, era=None):
        """-> wall_mat, body, trim, accent, gcol (and b['_vc'] = the type and the Vancouver Special's base colour)"""
        if not self.active(era): return wall_mat, body, trim, accent, gcol
        t = self.vtype(b); P = self.P[t]; rng = random.Random(b['gid'] * 7907 + 101)
        self.n[t] = self.n.get(t, 0) + 1
        w = self.pick(rng, P.get('walls')) or body
        tr = trim
        for _ in range(5):
            tr = self.pick(rng, P.get('trim')) or trim
            if abs(lum(tr) - lum(w)) >= 0.12: break
        acc = (0.20, 0.20, 0.21) if lum(tr) > 0.4 else (0.86, 0.85, 0.82)
        if t == 'character_house': acc = rng.choice(((0.45, 0.14, 0.12), (0.16, 0.26, 0.22), (0.18, 0.20, 0.30), (0.20, 0.20, 0.21)))
        if t == 'chinatown_society': acc = (0.62, 0.16, 0.12)
        mat = self.material(t, w, rng)
        bw = w
        if mat == 'brick': bw = self.brick_tint(w)
        else: bw = self.satur(w, self.sat)
        gl = gcol
        if gcol is not None and P.get('glass'):
            g = self.pick(rng, P['glass']); gl = (*g, 0.3 if t in ('point_tower', 'podium') else 0.15)
        base = self.pick(rng, P.get('base')) if P.get('base') else None
        b['_vc'] = dict(type=t, base=base, base_mat=('brick' if base and self.brick_ok(base) else 'stucco') if base else None)
        return mat, bw, tuple(tr), acc, gl

    def material(self, t, w, rng):
        hue_brown = w[0] > w[2] + 0.12 and w[0] >= w[1]
        if t in ('heritage_brick', 'chinatown_society') and hue_brown and lum(w) < 0.5 and self.brick_ok(w): return 'brick'
        if t == 'west_end_walkup' and hue_brown and lum(w) < 0.42 and self.brick_ok(w): return 'brick'
        if t == 'character_house': return 'siding' if rng.random() < 0.85 else 'stucco'
        if t in ('modern_infill', 'laneway_house', 'townhouse') and hue_brown and 0.25 < lum(w) < 0.55: return 'siding'    # cedar
        return 'stucco'

    def brick_ok(self, c):
        """can the red-brick texture (tint_k 0.5: albedo = tex * (0.5 + 0.5 * tint)) reach this colour?"""
        return all(2 * s2l(c[i]) / BRICK_TEX[i] - 1 <= 1.15 for i in range(3))

    def brick_tint(self, c):
        return tuple(l2d(min(1.0, max(0.05, 2 * s2l(c[i]) / BRICK_TEX[i] - 1))) for i in range(3))

    # H2
    def roof_pitched(self, b, roof_mat, rc, tex, era=None):
        """a pitched roof: the type's roof (asphalt greys, moss-dark, ...) as albedo / the shingle texture"""
        if not self.active(era): return roof_mat, rc
        t = self.vtype(b); L = self.P[t].get('roof') or self.P['character_house']['roof']
        rng = random.Random(b['gid'] * 4421 + 7); c = self.pick(rng, L); k = rng.uniform(0.92, 1.08)
        tx = tex['roof_shingle']
        return 'roof_shingle', tuple(l2d(min(2.0, s2l(c[i]) * k / tx[i])) for i in range(3))

    # H3
    def roof_flat(self, b, rc, flat_tex, era=None):
        """a flat roof: the type's membrane (grey / white / gravel / tar, green downtown), kind by its tone, the
        procedural roll direction kept (rc[3]'s fraction)"""
        if not self.active(era): return rc
        t = self.vtype(b); L = self.P[t].get('roof_flat') or self.P['stucco_lowrise']['roof_flat']
        rng = random.Random(b['gid'] * 4421 + 11); c = self.pick(rng, L)
        a = [s2l(v) for v in c]; Lm = lum(a); neutral = max(a) - min(a) < 0.04 * max(1e-3, max(a)) + 0.01
        kind = 2 if Lm > 0.45 else (3 if (neutral and Lm > 0.26 and t in ('industrial_shed', 'granville_island_shed')) else (1 if Lm > 0.12 else 0))
        tx = flat_tex[kind]; t4 = (rc[3] if len(rc) > 3 else 0.5) * 4.0
        return (*[l2d(min(1.0, a[i] / (tx[i] * 0.92))) for i in range(3)], (kind + t4 - math.floor(t4)) / 4.0)

    def stats(self):
        return dict(sorted(self.n.items(), key=lambda kv: -kv[1]))


def _types_table():
    p = _first(os.environ.get('VAN_TYPES'))
    if not p:
        try:
            import cityconf as CC
            p = _first(CC.work('look', 'types', 'types_gid.json'), CC.work('look', 'types', 'types.json'))
        except Exception: p = None
    if not p: return {}
    try: d = json.load(open(p))
    except Exception: return {}
    for k in ('gids', 'gid', 'buildings', 'by_gid'):
        if isinstance(d.get(k), dict): d = d[k]; break
    out = {}
    for g, v in d.items():
        if not str(g).isdigit(): continue
        v = v.get('type') if isinstance(v, dict) else v
        if v in TYPES: out[str(g)] = v
    if out: print('[van_colour] types', p, len(out), flush=True)
    return out


def load():
    """the city's Colour, or None (SF, VAN_COLOUR=0, or no palette for this city)"""
    if CITY == 'sf' or os.environ.get('VAN_COLOUR', '1') != '1': return None
    live = None
    try:
        import cityconf as CC; live = CC.work('look', 'colour', 'palettes.json')
    except Exception: pass
    p = _first(os.environ.get('VAN_PAL'), os.path.join(HERE, f'colour_{CITY}.json'), live)
    if not p: return None
    P = {k: v for k, v in json.load(open(p)).items() if not k.startswith('_')}
    print('[van_colour]', p, len(P), 'types', flush=True)
    return Colour(P, _types_table(), p)
