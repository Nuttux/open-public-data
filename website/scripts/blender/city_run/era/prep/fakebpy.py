# fakebpy.py (b52eprep): a minimal bpy stand-in so era.py's _topo_load can read the topo sheets (PNG) outside Blender
# (without it era.topo_built returns 0 and the 1985 stand-in/Sanborn choice differs from the Blender render's)
import sys, types, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
class _Px:
    def __init__(s, a): s.a = a
    def foreach_get(s, out): out[:] = s.a.ravel()
class _Img:
    def __init__(s, path):
        im = Image.open(path); a = np.asarray(im.convert('RGBA'), np.float32) / 255.0      # Non-Color: raw values
        s.size = (im.size[0], im.size[1]); s.pixels = _Px(a[::-1].copy())                 # Blender: bottom row first
        s.colorspace_settings = types.SimpleNamespace(name='sRGB')
def install():
    if 'bpy' in sys.modules: return
    m = types.ModuleType('bpy'); m.data = types.SimpleNamespace(images=types.SimpleNamespace(load=lambda p: _Img(p))); sys.modules['bpy'] = m
install()
def gen_buildings():
    """snap gen_buildings importable outside Blender (split_lots / standin / pure-python helpers only): Vector and
    mathutils.geometry stubs next to stage.py's mathutils.kdtree stand-in"""
    sys.path.insert(0, '/Users/daniel/code/qipu-render-work/eras2/transitions'); import stage as S_
    S_._fake_mathutils(); m = sys.modules['mathutils']
    if not hasattr(m, 'Vector'): m.Vector = lambda *a, **k: None
    if 'mathutils.geometry' not in sys.modules:
        g = types.ModuleType('mathutils.geometry'); g.tessellate_polygon = lambda *a, **k: []; m.geometry = g; sys.modules['mathutils.geometry'] = g
    m.__path__ = []
    import common as _CM; sys.path.insert(0, _CM.SNAP); import gen_buildings as GB; return GB   # (era_auto) the area's snapshot
