"""CPU dry-run stub: mathutils.kdtree.KDTree on scipy (insert / balance / find / find_range), for era.infill etc. outside Blender."""
import numpy as np
from scipy.spatial import cKDTree
class KDTree:
    def __init__(self, n): self.p, self.i = [], []
    def insert(self, co, i): self.p.append(tuple(co)[:3]); self.i.append(i)
    def balance(self): self.t = cKDTree(np.array(self.p) if self.p else np.zeros((1, 3)))
    def find(self, co):
        d, k = self.t.query(tuple(co)[:3]); return (self.p[k], self.i[k], float(d))
    def find_range(self, co, r):
        return [(self.p[k], self.i[k], float(np.linalg.norm(np.subtract(self.p[k], tuple(co)[:3])))) for k in self.t.query_ball_point(tuple(co)[:3], r)]
