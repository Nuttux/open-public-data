"""side_by_side.py <before.mp4> <before.timing.json> <after.mp4> <after.timing.json> <out.mp4> [w h]: a before | after video in
which BOTH halves show the same calendar year at every frame (the before is re-timed on the after's time curve: for each after
frame, the before frame whose year is nearest), each half labelled."""
import sys, json, subprocess, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
bv, bt, av, at, out = sys.argv[1:6]; W, H = (int(sys.argv[6]), int(sys.argv[7])) if len(sys.argv) > 7 else (1280, 720)
def frames(p):
    cap = cv2.VideoCapture(p); fs = []
    while True:
        ok, f = cap.read()
        if not ok: break
        fs.append(cv2.resize(f, (W, H), interpolation=cv2.INTER_AREA)[..., ::-1])
    return fs, cap.get(cv2.CAP_PROP_FPS)
B, bfps = frames(bv); A, afps = frames(av)
TB = json.load(open(bt)); TA = json.load(open(at))
tlb = np.array(TB['timeline']); tla = np.array(TA['timeline'])
yb = np.interp(np.arange(len(B)) / bfps, tlb[:, 0], tlb[:, 1]); ya = np.interp(np.arange(len(A)) / afps, tla[:, 0], tla[:, 1])
F = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', int(H * 0.034))
ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{2 * W + 8}x{H}', '-r', str(afps), '-i', '-',
                       '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
for k in range(len(A)):
    # the nearest before frame at the same year (monotone: never go back in the before's time)
    j = int(np.argmin(np.abs(yb - ya[k]) + 1e-6 * np.arange(len(B))))
    C = np.full((H, 2 * W + 8, 3), 255, np.uint8); C[:, :W] = B[j]; C[:, W + 8:] = A[k]
    im = Image.fromarray(C); d = ImageDraw.Draw(im)
    for x, txt in ((0, 'BEFORE (v4 film grammar)'), (W + 8, 'AFTER (transitions grammar)')):
        w = d.textlength(txt, font=F); d.rounded_rectangle((x + W - w - 34, 10, x + W - 10, 10 + int(H * 0.05)), 8, fill=(15, 15, 15)); d.text((x + W - w - 22, 14), txt, font=F, fill=(255, 225, 110))
    ff.stdin.write(im.tobytes())
ff.stdin.close(); ff.wait(); print(out, len(A), 'frames')
