#!/bin/sh
# One evaluation round: all six locations at 2400x1500, then two review sheets.
#   sh round.sh <round-name> [spp]
S=/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/2af8a356-3125-4a36-ad95-180e17e79d3a/scratchpad/blender
R="$S/rounds/$1"; SPP="${2:-64}"; mkdir -p "$R"
B=/Users/daniel/code/opd-render/website/scripts/blender/build_render.py
cd "$S"
for L in nbeach fidi castro marina mission alamo; do [ -f "$S/$L/sea.json" ] || python3 /Users/daniel/code/opd-render/website/scripts/blender/water_mask.py "$S/$L" >/dev/null; done
for L in nbeach fidi castro marina mission alamo; do
  env SUN_AZ="${SUN_AZ:-205}" SUN_EL="${SUN_EL:-17}" EXPO="${EXPO:-0.3}" blender -b -P "$B" -- "$L" photo "$R/$L.png" "$SPP" 2400 1500 2>&1 | grep -E "RENDER|Error|Traceback" | sed "s/^/$L: /"
done
for L in nbeach fidi castro marina mission alamo; do python3 /Users/daniel/code/opd-render/website/scripts/blender/grade.py "$R/$L.png" "$R/$L.g.png"; done
python3 - "$R" <<'PY'
import sys
from PIL import Image, ImageDraw
R = sys.argv[1]; locs = ['nbeach', 'fidi', 'castro', 'marina', 'mission', 'alamo']
full = Image.new('RGB', (2400, 1000), 'white'); crop = Image.new('RGB', (2400, 1000), 'white')
for i, l in enumerate(locs):
    im = Image.open(f'{R}/{l}.g.png').convert('RGB'); x, y = (i % 3) * 800, (i // 3) * 500
    full.paste(im.resize((800, 500), Image.LANCZOS), (x, y))
    w, h = im.size; crop.paste(im.crop((w // 2 - 400, h // 2 - 250, w // 2 + 400, h // 2 + 250)), (x, y))
    for sheet in (full, crop): ImageDraw.Draw(sheet).text((x + 8, y + 6), l, fill=(255, 255, 255))
full.save(f'{R}/sheet_full.jpg', quality=90); crop.save(f'{R}/sheet_crop.jpg', quality=92)
print('sheets written')
PY
