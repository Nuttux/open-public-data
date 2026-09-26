"""concat_timing.py <out.timing.json> <shot1.mp4> ... : the timeline (film second -> year) of shots cut together, from each
shot's own .timing.json and its duration (frames / fps)."""
import sys, json, cv2
out = sys.argv[1]; tl = []; t0 = 0.0
for v in sys.argv[2:]:
    cap = cv2.VideoCapture(v); n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); fps = cap.get(cv2.CAP_PROP_FPS)
    T = json.load(open(v[:-4] + '.timing.json'))['timeline']
    for s, y in T:
        if s <= n / fps + 1e-6: tl.append([round(t0 + s, 3), y])
    t0 += n / fps
json.dump(dict(timeline=tl), open(out, 'w')); print(out, len(tl), 'points,', round(t0, 2), 's')
