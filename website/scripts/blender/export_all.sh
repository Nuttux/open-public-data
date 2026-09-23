#!/bin/sh
# Re-export every scene the renders use, into the durable work folder.
W=/Users/daniel/code/qipu-render-work; B=/Users/daniel/code/opd-render/website/scripts/blender
cd /Users/daniel/code/opd-render/website
ex() { node --max-old-space-size=16000 scripts/blender/export_district.mjs "$2" "$3" "$4" "$W/$1" > "$W/export_$1.log" 2>&1; python3 "$B/water_mask.py" "$W/$1" >> "$W/export_$1.log" 2>&1; echo "$1 $(du -sh $W/$1/scene.json | cut -f1)"; }
ex alamo 300 1850 600
ex nbeach 2300 4800 850
ex mission 1100 200 650
ex castro -250 -150 800
ex marina -450 4950 750
SKIP=buildings,street-detail,bikeways,rail-history ex city 197 1190 7050
echo exports-done
