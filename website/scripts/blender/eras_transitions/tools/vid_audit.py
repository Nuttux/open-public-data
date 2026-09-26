"""vid_audit.py <video.mp4> <out_dir> [label]: automatic transition audit of a film (camera may move).
For each frame pair: the camera motion (affine, ECC on a 1/2-res grey frame), the previous frame warped onto the current,
the residual |cur - warp(prev)| (max over RGB, 3x3 median). Per frame: residual energy, the largest blob over 40 levels
(a POP candidate: a region that changes by > 40 in ONE frame), and the 'slow-change' map (pixels that change 2-12 levels
per frame: cross-fade candidates, accumulated in stabilised coords is not needed: we report per-frame shares).
Writes <out>/<label>_frames.csv and <out>/<label>_events.json (top pops with frame, time, bbox, mean jump)."""
import sys, os, json, numpy as np, cv2
from scipy import ndimage as nd
vp, od = sys.argv[1], sys.argv[2]; lab = sys.argv[3] if len(sys.argv) > 3 else os.path.basename(vp)[:-4]
os.makedirs(od, exist_ok=True)
cap = cv2.VideoCapture(vp); fps = cap.get(cv2.CAP_PROP_FPS); prev = None; rows = []; ev = []; fi = -1
crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 60, 1e-5)
# captions/year label zones to ignore (top-left caption boxes, bottom-left year)
while True:
    ok, fr = cap.read()
    if not ok: break
    fi += 1; H, W = fr.shape[:2]
    ign = np.zeros((H, W), bool); ign[:110, :900] = True; ign[H - 90:, :260] = True
    g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    if prev is not None:
        pf, pg = prev
        M = np.eye(2, 3, dtype=np.float32)
        try:
            _, M = cv2.findTransformECC(g, pg, M, cv2.MOTION_AFFINE, crit, None, 5)
        except cv2.error:
            pass
        wp = cv2.warpAffine(pf, M, (W, H), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
        r = np.abs(fr.astype(np.int16) - wp.astype(np.int16)).max(-1).astype(np.uint8)
        r = cv2.medianBlur(r, 3); r[ign] = 0; r[:6] = 0; r[-6:] = 0; r[:, :6] = 0; r[:, -6:] = 0
        big = r > 40; lab_, n = nd.label(nd.binary_closing(big, iterations=2))
        top = []
        if n:
            ar = nd.sum(big, lab_, range(1, n + 1)); ob = nd.find_objects(lab_)
            for k in np.argsort(-ar)[:3]:
                if ar[k] < 60: break
                sl = ob[k]; top.append(dict(area=int(ar[k]), x0=sl[1].start, y0=sl[0].start, x1=sl[1].stop, y1=sl[0].stop,
                                             jump=float(r[sl][lab_[sl] == k + 1].mean())))
        slow = ((r >= 3) & (r <= 12)).mean()
        rows.append((fi, fi / fps, float(r.mean()), float((r > 40).mean()), float(slow), float(M[0, 2]), float(M[1, 2]), float(M[0, 0])))
        for t in top: ev.append(dict(frame=fi, t=round(fi / fps, 2), **t))
    prev = (fr, g)
np.savetxt(f'{od}/{lab}_frames.csv', np.array(rows), delimiter=',', fmt='%.4f', header='frame,t,res_mean,share_gt40,share_slow,dx,dy,scale')
ev.sort(key=lambda e: -e['area'] * e['jump'])
json.dump(ev[:200], open(f'{od}/{lab}_events.json', 'w'), indent=0)
print(lab, 'frames', fi + 1, 'events', len(ev)); print(json.dumps(ev[:12]))
