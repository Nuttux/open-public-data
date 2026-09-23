#!/bin/sh
# While a city pass runs: every 20 min, if a frame landed, rebuild the tiles
# (incremental) and upload them. The site shows them within 5 min (index.json).
#   NEW=<newest pass dir> OLD=<older pass dirs, comma> sh auto_tiles.sh
W=/Users/daniel/code/qipu-render-work; H=$(dirname "$0")
last=0
while :; do
  n=$(ls "$NEW" 2>/dev/null | grep -c '^f_z7_.*\.png$')
  if [ "$n" != "$last" ]; then
    python3 "$H/tiles_build.py" "$NEW${OLD:+,$OLD}" "$W/pyramid/tiles" --upload gs://qipu-tiles/us/sf/city/render 2>&1 | grep -E "pyramid|uploaded|Error|Traceback" | sed "s/^/$(date +%H:%M) $n new frames: /"
    last=$n
  fi
  [ "$n" -ge 64 ] && { echo "$(date +%H:%M) pass complete"; exit 0; }
  sleep 1200
done
