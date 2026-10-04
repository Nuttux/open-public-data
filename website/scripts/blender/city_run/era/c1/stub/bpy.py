"""CPU dry-run stub (C1): bpy.data.images.load for era._topo_load outside Blender (PIL; pixels bottom row first, RGBA float 0..1)."""
import numpy as np
from PIL import Image
class _Img:
    def __init__(self, p):
        a = np.asarray(Image.open(p).convert('RGBA'), np.float32)[::-1] / 255.0
        self.size = (a.shape[1], a.shape[0]); self._a = a.ravel()
        self.colorspace_settings = type('cs', (), {'name': ''})()
        self.pixels = self
    def foreach_get(self, out): out[:] = self._a
class _Images:
    def load(self, p): return _Img(p)
class data: images = _Images()
