"""ROOF_NAIP=1 (experiment): the roofs take the real roof seen from the air
(USDA NAIP 2022, public domain; baked by roof_naip_prep.py) over their
procedural material. Called from hq_scene's materials, once the region box
(hq_city's BOX) is known.

The region's image is cut from the city-wide mosaic (a sparse file on the SD
card) by the system Python, cached, and projected top-down by world XY on the
roof faces that look up (normal z > ~0.45): NAIP is an orthophoto, so the
planar projection is exact. Where the mosaic has no roof (alpha 0: towers,
unmeasured or mostly hidden roofs) the procedural roof stands. The procedural
normal (gravel, bitumen, tile relief) and roughness are kept, so our sun
shades the grain; a faint 12 cm grain multiplies the photo (0.6 m is softer
than our 0.37 m pixel).
"""
import os, json, hashlib, subprocess, time
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
PY = os.environ.get('RN_PYTHON', '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3')
DIR = os.environ.get('RN_DIR', '/Volumes/DANI-SD-DRIVE2/qipu-roofnaip')
ROOF_MATS = ('roof_flat', 'roof_big', 'roof_shingle', 'roof_tile')

def region_image(box):
    x0, y0, x1, y1 = [float(v) for v in box]
    key = hashlib.md5(f'{x0:.1f},{y0:.1f},{x1:.1f},{y1:.1f}'.encode()).hexdigest()[:12]
    out = f'{DIR}/crops/crop_{key}.png'
    mm = f'{DIR}/mosaic.u8'
    if not os.path.exists(mm): print('ROOF_NAIP: no mosaic at', mm, '- procedural roofs', flush=True); return None, None
    if not os.path.exists(out + '.json') or os.path.getmtime(out) < os.path.getmtime(mm):
        os.makedirs(f'{DIR}/crops', exist_ok=True); t0 = time.time()
        subprocess.run([PY, f'{HERE}/roof_naip_prep.py', 'crop', str(x0), str(y0), str(x1), str(y1), out], check=True)
        print(f'ROOF_NAIP: region image cut in {time.time() - t0:.0f}s', flush=True)
    return out, json.load(open(out + '.json'))

def attach(M, box, grain=0.12):
    if box is None: print('ROOF_NAIP: no region box, procedural roofs', flush=True); return
    path, meta = region_image(box)
    if path is None: return
    im = bpy.data.images.load(path, check_existing=True)
    im.alpha_mode = 'CHANNEL_PACKED'; im.colorspace_settings.name = 'sRGB'
    bx0, by0, bx1, by1 = meta['box']
    print('ROOF_NAIP:', os.path.basename(path), meta['w'], 'x', meta['h'], 'roof fraction', round(meta['frac'], 3), flush=True)
    for name in ROOF_MATS:
        m = M.get(name)
        if m is None: continue
        nt = m.node_tree; pr = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        bc = pr.inputs['Base Color']
        src = bc.links[0].from_socket if bc.links else None
        N = nt.nodes.new; L = nt.links.new
        geo = N('ShaderNodeNewGeometry')
        sp = N('ShaderNodeSeparateXYZ'); L(geo.outputs['Position'], sp.inputs[0])
        def lin(sock, a, b):
            n_ = N('ShaderNodeMapRange'); L(sock, n_.inputs[0]); n_.inputs[1].default_value = a; n_.inputs[2].default_value = b
            n_.inputs[3].default_value = 0.0; n_.inputs[4].default_value = 1.0; n_.clamp = False; return n_.outputs[0]
        uv = N('ShaderNodeCombineXYZ'); L(lin(sp.outputs[0], bx0, bx1), uv.inputs[0]); L(lin(sp.outputs[1], by0, by1), uv.inputs[1])
        tx = N('ShaderNodeTexImage'); tx.image = im; tx.interpolation = 'Linear'; tx.extension = 'CLIP'; L(uv.outputs[0], tx.inputs['Vector'])
        # only the faces that look up (roof planes, pitched to ~60 deg), not gables or parapet sides
        sn = N('ShaderNodeSeparateXYZ'); L(geo.outputs['Normal'], sn.inputs[0])
        up = N('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP'); L(sn.outputs[2], up.inputs[0])
        up.inputs[1].default_value = 0.40; up.inputs[2].default_value = 0.55
        a = N('ShaderNodeMath', operation='MULTIPLY'); L(tx.outputs['Alpha'], a.inputs[0]); L(up.outputs[0], a.inputs[1])
        # a faint 12 cm grain on the photo
        nz = N('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1 / 0.12; nz.inputs['Detail'].default_value = 2.0
        L(geo.outputs['Position'], nz.inputs['Vector'])
        gr = N('ShaderNodeMapRange'); L(nz.outputs['Fac'], gr.inputs[0]); gr.inputs[1].default_value = 0.3; gr.inputs[2].default_value = 0.7
        gr.inputs[3].default_value = 1.0 - grain; gr.inputs[4].default_value = 1.0 + grain
        mu = N('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY'); mu.inputs[0].default_value = 1.0
        L(tx.outputs['Color'], mu.inputs[6]); L(gr.outputs[0], mu.inputs[7])
        mx = N('ShaderNodeMix', data_type='RGBA', blend_type='MIX'); L(a.outputs[0], mx.inputs[0])
        if src is not None: L(src, mx.inputs[6])
        else: mx.inputs[6].default_value = tuple(bc.default_value)
        L(mu.outputs[2], mx.inputs[7])
        L(mx.outputs[2], bc)
