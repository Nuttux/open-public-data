#!/bin/sh
# Final delivery: every location at 4800x3000, then before/after and progress sheets,
# all copied to ~/Downloads/qipu-renders/final/.   sh final.sh [spp]
S=/Users/daniel/code/qipu-render-work
B=/Users/daniel/code/opd-render/website/scripts/blender
R="$S/rounds/final"; SPP="${1:-192}"; mkdir -p "$R"; D=~/Downloads/qipu-renders/final; mkdir -p "$D"
cd "$S"
for L in nbeach fidi castro marina mission alamo; do
  blender -b -P "$B/build_render.py" -- "$L" photo "$R/$L.png" "$SPP" 4800 3000 2>&1 | grep -E "RENDER|Error|Traceback" | sed "s/^/$L: /"
  python3 "$B/grade.py" "$R/$L.png" "$R/$L.g.png"
done
python3 - "$S" "$R" "$D" <<'PY'
import sys, os
from PIL import Image, ImageDraw, ImageFont
S, R, D = sys.argv[1:4]
names = {'nbeach': 'North Beach & Telegraph Hill', 'fidi': 'Financial District', 'castro': 'Castro & Twin Peaks',
         'marina': 'Marina & the bay', 'mission': 'Mission & Dolores Park', 'alamo': 'Alamo Square'}
try: F = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 44); f = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 30)
except Exception: F = f = ImageFont.load_default()
for i, (l, nm) in enumerate(names.items(), 1):
    im = Image.open(f'{R}/{l}.g.png').convert('RGB')
    im.save(f'{D}/{i}_{l}_final.jpg', quality=93)
    # before / after: the live engine's own frame, its centre 62 % (the render's framing)
    cur = f'{S}/{l}/current.png'
    if os.path.exists(cur):
        c = Image.open(cur).convert('RGB'); w, h = c.size; cw, ch = int(w * 0.62), int(w * 0.62 * 0.625)
        c = c.crop(((w - cw) // 2, (h - ch) // 2, (w + cw) // 2, (h + ch) // 2)).resize((2400, 1500), Image.LANCZOS)
        sh = Image.new('RGB', (4830, 1600), 'white'); dr = ImageDraw.Draw(sh)
        sh.paste(c, (0, 100)); sh.paste(im.resize((2400, 1500), Image.LANCZOS), (2430, 100))
        dr.text((10, 30), f'{nm} — today (live engine)', fill=(20, 20, 20), font=F); dr.text((2440, 30), 'Blender render, round 15', fill=(20, 20, 20), font=F)
        sh.save(f'{D}/{i}_{l}_before_after.jpg', quality=90)
# progress strip on one location
rounds = [('r00', 'round 0'), ('r05', 'round 5'), ('r10', 'round 10'), ('final', 'round 15')]
st = Image.new('RGB', (4 * 1200 + 90, 900), 'white'); dr = ImageDraw.Draw(st)
for j, (r, lab) in enumerate(rounds):
    p = f'{S}/rounds/{r}/alamo.g.png' if os.path.exists(f'{S}/rounds/{r}/alamo.g.png') else f'{S}/rounds/{r}/alamo.png'
    if not os.path.exists(p): continue
    a = Image.open(p).convert('RGB'); w, h = a.size
    a = a.crop((int(w * 0.3), int(h * 0.3), int(w * 0.7), int(h * 0.7))).resize((1200, 750), Image.LANCZOS)
    st.paste(a, (j * 1230, 110)); dr.text((j * 1230 + 8, 40), lab, fill=(20, 20, 20), font=F)
st.save(f'{D}/0_progress_alamo.jpg', quality=90)
print('delivered to', D)
PY
