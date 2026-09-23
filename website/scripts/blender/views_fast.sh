#!/bin/sh
# The five judgement views, each at full detail, then crops into Downloads.
W=/Users/daniel/code/qipu-render-work; B=/Users/daniel/code/opd-render/website/scripts/blender
V=$W/views; D=~/Downloads/qipu-renders/views; mkdir -p $V $D
cd /Users/daniel/code/opd-render/website
ex() { [ -f "$W/$1/scene.json" ] || { node --max-old-space-size=16000 scripts/blender/export_district.mjs "$2" "$3" "$4" "$W/$1" > "$W/export_$1.log" 2>&1; python3 "$B/water_mask.py" "$W/$1" >> "$W/export_$1.log" 2>&1; }; echo "export $1 ok"; }
ex fidi 3700 3700 900
ex gg -3450 6400 1400
cd $W
# wait for the Painted Ladies render already running
while pgrep -f "hq_scene.py -- alamo" > /dev/null; do sleep 10; done
python3 $B/grade.py $W/zoom/ladies.png $V/1_painted_ladies.png 60 18 && echo "ladies graded"
run() { # file scene tx ty ortho box extra-env...
  f=$1; s=$2; tx=$3; ty=$4; o=$5; bx=$6; shift 6
  env BOX="$bx" CAM=map TX=$tx TY=$ty ORTHO=$o "$@" blender -b -P $B/hq_scene.py -- $s $V/$f.raw.png 64 3000 1875 > $V/$f.log 2>&1
  python3 $B/grade.py $V/$f.raw.png $V/$f.png 60 18
  echo "$f: $(grep -E 'RENDER|Error' $V/$f.log | tail -1)"
}
run 2_financial_district fidi 3650 3650 900 3150,3050,4250,4300
run 3_ferry_building_bay fidi 3950 3950 650 3600,3500,4350,4450
run 4_twin_peaks castro -800 -500 1000 -1350,-1150,-250,150 GRASS_DENSITY=1.5
run 5_golden_gate gg -3450 6450 1900 -4450,5200,-2450,7650 GRASS=0 SHRUBS=0
python3 - <<'PY'
import os
from PIL import Image
V = '/Users/daniel/code/qipu-render-work/views'; D = os.path.expanduser('~/Downloads/qipu-renders/views')
for f in sorted(os.listdir(V)):
    if not f.endswith('.png') or '.raw' in f: continue
    im = Image.open(f'{V}/{f}').convert('RGB'); n = f[:-4]
    im.save(f'{D}/{n}_full.jpg', quality=93)
    w, h = im.size
    for k, (cx, cy) in enumerate(((0.5, 0.5), (0.3, 0.35), (0.7, 0.65)), 1):
        x0, y0 = int(cx * w - 600), int(cy * h - 375)
        im.crop((x0, y0, x0 + 1200, y0 + 750)).save(f'{D}/{n}_zoom{k}_100pct.jpg', quality=93)
print('copied')
PY
echo "views done $(date)"
