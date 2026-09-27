"""qa_frames.py <out prefix> <n> <seed> <name=video.mp4> [<name=video.mp4> ...] [--crop 480x270] [--per 6]
RANDOM-sample QA of film versions on the SAME frames and crops (not hand-picked): n frame indices drawn with the seed over the
shortest video, one random native crop per frame, every version's crop side by side (native px), sheets of <per> samples each:
<out>_s<k>.jpg, and <out>_labels_template.json ({id: {frame, t, x, y, versions: {name: {s: [], note: ''}}}}).
Label with the QA vocabulary (ai/pilot/qa_audit.py S_KEYS: seam_hard, ghost, invented, anachron, warped, missing, ...; plus
'patch' = a flat CG / render patch or a synthetic fill that reads as pasted, 'smear' = a blurred or smeared area).
python3 qa_frames.py --count <labels.json>   -> structural count per version"""
import sys, json, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
if sys.argv[1] == '--count':
    L = json.load(open(sys.argv[2])); vs = {}
    for k, v in L.items():
        for name, lab in v['versions'].items():
            d = vs.setdefault(name, [0, 0, {}]); d[1] += 1
            if lab.get('s'): d[0] += 1
            for s in lab.get('s', []): d[2][s] = d[2].get(s, 0) + 1
    for name, (ns, n, kinds) in vs.items(): print(f'{name}: {ns}/{n} samples with a structural defect ({100 * ns / max(n, 1):.0f} %)', dict(sorted(kinds.items(), key=lambda x: -x[1])))
    sys.exit(0)
out, n, seed = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]); args = sys.argv[4:]
cw, ch = 480, 270; per = 6
if '--crop' in args: cw, ch = map(int, args[args.index('--crop') + 1].split('x')); args = [a for i, a in enumerate(args) if a != '--crop' and (i == 0 or args[i - 1] != '--crop')]
if '--per' in args: per = int(args[args.index('--per') + 1]); args = [a for i, a in enumerate(args) if a != '--per' and (i == 0 or args[i - 1] != '--per')]
V = [(a.split('=', 1)[0], a.split('=', 1)[1]) for a in args]
caps = {nm: cv2.VideoCapture(p) for nm, p in V}
N = min(int(c.get(cv2.CAP_PROP_FRAME_COUNT)) for c in caps.values()); fps = list(caps.values())[0].get(cv2.CAP_PROP_FPS)
W, H = int(list(caps.values())[0].get(cv2.CAP_PROP_FRAME_WIDTH)), int(list(caps.values())[0].get(cv2.CAP_PROP_FRAME_HEIGHT))
rng = np.random.default_rng(seed); fr = np.sort(rng.choice(np.arange(N), n, replace=False)); F = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 15)
tmpl = {}; rows = []
for k, f in enumerate(fr):
    x0, y0 = int(rng.integers(0, W - cw)), int(rng.integers(0, H - ch)); cells = []
    for nm, c in caps.items():
        c.set(cv2.CAP_PROP_POS_FRAMES, int(f)); ok, a = c.read(); im = Image.fromarray(np.ascontiguousarray(a[y0:y0 + ch, x0:x0 + cw, ::-1])); dr = ImageDraw.Draw(im)
        dr.rectangle((0, 0, 300, 19), fill=(0, 0, 0)); dr.text((4, 2), f'#{k + 1:02d} {nm} f{f} t{f / fps:.2f}', font=F, fill=(255, 255, 0)); cells.append(im)
    row = Image.new('RGB', (len(cells) * (cw + 6), ch), 'white')
    for i, im in enumerate(cells): row.paste(im, (i * (cw + 6), 0))
    rows.append(row); tmpl[f'{k + 1:02d}'] = dict(frame=int(f), t=round(f / fps, 2), x=x0, y=y0, versions={nm: dict(s=[], note='') for nm, _ in V})
for s in range(0, len(rows), per):
    part = rows[s:s + per]; S = Image.new('RGB', (part[0].width, len(part) * (ch + 6)), 'white')
    for i, r in enumerate(part): S.paste(r, (0, i * (ch + 6)))
    S.save(f'{out}_s{s // per + 1}.jpg', quality=90)
json.dump(tmpl, open(f'{out}_labels_template.json', 'w'), indent=1); print(out, len(fr), 'samples,', (len(rows) + per - 1) // per, 'sheets; frames', fr.tolist())
