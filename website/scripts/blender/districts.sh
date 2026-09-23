#!/bin/sh
# Full-resolution modelled close-ups of several districts, one after another.
S=/Users/daniel/code/qipu-render-work
B=/Users/daniel/code/opd-render/website/scripts/blender
R="$S/final/$1"; SPP="${2:-160}"; mkdir -p "$R"; cd "$S"
run() { # name scene box tx ty ortho
  env BOX="$3" CAM=map TX="$4" TY="$5" ORTHO="$6" blender -b -P "$B/hq_scene.py" -- "$2" "$R/$1.png" "$SPP" 6000 3750 > "$R/$1.log" 2>&1
  python3 "$B/grade.py" "$R/$1.png" "$R/$1.g.png" 60 18
  echo "$1: $(grep -E 'RENDER|Error' "$R/$1.log" | tail -1)"
}
run alamo alamo 210,1600,610,2090 405 1830 300
run nbeach nbeach 2230,4560,2800,5360 2500 4900 320
run mission mission 880,-60,1420,580 1150 250 300
run castro castro -420,-380,120,240 -150 -100 320
run marina marina -760,4640,-140,5320 -450 4950 340
echo done
