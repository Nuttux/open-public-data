"""BTEX_REAL=1 (realcolour pilot, variant B; default off): street photos
(KartaView, CC BY-SA 4.0) projected on the walls they see, baked offline by
qipu-render-work/realcolour/rc_build_b.py into one atlas (one rectified patch
per footprint wall: 0.3 m texels, delit, alpha = how well the wall was seen)
and btex_walls.json (wall ends, ground and top, atlas slot, photo ids).

assign_uv(me): gen_buildings.emit calls it on the wall meshes. Each vertical
face is matched to the footprint wall it lies on (parallel, within 1.6 m: the
bays, stoops and cornices included) and gets UV 'rtex' into that wall's patch
(along the wall, up from the ground); unmatched faces point at a transparent
texel. patch_materials(M): hq_scene calls it once; in the wall materials the
paint (the `bcol` attribute) becomes mix(bcol, atlas, atlas alpha), so the
procedural grain, bump and our sun still act on the projected photo.
REALCOL_LICENCE=open: reads btex_walls_open.json / btex_atlas_open.png if they
exist (no NC-derived patches; today every projected photo is BY-SA).
"""
import os, json
import numpy as np

WALL_MATS = ('siding', 'stucco', 'brick', 'concrete', 'trim', 'shingle')
# BTEX_MODE=shader (default): every facade material (the windows, doors, trims too)
# becomes the projected photo where the atlas has it; BTEX_MODE=paint: only the paint of the walls
FACADE_MATS = WALL_MATS + ('glass', 'shopglass', 'door', 'metal', 'stair', 'awning', 'curtain', 'curtain_wall', 'deck')
_ST = [0, 0, 0]
D_ = '/Users/daniel/code/qipu-render-work/realcolour/out'
_W = None


def _files():
    sfx = '_open' if os.environ.get('REALCOL_LICENCE') == 'open' and os.path.exists(f'{D_}/btex_walls_open.json') else ''
    return (os.environ.get('BTEX_FILE') or f'{D_}/btex_walls{sfx}.json', os.environ.get('BTEX_ATLAS') or f'{D_}/btex_atlas{sfx}.png')


def walls():
    global _W
    if _W is not None: return _W
    f, _ = _files()
    if not os.path.exists(f): print('BTEX_REAL: no', f, flush=True); _W = False; return _W
    d = json.load(open(f)); ws = d['walls']
    A = np.array([w['a'] for w in ws], float); B = np.array([w['b'] for w in ws], float)
    L = np.hypot(*(B - A).T); D = (B - A) / L[:, None]; N = np.c_[D[:, 1], -D[:, 0]]
    z0 = np.array([w['z0'] for w in ws]); z1 = np.array([w['z1'] for w in ws]); S = np.array([w['s'] for w in ws], float)
    CS = 2.0; gx0, gy0 = min(A[:, 0].min(), B[:, 0].min()) - 10, min(A[:, 1].min(), B[:, 1].min()) - 10
    nx = int((max(A[:, 0].max(), B[:, 0].max()) + 10 - gx0) // CS) + 1; ny = int((max(A[:, 1].max(), B[:, 1].max()) + 10 - gy0) // CS) + 1
    K = 8; grid = -np.ones((nx * ny, K), np.int32); fill = np.zeros(nx * ny, np.int32)
    for k in range(len(ws)):
        ts = np.r_[np.arange(0, L[k], 1.0), L[k]]
        P = (A[k] + D[k] * ts[:, None])[:, None, :] + N[k] * np.array([-1.8, -0.9, 0.0, 0.9, 1.8])[None, :, None]
        c = np.unique(((P[..., 0] - gx0) // CS).astype(int) * ny + ((P[..., 1] - gy0) // CS).astype(int))
        for ci in c:
            if fill[ci] < K: grid[ci, fill[ci]] = k; fill[ci] += 1
    _W = dict(A=A, D=D, N=N, L=L, z0=z0, z1=z1, S=S, AW=float(d['W']), AH=float(d['H']), grid=grid, gx0=gx0, gy0=gy0, nx=nx, ny=ny, CS=CS)
    print('BTEX_REAL: walls', len(ws), 'atlas', d['W'], d['H'], flush=True)
    return _W


def assign_uv(me):
    W = walls()
    if not W: return
    npl = len(me.polygons)
    if npl == 0: return
    nrm = np.empty(npl * 3, np.float32); me.polygons.foreach_get('normal', nrm); nrm = nrm.reshape(-1, 3)
    cen = np.empty(npl * 3, np.float32); me.polygons.foreach_get('center', cen); cen = cen.reshape(-1, 3).astype(float)
    ls = np.empty(npl, np.int32); me.polygons.foreach_get('loop_start', ls)
    lt = np.empty(npl, np.int32); me.polygons.foreach_get('loop_total', lt)
    nl = len(me.loops); lv = np.empty(nl, np.int32); me.loops.foreach_get('vertex_index', lv)
    co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3).astype(float)
    ix = ((cen[:, 0] - W['gx0']) // W['CS']).astype(int); iy = ((cen[:, 1] - W['gy0']) // W['CS']).astype(int)
    inb = (ix >= 0) & (ix < W['nx']) & (iy >= 0) & (iy < W['ny']) & (np.abs(nrm[:, 2]) < 0.3)
    cell = np.where(inb, ix * W['ny'] + iy, 0)
    cand = np.where(inb[:, None], W['grid'][cell], -1)
    best = -np.ones(npl, np.int64); bd = np.full(npl, 9.0)
    nxy = nrm[:, :2] / np.maximum(np.linalg.norm(nrm[:, :2], axis=1, keepdims=True), 1e-6)
    for j in range(cand.shape[1]):
        k = cand[:, j]; v = k >= 0; kk = np.maximum(k, 0)
        rel = cen[:, :2] - W['A'][kk]
        t = (rel * W['D'][kk]).sum(1); dn = np.abs((rel * W['N'][kk]).sum(1))
        par = np.abs((nxy * W['N'][kk]).sum(1))
        ok = v & (par > 0.9) & (dn < 1.6) & (t > -0.4) & (t < W['L'][kk] + 0.4) & (cen[:, 2] > W['z0'][kk] - 1.0) & (cen[:, 2] < W['z1'][kk] + 1.5) & (dn < bd)
        best = np.where(ok, k, best); bd = np.where(ok, dn, bd)
    pi = np.repeat(np.arange(npl), lt)
    wk = best[pi]; m = wk >= 0; kk = np.maximum(wk, 0)
    P = co[lv]
    t = np.clip(((P[:, :2] - W['A'][kk]) * W['D'][kk]).sum(1) / W['L'][kk], 0, 1)
    s = np.clip((P[:, 2] - W['z0'][kk]) / np.maximum(W['z1'][kk] - W['z0'][kk], 0.1), 0, 1)
    S = W['S'][kk]
    u = np.where(m, (S[:, 0] + t * S[:, 2]) / W['AW'], 2.0 / W['AW'])
    v = np.where(m, 1.0 - (S[:, 1] + (1 - s) * S[:, 3]) / W['AH'], 1.0 - 2.0 / W['AH'])
    uvl = me.uv_layers.new(name='rtex')
    uvl.data.foreach_set('uv', np.c_[u, v].astype(np.float32).ravel())
    _ST[0] += npl; _ST[1] += int(inb.sum()); _ST[2] += int((best >= 0).sum())
    print(f'BTEX_REAL uv {me.name}: faces {npl}, vertical {int(inb.sum())}, matched {int((best >= 0).sum())} (total {_ST})', flush=True)
    return int((best >= 0).sum())


def patch_materials(M, k=None):
    """paint mode: bcol -> mix(bcol, atlas, alpha) in the wall materials.
    shader mode (default): in every facade material, the surface becomes
    mix(original shader, a matte photo shader, alpha): where a photo saw the
    face, the photo IS the facade (windows, trims, signs), lit by our sun.
    BTEX_DEBUG=unlit: the atlas as emission (black where no photo): what it holds."""
    import bpy
    _, atlas = _files()
    if not os.path.exists(atlas): print('BTEX_REAL: no atlas', atlas, flush=True); return
    img = bpy.data.images.load(atlas, check_existing=True); img.alpha_mode = 'STRAIGHT'
    k = float(os.environ.get('BTEX_K', 1.0)) if k is None else k
    mode = os.environ.get('BTEX_MODE', 'shader'); dbg = os.environ.get('BTEX_DEBUG') == 'unlit'
    for name in (FACADE_MATS if (mode == 'shader' or dbg) else WALL_MATS):
        m = M.get(name)
        if m is None or not m.use_nodes: continue
        nt = m.node_tree; N = nt.nodes.new; L = nt.links.new
        uvn = N('ShaderNodeUVMap'); uvn.uv_map = 'rtex'
        tx = N('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Linear'; tx.extension = 'EXTEND'
        L(uvn.outputs['UV'], tx.inputs['Vector'])
        fac = N('ShaderNodeMath'); fac.operation = 'MULTIPLY'; fac.inputs[1].default_value = k; L(tx.outputs['Alpha'], fac.inputs[0])
        if mode == 'paint' and not dbg:
            for at in [n for n in nt.nodes if n.type == 'ATTRIBUTE' and n.attribute_name == 'bcol']:
                links = list(at.outputs['Color'].links)
                if not links: continue
                mx = N('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MIX'
                L(fac.outputs[0], mx.inputs[0]); L(at.outputs['Color'], mx.inputs[6]); L(tx.outputs['Color'], mx.inputs[7])
                for l in links:
                    to = l.to_socket; nt.links.remove(l); L(mx.outputs[2], to)
            continue
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
        src = out.inputs['Surface'].links[0].from_socket if out.inputs['Surface'].links else None
        if dbg:
            cm = N('ShaderNodeMix'); cm.data_type = 'RGBA'; cm.blend_type = 'MULTIPLY'; cm.inputs[0].default_value = 1.0
            L(tx.outputs['Color'], cm.inputs[6]); L(fac.outputs[0], cm.inputs[7])
            em = N('ShaderNodeEmission'); L(cm.outputs[2], em.inputs['Color']); L(em.outputs[0], out.inputs['Surface']); continue
        ph = N('ShaderNodeBsdfPrincipled'); L(tx.outputs['Color'], ph.inputs['Base Color'])
        ph.inputs['Roughness'].default_value = 0.8; ph.inputs['Specular IOR Level'].default_value = 0.3
        ms = N('ShaderNodeMixShader'); L(fac.outputs[0], ms.inputs[0])
        if src is not None: L(src, ms.inputs[1])
        L(ph.outputs[0], ms.inputs[2]); L(ms.outputs[0], out.inputs['Surface'])
    print('BTEX_REAL: facade materials patched', mode, 'unlit' if dbg else '', atlas, flush=True)


ROOF_MATS = ('roof_flat', 'roof_big', 'roof_shingle', 'roof_tile')


def patch_roofs(M):
    """the roofs seen by the registered drone obliques (rc_build_aer.py): a
    world-XY layer mixed over the roof paint by its alpha on the faces that
    look up (the ROOF_NAIP recipe, its image replaced by the projected photos)"""
    import bpy
    sfx = '_open' if os.environ.get('REALCOL_LICENCE') == 'open' else ''
    jf, pf = f'{D_}/btex_roof{sfx}.json', f'{D_}/btex_roof{sfx}.png'
    if os.environ.get('BTEX_ROOF'): jf, pf = os.environ['BTEX_ROOF'] + '.json', os.environ['BTEX_ROOF'] + '.png'
    if not os.path.exists(jf): print('BTEX_REAL: no roof layer', jf, flush=True); return
    meta = json.load(open(jf)); bx0, by0, bx1, by1 = meta['box']
    im = bpy.data.images.load(pf, check_existing=True); im.alpha_mode = 'CHANNEL_PACKED'
    for name in ROOF_MATS:
        m = M.get(name)
        if m is None: continue
        nt = m.node_tree; pr = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        bc = pr.inputs['Base Color']; src = bc.links[0].from_socket if bc.links else None
        N = nt.nodes.new; L = nt.links.new
        geo = N('ShaderNodeNewGeometry'); sp = N('ShaderNodeSeparateXYZ'); L(geo.outputs['Position'], sp.inputs[0])
        def lin(sock, a, b):
            n_ = N('ShaderNodeMapRange'); L(sock, n_.inputs[0]); n_.inputs[1].default_value = a; n_.inputs[2].default_value = b
            n_.inputs[3].default_value = 0.0; n_.inputs[4].default_value = 1.0; n_.clamp = False; return n_.outputs[0]
        uv = N('ShaderNodeCombineXYZ'); L(lin(sp.outputs[0], bx0, bx1), uv.inputs[0]); L(lin(sp.outputs[1], by0, by1), uv.inputs[1])
        tx = N('ShaderNodeTexImage'); tx.image = im; tx.interpolation = 'Linear'; tx.extension = 'CLIP'; L(uv.outputs[0], tx.inputs['Vector'])
        sn = N('ShaderNodeSeparateXYZ'); L(geo.outputs['Normal'], sn.inputs[0])
        up = N('ShaderNodeMapRange'); up.interpolation_type = 'SMOOTHSTEP'; L(sn.outputs[2], up.inputs[0])
        up.inputs[1].default_value = 0.40; up.inputs[2].default_value = 0.55
        a = N('ShaderNodeMath'); a.operation = 'MULTIPLY'; L(tx.outputs['Alpha'], a.inputs[0]); L(up.outputs[0], a.inputs[1])
        mx = N('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MIX'; L(a.outputs[0], mx.inputs[0]); L(tx.outputs['Color'], mx.inputs[7])
        if src is not None: L(src, mx.inputs[6])
        else: mx.inputs[6].default_value = tuple(bc.default_value)
        L(mx.outputs[2], bc)
        if os.environ.get('BTEX_DEBUG') == 'unlit':
            out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
            cm = N('ShaderNodeMix'); cm.data_type = 'RGBA'; cm.blend_type = 'MULTIPLY'; cm.inputs[0].default_value = 1.0
            L(tx.outputs['Color'], cm.inputs[6]); L(a.outputs[0], cm.inputs[7])
            em = N('ShaderNodeEmission'); L(cm.outputs[2], em.inputs['Color']); L(em.outputs[0], out.inputs['Surface'])
    print('BTEX_REAL: roof layer', pf, meta['w'], 'x', meta['h'], flush=True)
