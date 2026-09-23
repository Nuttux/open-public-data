#!/bin/sh
# The unattended finals: the city poster (tiled, stitched, graded), then the districts.
W=/Users/daniel/code/qipu-render-work; B=/Users/daniel/code/opd-render/website/scripts/blender
mkdir -p $W/final; cd $W
echo "city start $(date)"
env ORTHO=13600 TX=197 TY=1190 TILES=2 SUN_EL=24 blender -b -P $B/hq_city.py -- city $W/final/city 32 9600 6000 > $W/final/city.log 2>&1
python3 - <<'PY'
from PIL import Image
W = '/Users/daniel/code/qipu-render-work/final'
T = 2; tiles = [[Image.open(f'{W}/city_{y}_{x}.png').convert('RGB') for x in range(T)] for y in range(T)]
w, h = tiles[0][0].size; im = Image.new('RGB', (w * T, h * T))
for y in range(T):
    for x in range(T): im.paste(tiles[y][x], (x * w, y * h))
im.save(f'{W}/city_raw.png'); print('stitched', im.size)
PY
python3 $B/grade.py $W/final/city_raw.png $W/final/city.g.png 40 12
echo "city done $(date)"
sh $B/districts.sh d2 160
echo "all done $(date)"
