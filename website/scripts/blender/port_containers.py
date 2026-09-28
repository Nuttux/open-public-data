"""PORT CONTAINER STACKS (assets_ground, 28/09; env PORT_BOXES=0 = off; today only).

Where: port_containers.json, made by qipu-render-work/assets_ground/tools/port_detect.py from the USGS 3DEP
LiDAR CA_SanFrancisco_1_B23 (2023, public domain: objects 2-12 m above the ground, off every building footprint,
not vegetation by NAIP 2022 NDVI) in the Pier 80 and Piers 90-96 yards; each box-like blob filled with 40 ft
(or 20 ft) slots, tiers from the LiDAR height, colours from NAIP 2022 matched to the shipping-line palette of
assets_live (life_boats.BOX_V3, exp/live-assets 68f4a3912).
What: ISO boxes 12.19 (6.06) x 2.44 x 2.59 m, stacked; corrugated sides and roof panels (an attribute
along each box drives the shader's ribs), the door end darker, weathering by noise."""
import os, json, math

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'port_containers.json')
HB, WB = 2.59, 2.44

def _lin(h):
    c = [int(h[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (c[0] * 1.05, c[1], c[2] * 0.92)      # (the V6 sky's blue cast on paint: a light warm gain)

def build(sc, ground0, box=None, log=print):
    if os.environ.get('PORT_BOXES', '1') != '1' or not os.path.exists(SRC): return None
    import bpy
    C = json.load(open(SRC))['containers']
    if box is not None:
        x0, y0, x1, y1 = box; C = [c for c in C if x0 - 20 < c['x'] < x1 + 20 and y0 - 20 < c['y'] < y1 + 20]
    if not C: return None
    V, F, FC, VU = [], [], [], []
    for c in C:
        a = c['a']; ux, uy = math.cos(a), math.sin(a); vx, vy = -uy, ux; L = c['L']
        g = ground0(c['x'], c['y'])
        for t, h in enumerate(c['c']):
            z0 = g + 0.03 + t * HB; z1 = z0 + HB - 0.02; col = _lin(h)
            P = []
            for s, q in ((-L / 2, -WB / 2), (L / 2, -WB / 2), (L / 2, WB / 2), (-L / 2, WB / 2)):
                P.append((c['x'] + ux * s + vx * q, c['y'] + uy * s + vy * q, s))
            k = len(V)
            for (x, y, s) in P: V.append((x, y, z0)); VU.append(s)
            for (x, y, s) in P: V.append((x, y, z1)); VU.append(s)
            dark = tuple(x * 0.72 for x in col)
            F += [(k + 4, k + 5, k + 6, k + 7), (k, k + 1, k + 5, k + 4), (k + 1, k + 2, k + 6, k + 5), (k + 2, k + 3, k + 7, k + 6), (k + 3, k, k + 4, k + 7)]
            FC += [col, col, dark, col, tuple(x * 0.9 for x in col)]     # the door end darker (the gear)
    me = bpy.data.meshes.new('port_boxes'); me.from_pydata(V, [], F); me.update()
    ca = me.color_attributes.new('bcol', 'FLOAT_COLOR', 'FACE')
    for i, col in enumerate(FC): ca.data[i].color = (*col, 1.0)
    at = me.attributes.new('cu', 'FLOAT', 'POINT'); at.data.foreach_set('value', VU)
    me.update()
    ob = bpy.data.objects.new('port_boxes', me); sc.collection.objects.link(ob); me.materials.append(_mat())
    log(f'port_containers: {len(C)} stacks, {len(FC) // 5} boxes')
    return ob

def _mat():
    import bpy
    m = bpy.data.materials.get('port_box')
    if m: return m
    m = bpy.data.materials.new('port_box'); m.use_nodes = True; nt = m.node_tree; pr = nt.nodes['Principled BSDF']
    N = nt.nodes.new; L = nt.links.new
    col = N('ShaderNodeAttribute'); col.attribute_name = 'bcol'
    cu = N('ShaderNodeAttribute'); cu.attribute_name = 'cu'
    # ribs: a sine along the box, 0.30 m pitch (the corrugation), deep enough to read at 9 cm/px
    mul = N('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 2 * math.pi / 0.30; L(cu.outputs['Fac'], mul.inputs[0])
    sn = N('ShaderNodeMath'); sn.operation = 'SINE'; L(mul.outputs[0], sn.inputs[0])
    rb = N('ShaderNodeMapRange'); rb.inputs[1].default_value = -1; rb.inputs[2].default_value = 1; rb.inputs[3].default_value = 0.84; rb.inputs[4].default_value = 1.04
    L(sn.outputs[0], rb.inputs[0])
    geo = N('ShaderNodeNewGeometry')
    nz = N('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.6; nz.inputs['Detail'].default_value = 4.0; L(geo.outputs['Position'], nz.inputs['Vector'])
    wr = N('ShaderNodeMapRange'); wr.inputs[3].default_value = 0.8; wr.inputs[4].default_value = 1.08; L(nz.outputs['Fac'], wr.inputs[0])
    k1 = N('ShaderNodeVectorMath'); k1.operation = 'SCALE'; L(col.outputs['Color'], k1.inputs[0]); L(rb.outputs[0], k1.inputs['Scale'])
    k2 = N('ShaderNodeVectorMath'); k2.operation = 'SCALE'; L(k1.outputs[0], k2.inputs[0]); L(wr.outputs[0], k2.inputs['Scale'])
    L(k2.outputs[0], pr.inputs['Base Color'])
    pr.inputs['Roughness'].default_value = 0.6; pr.inputs['Metallic'].default_value = 0.2
    bump = N('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.4; L(sn.outputs[0], bump.inputs['Height']); L(bump.outputs[0], pr.inputs['Normal'])
    return m
