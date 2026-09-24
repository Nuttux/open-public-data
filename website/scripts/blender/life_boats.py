"""The boats on the bay, as low-poly bodies for a 37 cm/px axonometric
(life_hq.py places them). Local frame: x along the boat (+x = bow), y across
(+y = port), z up from the waterline.

What reads at that scale (2.7 px a metre): the plan (a white deck and cabin
roof, a pointed bow, the dark band of the windows on the side the camera sees
at 29 degrees), a sail's white triangle standing 1.07 x its height tall on
the screen, the colours of a container deck. Dimensions are published ones or
typical of the class:
  San Francisco Bay Ferry (WETA) catamarans, 40-45 m x 10-11 m (Gemini,
    Pyxis, Hydrus classes); Golden Gate Ferry catamarans ~41 m x 11 m and the
    Spaulding-class monohulls 50 m x 11 m; Blue & Gold and Alcatraz boats
    ~30-40 m. White, a coloured band on the hull (a convention per operator).
  a container ship 300 x 48 m, a car carrier 200 x 32 m, 30 m high, a bulk
    carrier 190 x 32 m; a harbour tug 30 x 11 m; a salmon troller 14 m;
  sailboats 8-14 m (mast ~1.35 x the length over the water); kayaks 4.5 m,
    paddleboards 3.3 m.
"""
import math
import random

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)

PAINT, GLASS, MATTE, SAIL, METAL = range(5)     # material slots (life_hq._mats)
WHITE = srgb('#eeeeea'); OFFWHITE = srgb('#dcdad2'); GREY = srgb('#9a9ea2'); DGREY = srgb('#4a4e52')
BLACK = srgb('#1c1d1f'); NAVY = srgb('#1d2a44'); TEAK = srgb('#8a6a48'); NONSKID = srgb('#cfcbc0')
WIN = srgb('#15181c'); RUST = srgb('#7a3a26'); HULLRED = srgb('#8e2a22')


class VB:
    def __init__(self): self.V, self.F, self.C, self.MI = [], [], [], []

    def face(self, pts, col, mi):
        k = len(self.V); self.V += [tuple(p) for p in pts]; self.F.append(tuple(range(k, k + len(pts)))); self.C.append(col); self.MI.append(mi)

    def box(self, x0, x1, y0, y1, z0, z1, col, mi, top=None, sides=True):
        tc, tm = top if top else (col, mi)
        self.face([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], tc, tm)
        if not sides: return
        self.face([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], col, mi)
        self.face([(x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1)], col, mi)
        self.face([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], col, mi)
        self.face([(x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1)], col, mi)

    def cabin(self, x0, x1, hw, z0, z1, col, win=None, roof=None, nose=0.0, hw1=None):
        """a deckhouse: sides in bands (col below, dark glass in `win` = (z_a,
        z_b), col above), a roof; `nose`: the front drawn in to a point over
        that length (a pilothouse's raked front); hw1: the half width at the top"""
        hw1 = hw if hw1 is None else hw1
        roof = roof or col
        bands = [(z0, win[0], col, PAINT), (win[0], win[1], WIN, GLASS), (win[1], z1, col, PAINT)] if win else [(z0, z1, col, PAINT)]
        def hwz(z): return hw + (hw1 - hw) * (z - z0) / max(1e-6, z1 - z0)
        for za, zb, c, mi in bands:
            if zb - za < 1e-3: continue
            a, b = hwz(za), hwz(zb)
            self.face([(x0, -a, za), (x1 - nose, -a, za), (x1 - nose, -b, zb), (x0, -b, zb)], c, mi)
            self.face([(x1 - nose, a, za), (x0, a, za), (x0, b, zb), (x1 - nose, b, zb)], c, mi)
            self.face([(x0, a, za), (x0, -a, za), (x0, -b, zb), (x0, b, zb)], c, mi)
            if nose > 0:
                self.face([(x1 - nose, -a, za), (x1, 0, za), (x1, 0, zb), (x1 - nose, -b, zb)], c, mi)
                self.face([(x1, 0, za), (x1 - nose, a, za), (x1 - nose, b, zb), (x1, 0, zb)], c, mi)
            else:
                self.face([(x1, -a, za), (x1, a, za), (x1, b, zb), (x1, -b, zb)], c, mi)
        h = hw1
        if nose > 0:
            self.face([(x0, -h, z1), (x1 - nose, -h, z1), (x1, 0, z1), (x1 - nose, h, z1), (x0, h, z1)], roof, PAINT)
        else:
            self.face([(x0, -h, z1), (x1, -h, z1), (x1, h, z1), (x0, h, z1)], roof, PAINT)


def plan(t, bow=0.3, transom=0.8, pow_=0.55):
    """half-width fraction at t (0 = stern, 1 = bow)"""
    if t > 1 - bow: return max(0.0, (1 - t) / bow) ** pow_
    return transom + (1 - transom) * min(1.0, t / 0.18) ** 0.5


def hull(vb, L, B, fb, col, deck, stripe=None, bow=0.3, transom=0.8, sheer=0.0, x0=0.0, y0=0.0, n=14, pow_=0.55,
         deck_mi=PAINT, draft=0.4):
    """a hull from the waterline (a little below) to the deck edge; `stripe`
    (z_a, z_b, colour) a band along the side; `sheer` the bow's rise"""
    ts = [i / n for i in range(n + 1)]
    xs = [x0 - L / 2 + t * L for t in ts]
    ws = [B / 2 * plan(t, bow, transom, pow_) for t in ts]
    zt = [fb + sheer * max(0.0, (t - 0.55) / 0.45) ** 2 for t in ts]
    bands = [(-draft, stripe[0], col), (stripe[0], stripe[1], stripe[2]), (stripe[1], None, col)] if stripe else [(-draft, None, col)]
    for i in range(n):
        xa, xb, wa, wb, za, zb = xs[i], xs[i + 1], ws[i], ws[i + 1], zt[i], zt[i + 1]
        for lo, hi, c in bands:
            ha, hb = (min(hi, za) if hi is not None else za), (min(hi, zb) if hi is not None else zb)
            if ha <= lo + 1e-3 and hb <= lo + 1e-3: continue
            for s in (-1, 1):
                p = [(xa, s * wa + y0, lo), (xb, s * wb + y0, lo), (xb, s * wb + y0, hb), (xa, s * wa + y0, ha)]
                vb.face(p if s < 0 else p[::-1], c, PAINT)
        if wa + wb > 1e-3:
            vb.face([(xa, -wa + y0, za), (xb, -wb + y0, zb), (xb, wb + y0, zb), (xa, wa + y0, za)], deck, deck_mi)
    # transom
    vb.face([(xs[0], ws[0] + y0, -draft), (xs[0], -ws[0] + y0, -draft), (xs[0], -ws[0] + y0, zt[0]), (xs[0], ws[0] + y0, zt[0])], col, PAINT)


# ── ferries ──────────────────────────────────────────────────────────────────
LIVERY = {   # hull band, cabin, roof
    'weta': (srgb('#1f5f8b'), WHITE, OFFWHITE, srgb('#3aa39a')),
    'ggf': (NAVY, WHITE, OFFWHITE, srgb('#c2432d')),
    'bg': (srgb('#1d3f7a'), WHITE, OFFWHITE, srgb('#d6a21e')),
    'alc': (srgb('#223047'), WHITE, OFFWHITE, srgb('#223047')),
    'ti': (DGREY, WHITE, OFFWHITE, DGREY),
    'rw': (srgb('#b8262c'), WHITE, OFFWHITE, srgb('#b8262c')),
}


def ferry_cat(op='weta', L=42.0, B=10.6, decks=2):
    """a passenger catamaran: two demihulls, the bridge deck, a main cabin
    with its band of windows, an upper cabin, the pilothouse, open deck aft"""
    band, cab, roof, acc = LIVERY[op]
    vb = VB(); bd = 2.6
    for s in (-1, 1):
        hull(vb, L, bd, 2.2, WHITE, WHITE, stripe=(0.2, 1.1, band), bow=0.22, transom=0.9, sheer=0.5, y0=s * (B / 2 - bd / 2), pow_=0.7)
    # the main deck: a slab across, its front rounded in
    xs = [-L / 2 + 0.3, L / 2 - 6.0, L / 2 - 2.5]
    vb.face([(xs[0], -B / 2, 2.3), (xs[1], -B / 2, 2.3), (xs[2], -B / 2 + 1.6, 2.3), (xs[2], B / 2 - 1.6, 2.3), (xs[1], B / 2, 2.3), (xs[0], B / 2, 2.3)], NONSKID, PAINT)
    vb.face([(xs[0], -B / 2, 1.1), (xs[1], -B / 2, 1.1), (xs[1], -B / 2, 2.3), (xs[0], -B / 2, 2.3)], band, PAINT)
    vb.face([(xs[1], B / 2, 1.1), (xs[0], B / 2, 1.1), (xs[0], B / 2, 2.3), (xs[1], B / 2, 2.3)], band, PAINT)
    # main cabin
    c0, c1 = -L / 2 + 5.0, L / 2 - 7.0
    vb.cabin(c0, c1, B / 2 - 0.35, 2.3, 5.0, cab, win=(3.0, 4.4), roof=roof, nose=2.2, hw1=B / 2 - 0.55)
    if decks >= 2:
        u0, u1 = -L / 2 + 13.0, L / 2 - 11.0
        vb.cabin(u0, u1, B / 2 - 1.4, 5.0, 7.4, cab, win=(5.6, 6.9), roof=roof, nose=1.6)
        # the upper deck's open part aft: benches as dark ticks, a railing band
        for k in range(4):
            x = -L / 2 + 6.5 + k * 1.6
            vb.box(x, x + 0.5, -B / 2 + 1.5, B / 2 - 1.5, 5.0, 5.45, DGREY, MATTE)
        # the pilothouse on the top
        p0 = L / 2 - 17.0
        vb.cabin(p0, p0 + 5.0, 2.6, 7.4, 9.4, cab, win=(7.9, 9.0), roof=roof, nose=1.2)
        vb.box(p0 + 1.0, p0 + 1.6, -0.3, 0.3, 9.4, 10.6, GREY, METAL)          # mast
        vb.box(-L / 2 + 14.5, -L / 2 + 16.0, -0.9, 0.9, 7.4, 8.8, acc, PAINT)   # funnel casing, the operator's colour
    return vb


def ferry_mono(op='ggf', L=50.0, B=10.8):
    """a Spaulding-class monohull (Golden Gate Ferry): a long hull, two
    decks of cabin, the pilothouse forward on top"""
    band, cab, roof, acc = LIVERY[op]
    vb = VB()
    hull(vb, L, B, 2.6, WHITE, NONSKID, stripe=(0.2, 1.2, band), bow=0.28, transom=0.82, sheer=0.8, pow_=0.6)
    vb.cabin(-L / 2 + 5.0, L / 2 - 9.0, B / 2 - 0.5, 2.6, 5.3, cab, win=(3.3, 4.7), roof=roof, nose=3.0)
    vb.cabin(-L / 2 + 10.0, L / 2 - 15.0, B / 2 - 1.2, 5.3, 7.7, cab, win=(5.9, 7.2), roof=roof, nose=2.0)
    p0 = L / 2 - 20.0
    vb.cabin(p0, p0 + 5.5, 3.0, 7.7, 9.8, cab, win=(8.2, 9.4), roof=roof, nose=1.2)
    vb.box(-L / 2 + 14.0, -L / 2 + 16.0, -1.0, 1.0, 7.7, 9.3, acc, PAINT)
    return vb


def small_ferry(op='alc', L=30.0, B=9.0):
    """a smaller excursion boat (Alcatraz, Blue & Gold, Treasure Island): a
    catamaran with one enclosed deck and an open top deck"""
    band, cab, roof, acc = LIVERY[op]
    vb = VB(); bd = 2.2
    for s in (-1, 1):
        hull(vb, L, bd, 2.0, WHITE, WHITE, stripe=(0.2, 1.0, band), bow=0.24, transom=0.9, sheer=0.4, y0=s * (B / 2 - bd / 2), pow_=0.7)
    vb.face([(-L / 2 + 0.3, -B / 2, 2.1), (L / 2 - 4.5, -B / 2, 2.1), (L / 2 - 2.0, 0, 2.1), (L / 2 - 4.5, B / 2, 2.1), (-L / 2 + 0.3, B / 2, 2.1)], NONSKID, PAINT)
    vb.cabin(-L / 2 + 3.0, L / 2 - 5.5, B / 2 - 0.4, 2.1, 4.6, cab, win=(2.8, 4.0), roof=roof, nose=2.0)
    for k in range(5):     # benches on the open top deck
        x = -L / 2 + 5.0 + k * 1.7
        vb.box(x, x + 0.45, -B / 2 + 1.2, B / 2 - 1.2, 4.6, 5.0, DGREY, MATTE)
    p0 = L / 2 - 11.0
    vb.cabin(p0, p0 + 4.0, 2.2, 4.6, 6.6, cab, win=(5.0, 6.2), roof=roof, nose=1.0)
    return vb


# ── ships ────────────────────────────────────────────────────────────────────
BOX_COLS = [srgb(h) for h in ('#3b6fa0', '#a0302a', '#c8c6c0', '#2f6a4a', '#d27c2a', '#6b6f75', '#8a2a2a', '#e6c64a',
                               '#1f3f6b', '#b54a2a', '#4a7fb0', '#dcd8cc', '#2a5a8a', '#7a4a2a')]


def container_ship(L=300.0, B=48.0, seed=1, load=0.85):
    """a post-Panamax container ship: dark hull, the deck in bays of boxes
    (40 ft = 12.2 m, 2.44 m wide, 2.6 m high) 4-8 tiers above the hatches,
    the accommodation block a third from the stern, the funnel aft of it"""
    r = random.Random(seed); vb = VB(); own = r.choice((BOX_COLS[0], BOX_COLS[2], BOX_COLS[3], BOX_COLS[10]))
    hull(vb, L, B, 12.0, BLACK, DGREY, stripe=(-0.4, 1.2, HULLRED), bow=0.18, transom=0.86, sheer=2.0, pow_=0.8, n=18)
    xa = -L / 2 + 0.26 * L                # the house
    vb.cabin(xa - 7, xa + 7, B / 2 - 3.0, 12.0, 44.0, WHITE, win=(40.5, 42.8), roof=OFFWHITE)
    vb.box(xa - 16, xa - 9, -3.5, 3.5, 12.0, 46.0, WHITE, PAINT, top=(BLACK, MATTE))       # funnel
    vb.box(xa + 5.5, xa + 7.0, -B / 2 + 0.5, B / 2 - 0.5, 40.0, 41.5, WHITE, PAINT)          # bridge wings
    # bays forward and aft of the house
    rows = int((B - 4) // 2.5)
    x = -L / 2 + 14.0
    while x + 12.2 < L / 2 - 22.0:
        if xa - 18 < x + 12.2 and x < xa + 8:
            x = xa + 8.5; continue
        tiers = r.choice((5, 6, 6, 7)) if r.random() < load else 0
        if tiers:
            y = -rows * 2.5 / 2
            # a bay: a row of stacks the same height give or take a box, the
            # line's own colour (the ship's operator) the commonest
            while y < rows * 2.5 / 2 - 0.1:
                w = min(2.5 * r.choice((1, 2, 2, 3)), rows * 2.5 / 2 - y)
                t = max(1, tiers - (1 if r.random() < 0.2 else 0))
                c = own if r.random() < 0.35 else r.choice(BOX_COLS)
                vb.box(x, x + 12.2, y, y + w - 0.08, 12.0, 12.0 + 2.6 * t, c, MATTE)
                y += w
        else:
            vb.box(x, x + 12.2, -B / 2 + 2.0, B / 2 - 2.0, 12.0, 12.6, DGREY, MATTE)      # an empty hatch
        x += 12.8
    # forecastle
    vb.box(L / 2 - 20.0, L / 2 - 10.0, -B / 2 + 4.0, B / 2 - 4.0, 12.0, 14.0, DGREY, MATTE)
    return vb


def car_carrier(L=200.0, B=32.0, col='#e8e6e0', band='#1d3a6b'):
    """a pure car and truck carrier: a slab-sided box to the top, the bridge
    at the very front"""
    vb = VB(); c = srgb(col)
    hull(vb, L, B, 30.0, c, c, stripe=(-0.4, 7.0, srgb(band)), bow=0.10, transom=0.97, pow_=0.35, n=16)
    vb.box(L / 2 - 22.0, L / 2 - 18.0, -B / 2 + 1.0, B / 2 - 1.0, 30.0, 33.5, c, PAINT)
    vb.box(L / 2 - 21.8, L / 2 - 18.2, -B / 2 + 1.1, B / 2 - 1.1, 31.0, 32.6, WIN, GLASS, sides=True)
    vb.box(-L / 2 + 20.0, -L / 2 + 26.0, -2.5, 2.5, 30.0, 34.5, c, PAINT, top=(BLACK, MATTE))
    # the deck's gear: vents and lifeboat davits as small grey boxes
    for k in range(6):
        vb.box(-L / 2 + 40 + k * 22, -L / 2 + 44 + k * 22, -B / 2 + 2, -B / 2 + 5, 30.0, 31.2, GREY, MATTE)
    return vb


def bulk_carrier(L=190.0, B=32.0):
    vb = VB()
    hull(vb, L, B, 9.0, srgb('#2a3440'), srgb('#6a2a22'), stripe=(-0.4, 2.0, HULLRED), bow=0.2, transom=0.85, sheer=1.5, pow_=0.8, n=16)
    vb.cabin(-L / 2 + 4, -L / 2 + 20, B / 2 - 2.0, 9.0, 26.0, WHITE, win=(23.0, 25.0), roof=OFFWHITE)
    vb.box(-L / 2 + 6, -L / 2 + 11, -2.5, 2.5, 9.0, 30.0, WHITE, PAINT, top=(BLACK, MATTE))
    for k in range(5):     # hatch covers and the cranes between them
        x = -L / 2 + 30 + k * 28
        vb.box(x, x + 20, -B / 2 + 5, B / 2 - 5, 9.0, 11.0, srgb('#6a2a22'), MATTE)
        if k < 4:
            vb.box(x + 22, x + 25, -1.5, 1.5, 9.0, 22.0, srgb('#c9b23a'), PAINT)
            vb.box(x + 22.5, x + 24.5, -1.0, 16.0, 20.0, 21.0, srgb('#c9b23a'), PAINT)
    vb.box(L / 2 - 16, L / 2 - 6, -B / 2 + 4, B / 2 - 4, 9.0, 11.5, srgb('#6a2a22'), MATTE)
    return vb


def barge(L=70.0, B=18.0):
    """a deck barge with a load of sand, pushed by a tug"""
    vb = VB()
    hull(vb, L, B, 3.0, srgb('#4a3a30'), srgb('#5a4a3e'), bow=0.06, transom=0.98, pow_=0.3, n=8)
    sand = srgb('#b09a74')
    for k, (a, b, h) in enumerate(((-0.42, -0.18, 3.0), (-0.2, 0.05, 4.2), (0.03, 0.28, 3.6), (0.26, 0.4, 2.2))):
        vb.box(a * L, b * L, -B / 2 + 2.2, B / 2 - 2.2, 3.0, 3.0 + h, sand, MATTE)
    return vb


def tug(L=30.0, B=11.0, col='#1e1f22', house='#e8e6e0', trim='#b0302a'):
    """a harbour tractor tug: broad hull, a fendered sheer, the house forward
    of midships with the wheelhouse on top, the tow deck aft"""
    vb = VB(); h = srgb(house)
    hull(vb, L, B, 3.2, srgb(col), srgb('#5a5a58'), stripe=(2.4, 3.2, srgb(trim)), bow=0.32, transom=0.8, sheer=0.8, pow_=0.5)
    vb.cabin(-L / 2 + 9.0, L / 2 - 6.0, B / 2 - 1.6, 3.2, 6.0, h, win=(4.8, 5.6))
    vb.cabin(L / 2 - 14.0, L / 2 - 8.5, 2.8, 6.0, 8.6, h, win=(7.0, 8.2), roof=srgb('#d0ccc4'))
    vb.box(-L / 2 + 11.0, -L / 2 + 12.4, -2.4, -1.2, 6.0, 9.5, srgb('#1e1f22'), MATTE)
    vb.box(-L / 2 + 11.0, -L / 2 + 12.4, 1.2, 2.4, 6.0, 9.5, srgb('#1e1f22'), MATTE)
    return vb


def fishing(L=14.0, B=4.4, col='#e8e6e0', trim='#2a4a7a', seed=0):
    """a salmon troller / crabber: the wheelhouse forward, the working deck
    aft, the trolling poles up (they read as their shadows)"""
    r = random.Random(seed); vb = VB()
    hull(vb, L, B, 1.6, srgb(col), srgb('#8a857a'), stripe=(0.9, 1.6, srgb(trim)), bow=0.35, transom=0.75, sheer=0.7, pow_=0.5)
    vb.cabin(L / 2 - 6.5, L / 2 - 3.2, B / 2 - 0.5, 1.6, 3.8, srgb('#f0eee8'), win=(2.9, 3.5), roof=srgb('#d8d4ca'))
    vb.box(L / 2 - 6.0, L / 2 - 5.8, -0.1, 0.1, 3.8, 9.0, GREY, METAL)          # mast
    if r.random() < 0.7:
        for s in (-1, 1):
            vb.box(L / 2 - 5.9, L / 2 - 5.7, s * 0.2, s * 0.2 + s * 0.12, 1.6, 8.0, GREY, METAL)
    for k in range(r.randint(1, 3)):         # crab pots, gear
        x = -L / 2 + 1.0 + k * 1.3
        vb.box(x, x + 1.0, -1.2, -0.2 + r.random(), 1.6, 2.2, r.choice((srgb('#c8b04a'), srgb('#2a2c2e'), srgb('#b04a2a'))), MATTE)
    return vb


# ── pleasure boats ───────────────────────────────────────────────────────────
HULLS = [(WHITE, 0.62), (srgb('#f2f0ea'), 0.14), (NAVY, 0.08), (srgb('#1f3d2e'), 0.04), (srgb('#8a2a24'), 0.03),
         (srgb('#23282e'), 0.04), (srgb('#c9c2ae'), 0.05)]
COVERS = [srgb('#1f4f82'), srgb('#1f4f82'), srgb('#274a6e'), srgb('#6b6f6a'), srgb('#8a7a5a'), srgb('#2e2f31')]


def _pick(r, lst):
    x = r.random() * sum(w for _, w in lst); a = 0
    for v, w in lst:
        a += w
        if x <= a: return v
    return lst[-1][0]


def sailboat(L=10.0, seed=0, sails=None, heel=0.0):
    """a cruising sloop. sails=None: moored (the main furled on the boom under
    its blue cover); else (boom_angle, jib_angle, spinnaker) in radians, +y =
    to port; heel (radians, + = to port) tilts the whole boat about x"""
    r = random.Random(seed); vb = VB()
    B = L * 0.33; hc = _pick(r, HULLS)
    hull(vb, L, B, 0.9 + 0.03 * L, hc, NONSKID, stripe=(0.05, 0.22, srgb('#2a3f6a') if hc[0] > 0.5 else WHITE), bow=0.45, transom=0.72, sheer=0.12 * L / 10, pow_=0.6)
    fb = 0.9 + 0.03 * L
    vb.cabin(-L * 0.12, L * 0.22, B / 2 * 0.6, fb, fb + 0.55 + 0.02 * L, OFFWHITE, win=(fb + 0.25, fb + 0.45), roof=OFFWHITE, nose=L * 0.06)
    vb.box(-L * 0.46, -L * 0.2, -B * 0.28, B * 0.28, fb - 0.1, fb + 0.05, TEAK, MATTE)          # cockpit sole, teak
    mx = L * 0.12; H = L * 1.3                               # mast foot, height over the deck
    vb.box(mx - 0.09, mx + 0.09, -0.09, 0.09, fb, fb + H, GREY, METAL)
    boomz = fb + 1.4 + 0.04 * L; bl = L * 0.42
    if sails is None:
        vb.box(mx - bl, mx, -0.22, 0.22, boomz - 0.18, boomz + 0.25, r.choice(COVERS), MATTE)       # the sail cover
    else:
        ba, ja, spin = sails
        cb, sb = math.cos(math.pi - ba), math.sin(math.pi - ba)
        # the main: a triangle mast foot..head..clew, swung out to leeward
        clew = (mx + cb * bl, sb * bl, boomz)
        vb.face([(mx, 0, boomz), clew, (mx, 0, fb + H * 0.97)], WHITE, SAIL)
        # a little roach: a second triangle so the leech is not a line
        vb.face([clew, ((mx + clew[0]) / 2 + 0.15 * cb, clew[1] * 0.55, boomz + H * 0.5), (mx, 0, fb + H * 0.97)], WHITE, SAIL)
        # the jib: tack at the bow, head up the forestay, clew swung to leeward
        tack = (L / 2 - 0.3, 0, fb + 0.3); head = (mx + 0.2, 0, fb + H * 0.85)
        jl = L * 0.45; cj, sj = math.cos(math.pi - ja), math.sin(math.pi - ja)
        jclew = (tack[0] + cj * jl, sj * jl, fb + 0.6)
        vb.face([tack, jclew, head], WHITE, SAIL)
        if spin:
            # the spinnaker: a coloured bag ahead of the bow, head at the masthead,
            # tack and clew either side, the belly out forward
            c = r.choice((srgb('#c0302a'), srgb('#1f4fa0'), srgb('#e8b02a'), srgb('#e6e6e0'), srgb('#2a8a5a')))
            sy = math.copysign(1.0, ba) if abs(ba) > 1e-3 else 1.0
            hd = (mx + 0.3, 0.0, fb + H * 0.95)
            tk = (L / 2 + 0.6, -sy * L * 0.32, fb + 1.3); cl = (L / 2 + 0.6, sy * L * 0.32, fb + 1.3)
            bl = (L / 2 + L * 0.42, sy * L * 0.08, fb + H * 0.42)
            for tri in ((hd, tk, bl), (hd, bl, cl), (tk, cl, bl)): vb.face(list(tri), c, SAIL)
    if heel:          # + = the mast leans to port (+y)
        ch, sh = math.cos(heel), math.sin(heel)
        vb.V = [(x, y * ch + z * sh, -y * sh + z * ch) for x, y, z in vb.V]
    return vb


def motorboat(L=11.0, seed=0, flybridge=None):
    """a motor yacht / sportfisher: white, the saloon, a flybridge"""
    r = random.Random(seed); vb = VB(); B = L * 0.34
    hc = WHITE if r.random() < 0.85 else _pick(r, HULLS)
    fb = 1.1 + 0.035 * L
    hull(vb, L, B, fb, hc, NONSKID, stripe=(0.1, 0.3, srgb('#2a3f6a')), bow=0.38, transom=0.9, sheer=0.15 * L / 10, pow_=0.55)
    vb.cabin(-L * 0.18, L * 0.22, B / 2 * 0.8, fb, fb + 1.6, WHITE, win=(fb + 0.6, fb + 1.3), roof=OFFWHITE, nose=L * 0.07)
    if flybridge if flybridge is not None else r.random() < 0.5:
        vb.box(-L * 0.12, L * 0.08, -B * 0.32, B * 0.32, fb + 1.6, fb + 2.0, WHITE, PAINT, top=(srgb('#2a2c30'), MATTE))
    return vb


def kayak(seed=0, sup=False):
    """a sea kayak (4.5 m) or a paddleboard (3.3 m) with its paddler"""
    r = random.Random(seed); vb = VB()
    c = r.choice([srgb(h) for h in ('#e8c21a', '#d8401a', '#e86a1a', '#2a7ad0', '#b8d82a', '#d82a4a', '#20a0a0')])
    if sup:
        hull(vb, 3.3, 0.8, 0.12, WHITE if r.random() < 0.5 else c, WHITE if r.random() < 0.5 else c, bow=0.35, transom=0.6, n=6)
        vb.box(-0.15, 0.15, -0.18, 0.18, 0.12, 1.75, srgb('#1e2124'), MATTE)          # the paddler standing
        vb.box(-0.1, 0.1, -0.1, 0.1, 1.55, 1.75, srgb('#c89a7a'), MATTE)
    else:
        hull(vb, 4.5, 0.62, 0.30, c, c, bow=0.45, transom=0.1, n=8)
        vb.box(-0.3, 0.3, -0.22, 0.22, 0.3, 0.95, srgb(r.choice(('#1e2124', '#c83a2a', '#2a4a8a', '#e8e0c8'))), MATTE)   # the paddler, the PFD
        vb.box(-0.08, 0.08, -1.1, 1.1, 0.75, 0.8, srgb('#1e2124'), MATTE)          # the paddle
    return vb


def kiteboard(seed=0):
    """a kiteboarder off Crissy Field: the rider on the water, the kite 20 m
    downwind and up (+x = toward the kite), an arc of 9 m span; the lines
    (1.5 mm) do not show at 37 cm/px"""
    r = random.Random(seed); vb = VB()
    c1 = r.choice([srgb(h) for h in ('#e83a2a', '#f0c020', '#2a8ad8', '#20b070', '#e8e8e2', '#e86a1a', '#c02a8a')])
    c2 = r.choice([srgb(h) for h in ('#1e2124', '#e8e8e2', '#2a4a8a')])
    vb.box(-0.7, 0.7, -0.2, 0.2, 0.0, 0.08, srgb('#1e2124'), MATTE)                       # the board
    vb.box(-0.18, 0.18, -0.2, 0.2, 0.08, 1.55, srgb('#1e2124'), MATTE)                      # the rider (wetsuit)
    D, Hk, span, chord = 18.0, 14.0, 9.0, 2.4
    n = 8
    pts = []
    for i in range(n + 1):
        a = math.pi * (0.15 + 0.7 * i / n)                     # the arc, seen from the rider
        pts.append((D, -span / 2 * math.cos(a) / 0.85, Hk + span * 0.35 * (math.sin(a) - 0.5)))
    for i in range(n):
        (x0, y0, z0), (x1, y1, z1) = pts[i], pts[i + 1]
        col = c1 if i % 3 else c2
        vb.face([(x0 - chord / 2, y0, z0), (x1 - chord / 2, y1, z1), (x1 + chord / 2, y1, z1), (x0 + chord / 2, y0, z0)], col, SAIL)
    return vb


def windsurfer(seed=0):
    """a windsurfer: a 2.6 m board, a 5 m2 sail raked back, coloured"""
    r = random.Random(seed); vb = VB()
    c = r.choice([srgb(h) for h in ('#e83a2a', '#f0c020', '#2a8ad8', '#20b070', '#e86a1a')])
    hull(vb, 2.6, 0.7, 0.12, WHITE, WHITE, bow=0.4, transom=0.6, n=6)
    vb.face([(0.2, 0.0, 0.3), (-1.4, 0.0, 1.2), (0.0, 0.0, 4.6)], c, SAIL)
    vb.face([(0.2, 0.0, 0.3), (0.0, 0.0, 4.6), (-0.6, 0.0, 3.0)], srgb('#e8e8e2'), SAIL)
    return vb


def rowing_gig(seed=0):
    """a club rowing boat of Aquatic Park: 8 m, varnished, four rowers"""
    vb = VB()
    hull(vb, 8.0, 1.3, 0.45, srgb('#8a5a32'), srgb('#6a4a2a'), bow=0.4, transom=0.5, n=8)
    for k in range(4):
        x = -2.4 + k * 1.4
        vb.box(x - 0.25, x + 0.25, -0.22, 0.22, 0.45, 1.25, srgb('#e8e4dc') if k % 2 else srgb('#2a3a5a'), MATTE)
        vb.box(x - 0.05, x + 0.05, -2.3, 2.3, 0.55, 0.6, srgb('#e8e4dc'), MATTE)
    return vb

