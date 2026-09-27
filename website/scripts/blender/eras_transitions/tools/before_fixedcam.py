"""before_fixedcam.py <plan.json>: film2_v3.py (the v4 grammar) rendered with its camera LOCKED on plan['cam'][0] (for a
before/after at the same window): film2_v3's own code, with CAMS overridden after it is computed."""
import sys, numpy as np
src = open('/Users/daniel/code/qipu-render-work/eras2/film2_v3.py').read()
marker = "CAMS = np.array(CAMS)"
assert marker in src
src = src.replace(marker, marker + "\nCAMS[:] = np.array(P['cam'][0][1:], np.float64)[None, :]")
sys.argv = ['film2_v3.py', sys.argv[1]]
exec(compile(src, 'film2_v3.py', 'exec'), {'__name__': '__main__'})
