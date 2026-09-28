#!/usr/bin/env python3
"""pipeline/tiles.py - INCREMENTAL AI TILES ("repaint only what changed"; pipeline agent 28/09, BAR 28/09 19:10 (4)).

Every AI tile = one job line of the standard runner (lr_run9.py / speed/vast/lr_run9v.py): 'C9:gx,gy out/... - <key> <seed>' after a
'#MOSAIC <tag>' header. Its output is a pure function of its INPUTS, so we key every output by the hash of those inputs:

  px     the render pixels the op reads (C9/C8: the 2048 L9 px around the tile + the 1024 tile; RJ: the 1024 tile; G*: + class map)
  cls    the class-map pixels of the same region (read by the G* guide ops; recorded for every op, keyed only where the op reads it)
  recipe sha1 of the runner source (= prompts P[key], cascade, clauses) + the variant knobs (canonical json) + extra recipe files
  prompt the prompt key of the line
  seed   the seed of the line (+ the noise-field key when the variant has 'nf': the world-keyed latent field)
  model  model id + precision (FP8 mode: bf16 '0', 2, 3)
  runner the runner file's sha1 (part of recipe; kept apart so the planner can say "runner edit")

h_in = sha1 of all of the above = the tile's identity. Outputs live in a content-addressed store (CAS) on the SD card,
/Volumes/DANI-SD-DRIVE2/pipeline/tiles/cas/<h[:2]>/<h>.jpg, with a row per output in manifest.sqlite (output sha, card, time, s/tile,
run name, job line). A new run first PLANS: every job line whose h_in is already in the CAS is reused, the rest is re-run.

  tiles.py spec <out.json> --name N --runner F [--fp8 3] [--model M] [--variant V.json] [--extra f1,f2]    write a recipe spec
  tiles.py record --spec S --jobs j1[,j2] --mosaics DIR --outs DIR [--run NAME] [--card GPU]           outputs -> CAS + manifest
  tiles.py plan   --spec S --jobs j1[,j2] --mosaics DIR [--emit DIR] [--link DIR] [--card-strict GPU]   what must re-run, and why
        --emit DIR : reduced job files (only the lines to run, #MOSAIC headers kept) -> DIR/<same names>; nothing written if all cached
        --link DIR : the cached outputs copied to DIR/<job out path> (so the assemble step sees a complete tile set)
  tiles.py touch  --bt DB --bids a,b | --box x0,y0,x1,y1  --jobs ...     the job lines whose tiles a building (or a world box) touches
  tiles.py stats                                                             CAS size, rows per run

Card: not part of h_in (CPU noise makes every card produce the same image up to ~4/255 MAE, FORENSICS); it is recorded, and
--card-strict GPU treats a cached tile from another card as a miss (for pixel-exact A/Bs).
Shared L8 (look v6 'sl8'): a tile then depends on the shared L8 layer, not on its own 2048 px: the job line must carry the L8 region
(variant 'sl8': the planner hashes the L8 layer file region instead; see pipeline/DESIGN.md 'sl8').
"""
import sys, os, json, hashlib, sqlite3, argparse, time, shutil, glob, re

ROOT = os.environ.get('PIPE_TILES', '/Volumes/DANI-SD-DRIVE2/pipeline/tiles')
DB = f'{ROOT}/manifest.sqlite'; CAS = f'{ROOT}/cas'
VERSION = 'tiles-1'


def sha(b): return hashlib.sha1(b).hexdigest()
def fsha(p): return sha(open(p, 'rb').read())
def cj(o): return json.dumps(o, sort_keys=True, separators=(',', ':'))


def db():
    os.makedirs(CAS, exist_ok=True)
    c = sqlite3.connect(DB)
    c.executescript("""
    create table if not exists outputs(h_in text primary key, out_sha text, cas text, gx int, gy int, op text, key text, seed int,
      h_px text, h_cls text, h_recipe text, h_runner text, model text, prec text, spec text, run text, card text, s real, t real, line text);
    create table if not exists seen(tile text, h_in text, run text, t real, primary key(tile, h_in));
    create index if not exists seen_tile on seen(tile);
    create table if not exists thumbs(h_in text primary key, w int, data blob);""")
    return c


# ---------- recipe spec ----------
def load_spec(p):
    s = json.load(open(p)); var = s.get('variant') or {}
    if isinstance(var, str): var = json.load(open(var))
    h_runner = fsha(s['runner'])
    extra = ''.join(fsha(f) for f in s.get('extra', []))
    s['_var'] = var; s['_h_runner'] = h_runner; s['_prec'] = str(s.get('fp8', '0'))
    s['_h_recipe'] = sha((h_runner + cj(var) + extra).encode())[:16]
    return s


def make_spec(o):
    s = dict(name=o.name, runner=os.path.abspath(o.runner), fp8=str(o.fp8), model=o.model,
             variant=(json.load(open(o.variant)) if o.variant else {}), extra=[os.path.abspath(f) for f in (o.extra.split(',') if o.extra else [])],
             created=time.strftime('%Y-%m-%d %H:%M'), tiles_version=VERSION)
    json.dump(s, open(o.out, 'w'), indent=1); print('spec', o.out, 'recipe', load_spec(o.out)['_h_recipe'])


# ---------- job lines ----------
OPS = ('C9:', 'C8:', 'G9:', 'G8:', 'RJ:', 'RJT:')
def parse_jobs(files):
    """-> [dict(file, tag, op, gx, gy, out, key, seed, line)] (lines the runner turns into one output each)"""
    J = []
    for f in files:
        tag = ''
        for ln in open(f):
            a = ln.split()
            if not a: continue
            if a[0] == '#MOSAIC': tag = a[1]; continue
            if a[0].startswith('#'): continue
            op = next((p for p in OPS if a[0].startswith(p)), None)
            if op is None or len(a) < 5: J.append(dict(file=f, tag=tag, op='other', gx=None, gy=None, out=a[1] if len(a) > 1 else '', key='', seed=0, line=ln.rstrip('\n'))); continue
            v = list(map(int, a[0][len(op):].split(',')))
            J.append(dict(file=f, tag=tag, op=op[:-1], gx=v[0], gy=v[1], wh=v[2:4], out=a[1], key=a[3], seed=int(a[4]), line=ln.rstrip('\n')))
    return J


class Mosaics:
    """R_<tag>.jpg / R_<tag>.json / C_<tag>.png (tag '' = R.jpg) in one dir, decoded once"""
    def __init__(s, d): s.d = d; s.c = {}
    def get(s, tag):
        if tag not in s.c:
            from PIL import Image
            Image.MAX_IMAGE_PIXELS = None
            sfx = f'_{tag}' if tag else ''
            R = Image.open(f'{s.d}/R{sfx}.jpg').convert('RGB'); R.load(); o = json.load(open(f'{s.d}/R{sfx}.json'))
            cp = f'{s.d}/C{sfx}.png'; C = None
            if os.path.exists(cp): C = Image.open(cp).convert('RGB'); C.load()
            s.c = {tag: (R, o['ox'], o['oy'], C)}   # keep one mosaic in memory (the job files are grouped by #MOSAIC)
        return s.c[tag]


def region(j):
    gx, gy = j['gx'], j['gy']
    if j['op'] in ('C9', 'C8', 'G9', 'G8'): return (gx - 512, gy - 512, gx + 1536, gy + 1536)
    if j['op'] == 'RJT': w, h = (j['wh'] + [1024, 1024])[:2]; return (gx, gy, gx + w, gy + h)
    return (gx, gy, gx + 1024, gy + 1024)


def crop_hash(im, ox, oy, box):
    if im is None: return None
    x0, y0, x1, y1 = box
    return sha(im.crop((x0 - ox, y0 - oy, x1 - ox, y1 - oy)).tobytes())[:16]


TW = 32   # input thumbnail: the op's read region box-filtered to 32 x 32 (2048 px -> 64 px blocks): path-tracing noise averages out
def thumb(im, ox, oy, box):
    import numpy as np
    x0, y0, x1, y1 = box; a = np.asarray(im.crop((x0 - ox, y0 - oy, x1 - ox, y1 - oy)), np.float32)
    h, w = a.shape[0] // TW * TW, a.shape[1] // TW * TW
    return a[:h, :w].reshape(TW, h // TW, TW, w // TW, 3).mean((1, 3)).round().astype(np.uint8)


def hash_inputs(j, M, spec):
    R, ox, oy, C = M.get(j['tag'])
    box = region(j); hp = crop_hash(R, ox, oy, box); hc = crop_hash(C, ox, oy, box)
    var = spec['_var']
    nf = f"nf:{var.get('nf')}" if var.get('nf') else ''
    parts = dict(op=j['op'], gx=j['gx'], gy=j['gy'], px=hp, cls=hc if j['op'].startswith('G') else None, recipe=spec['_h_recipe'],
                 prompt=j['key'], seed=j['seed'], nf=nf, model=spec.get('model', ''), prec=spec['_prec'])
    j.update(h_px=hp, h_cls=hc, h_in=sha(cj(parts).encode()), parts=parts, thumb=lambda: thumb(R, ox, oy, box))
    return j


def tile_id(j): return f"{j['op']}:{j['gx']},{j['gy']}"


# ---------- record ----------
def find_out(outs, j):
    for p in (f"{outs}/{j['out']}", f"{outs}/{os.path.basename(j['out'])}"):
        if os.path.exists(p): return p


def record(o):
    spec = load_spec(o.spec); M = Mosaics(o.mosaics); c = db(); J = parse_jobs(o.jobs.split(','))
    prov = {}
    for lf in glob.glob(f'{o.outs}/log_*.txt') + glob.glob(f'{o.outs}/log.txt'):
        for l in open(lf):
            if l.startswith('{'):
                try: d = json.loads(l); prov[os.path.basename(d['out'])] = d
                except Exception: pass
    n = new = miss = 0
    for j in J:
        if j['op'] == 'other': continue
        p = find_out(o.outs, j)
        if not p: miss += 1; continue
        hash_inputs(j, M, spec); h = j['h_in']; dst = f'{CAS}/{h[:2]}/{h}.jpg'
        if not os.path.exists(dst): os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copyfile(p, dst); new += 1
        pv = prov.get(os.path.basename(j['out']), {})
        c.execute('insert or ignore into outputs values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                  (h, fsha(dst)[:16], dst, j['gx'], j['gy'], j['op'], j['key'], j['seed'], j['h_px'], j['h_cls'], spec['_h_recipe'],
                   spec['_h_runner'][:16], spec.get('model', ''), spec['_prec'], spec['name'], o.run or spec['name'], o.card or pv.get('card', ''),
                   pv.get('s'), time.time(), j['line']))
        c.execute('insert or replace into seen values(?,?,?,?)', (tile_id(j), h, o.run or spec['name'], time.time()))
        c.execute('insert or ignore into thumbs values(?,?,?)', (h, TW, j['thumb']().tobytes()))
        n += 1
    c.commit()
    print(f'record {o.run or spec["name"]}: {n} tiles ({new} new in CAS), {miss} job lines without an output')
    return n, new, miss


# ---------- plan ----------
WHY = ('px', 'cls', 'recipe', 'prompt', 'seed', 'nf', 'model', 'prec')
def explain(c, j):
    """which input changed vs the last recorded output of the same tile"""
    r = c.execute('select o.h_px, o.h_cls, o.h_recipe, o.key, o.seed, o.model, o.prec, o.line from seen s join outputs o on o.h_in = s.h_in '
                  'where s.tile = ? order by s.t desc limit 1', (tile_id(j),)).fetchone()
    if not r: return 'new tile'
    p = j['parts']; w = []
    if r[0] != p['px']: w.append('render')
    if p['cls'] and r[1] != p['cls']: w.append('class')
    if r[2] != p['recipe']: w.append('recipe')
    if r[3] != p['prompt']: w.append('prompt')
    if r[4] != p['seed']: w.append('seed')
    if r[5] != p['model']: w.append('model')
    if r[6] != p['prec']: w.append('precision')
    return '+'.join(w) or 'noise-field'


def tolerant_match(c, j, tol):
    """ERAS (DESIGN.md): an output whose inputs differ from this line's ONLY in render pixels, where the two regions' 32 x 32 thumbnails
    differ by at most `tol` (max |dRGB| of a 64 px block) -> reuse it (path-tracing noise between two renders of an unchanged area)"""
    import numpy as np
    p = j['parts']; me = None
    for cas, h, px in c.execute('select cas, h_in, h_px from outputs where op = ? and gx = ? and gy = ? and h_recipe = ? and key = ? and seed = ? and model = ? and prec = ?',
                                (j['op'], j['gx'], j['gy'], p['recipe'], p['prompt'], p['seed'], p['model'], p['prec'])):
        r = c.execute('select data from thumbs where h_in = ?', (h,)).fetchone()
        if not r or not os.path.exists(cas): continue
        if me is None: me = j['thumb']().astype(np.int16)
        d = np.abs(np.frombuffer(r[0], np.uint8).reshape(TW, TW, 3).astype(np.int16) - me)
        if d.max() <= tol: return cas
    return None


def plan(o, quiet=False):
    spec = load_spec(o.spec); M = Mosaics(o.mosaics); c = db(); files = o.jobs.split(','); J = parse_jobs(files)
    todo, hit, why = [], [], {}
    for j in J:
        if j['op'] == 'other': todo.append(j); why['unparsed'] = why.get('unparsed', 0) + 1; continue
        hash_inputs(j, M, spec)
        q = 'select cas, card from outputs where h_in = ?'
        rows = c.execute(q, (j['h_in'],)).fetchall()
        if o.card_strict: rows = [r for r in rows if r[1] == o.card_strict]
        if rows and os.path.exists(rows[0][0]): j['cas'] = rows[0][0]; hit.append(j); continue
        w = explain(c, j)
        if getattr(o, 'tolerant', None) is not None and w == 'render':
            t = tolerant_match(c, j, o.tolerant)
            if t: j['cas'] = t; j['tolerant'] = True; hit.append(j); why['tolerant reuse'] = why.get('tolerant reuse', 0) + 1; continue
        why[w] = why.get(w, 0) + 1; todo.append(j)
    if o.emit:
        os.makedirs(o.emit, exist_ok=True)
        for f in files:
            ls = []; tag = None
            for j in (x for x in todo if x['file'] == f):
                if j['tag'] != tag: tag = j['tag']; ls.append(f'#MOSAIC {tag}' if tag else '#MOSAIC_DEFAULT')
                ls.append(j['line'])
            ls = [l for l in ls if l != '#MOSAIC_DEFAULT']
            dst = f'{o.emit}/{os.path.basename(f)}'
            if ls: open(dst, 'w').write('\n'.join(ls) + '\n')
            elif os.path.exists(dst): os.remove(dst)
    if o.link:
        for j in hit:
            d = f"{o.link}/{j['out']}"; os.makedirs(os.path.dirname(d), exist_ok=True)
            if not os.path.exists(d): shutil.copyfile(j['cas'], d)
    res = dict(spec=spec['name'], recipe=spec['_h_recipe'], lines=len(J), reuse=len(hit), run=len(todo), why=why)
    if not quiet: print(json.dumps(res))
    return res, todo, hit


# ---------- touch: building / box -> job lines ----------
def world_to_l9_box(x0, y0, x1, y1, z0=0.0, z1=0.0):
    """world metre box (+ elevation range incl. building height) -> global L9 px box (the map's oblique view projects height north)"""
    import math
    CA = math.cos(math.radians(30)); SA = 0.42; KX = math.sqrt(2) * CA; KY = math.sqrt(2) * SA; ZT = math.sqrt(2 * (CA ** 2 - SA ** 2))
    cx, cy = 241.427019126574, 707.0567508859249; scale = 2 ** (round(math.log2(0.06898352692062097) * 24) / 24)
    f = 64; SZ = scale * f; PCW, PCH = round(2560 * f), round(1536 * f)
    def l9(x, y, z): return 2 * ((x * KX - cx) * SZ + PCW / 4), 2 * ((cy - (y * KY + z * ZT)) * SZ + PCH / 4)
    pts = [l9(x, y, z) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    return min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)


def touch(o):
    boxes = []
    if o.box: x0, y0, x1, y1 = map(float, o.box.split(',')); boxes.append(world_to_l9_box(x0, y0, x1, y1, float(o.z0), float(o.z1)))
    if o.bids:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import bt_read
        T = bt_read.BT(o.bt)
        for b in o.bids.split(','):
            r = T.get(int(b))
            if not r: print('unknown bid', b); continue
            h = r.get('h') or 0; boxes.append(world_to_l9_box(r['minx'], r['miny'], r['maxx'], r['maxy'], r.get('z0') or 0, (r.get('z0') or 0) + h))
    J = [j for j in parse_jobs(o.jobs.split(',')) if j['op'] != 'other']
    hit = []
    for j in J:
        X0, Y0, X1, Y1 = region(j)   # the op's full read region (a change there changes the tile)
        if any(X0 < b[2] and b[0] < X1 and Y0 < b[3] and b[1] < Y1 for b in boxes): hit.append(j)
    print(json.dumps(dict(boxes=[[round(v) for v in b] for b in boxes], lines=len(J), touched=len(hit), tiles=[tile_id(j) for j in hit][:50])))
    return hit


def stats(o):
    c = db()
    for r in c.execute('select run, count(*), min(prec), group_concat(distinct card) from outputs group by run'): print(r)
    n = sum(len(fs) for _, _, fs in os.walk(CAS)); print('CAS files', n)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter); sp = ap.add_subparsers(dest='cmd', required=True)
    p = sp.add_parser('spec'); p.add_argument('out'); p.add_argument('--name', required=True); p.add_argument('--runner', required=True)
    p.add_argument('--fp8', default='3'); p.add_argument('--model', default='black-forest-labs/FLUX.2-klein-9B'); p.add_argument('--variant'); p.add_argument('--extra')
    for n in ('record', 'plan', 'touch'):
        p = sp.add_parser(n); p.add_argument('--jobs', required=True)
        if n != 'touch': p.add_argument('--spec', required=True); p.add_argument('--mosaics', required=True)
        if n == 'record': p.add_argument('--outs', required=True); p.add_argument('--run'); p.add_argument('--card')
        if n == 'plan': p.add_argument('--emit'); p.add_argument('--link'); p.add_argument('--card-strict'); p.add_argument('--tolerant', type=float, help='max |dRGB| of 64 px blocks (eras)')
        if n == 'touch': p.add_argument('--bt'); p.add_argument('--bids'); p.add_argument('--box'); p.add_argument('--z0', default='0'); p.add_argument('--z1', default='40')
    sp.add_parser('stats')
    o = ap.parse_args()
    {'spec': make_spec, 'record': record, 'plan': plan, 'touch': touch, 'stats': stats}[o.cmd](o)
