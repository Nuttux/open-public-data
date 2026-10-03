#!/bin/sh
# mksnap.sh <repo worktree> <commit> <name> [KEY=VAL …]  — a FROZEN render snapshot:
#   the scripts at <commit> (git archive), and every live data file they read
#   from qipu-render-work copied in, the snapshot's own .py copies re-pointed
#   at the copies. A pass then reads one version of everything, whatever the
#   agents change meanwhile (24/09 03:50). Static data (city/scene.json, the
#   3DEP tiles landmarks/dem, Poly Haven assets) stays shared.
set -e
# (git copy, 03/10 B1) = qipu-render-work/mksnap.sh of 29/09 for San Francisco (CITY unset: byte-identical steps), plus:
#   CITY=<city>  another city: citysnap.sh (its data paths re-pointed at qipu-render-work/cities/<city>/, SF-only switches off,
#                city.json env + the given switches as defaults; the doubled cities/<city>/cities/ path check of 25/09 kept)
#   SNAP_ROOT=<dir>  write the snapshot there instead of qipu-render-work/snap (identity checks, dry runs)
REPO=$1; C=$2; N=$3; shift 3; W=/Users/daniel/code/qipu-render-work; S=${SNAP_ROOT:-$W/snap}/$N
if [ "${CITY:-sf}" != sf ]; then CITYSNAP_REPO=$REPO exec sh "$(dirname "$0")/citysnap.sh" $CITY $N $C "$@"; fi
# the PRODUCTION switches by default (25/09: landmark snapshots made without CANOPY/FRESH rendered sheets with
# the big trees and the new buildings missing). Given switches come first, so they win (setdefault order);
# PROD=0 for a bare snapshot.
[ "${PROD:-1}" = 0 ] || set -- "$@" ROOFS=1 CANOPY=1 FRESH=1 ROOFS_FILE=$S/data/roofs/roofs_v8.json
mkdir -p $S/data
(cd $REPO && git archive $C website/scripts/blender) | tar -x -C $S --strip-components=3
cp $W/landmarks/skip_gids.json $S/
# data frozen: directories and single files, relative to qipu-render-work
for p in life freeways veg ground water places critic/osm history/masks newbuildings/osm_records.json roofs/roofs.json roofs/roofs_v5.json roofs/roofs_v7.json roofs/roofs_v8.json \
         landmarks/water.json landmarks/coast_land.npz landmarks/footprints.json landmarks/palms.json landmarks/bathy_8m.npy landmarks/bathy_8m.json landmarks/piers.json landmarks/skip_gids.json transit/transit.json transit/rail_osm.json lidar/roofs_lidar_city.json rows/party_gaps.json rows/builder_rows.json realcolour/out fresh sanborn/lost_buildings.geojson sanborn/lost_buildings_contradicted_records.json; do
  [ -e $W/$p ] || continue
  # -L (29/09, SSD migration): ground/life/places/veg/water became symlinks to /Volumes/QIPU-SSD; a copied LINK is dangling on a pod
  # (combo5: veg.npz not found). Dereference: real data in the snapshot; -c still clones on the same volume (a real copy across volumes)
  mkdir -p $S/data/$(dirname $p); cp -RLc $W/$p $S/data/$p   # APFS clone: no disk until a file changes (24/09, disk full at 45 GB of snapshots)
  # re-point the snapshot's scripts (only exact prefixes of this item)
  grep -rl "qipu-render-work/$p" $S/*.py 2>/dev/null | while read f; do
    sed -i '' "s#/Users/daniel/code/qipu-render-work/$p#$S/data/$p#g" "$f"
  done
done
rm -rf $S/data/veg/look     # old look PNGs (212 MB): not read by a render, and they bloat the cloud pack
# never a link out of the snapshot (a pod has none of the Mac's paths): fail loudly
find $S/data -type l > $S/.links.txt; : > $S/.bad.txt
while read l; do t=$(cd "$(dirname "$l")" && realpath "$(readlink "$l")" 2>/dev/null) || t='?'
  case "$t" in "$S"/*) ;; *) echo "$l -> $t" >> $S/.bad.txt ;; esac
done < $S/.links.txt
if [ -s $S/.bad.txt ]; then echo "mksnap: links out of the snapshot (dangling on a pod):"; head -20 $S/.bad.txt; exit 1; fi
rm -f $S/.links.txt $S/.bad.txt
# the history masks: era.py reads TOPO_DIR (director passes <snap>/masks)
[ -d $S/data/history/masks ] && ln -sfn $S/data/history/masks $S/masks
# the pass's switches (ROOFS=1, NEWB=1, ROAD_K=1.4 …), written into the
# snapshot's hq_city.py as defaults: a pass needs no environment of its own
if [ $# -gt 0 ]; then
  python3 - "$S/hq_city.py" "$@" <<'PY'
import sys
p = sys.argv[1]; kv = [a.split('=', 1) for a in sys.argv[2:]]
s = open(p).read()
pre = "import os as _os_snap\n" + "".join(f"_os_snap.environ.setdefault({k!r}, {v!r})\n" for k, v in kv)
lines = s.split('\n'); i = 0
while i < len(lines) and (lines[i].startswith('#') or lines[i].startswith('\"\"\"') or lines[i].strip() == ''): i += 1
# after the module docstring if any: simplest safe place is the very top
open(p, 'w').write(pre + s)
PY
  echo "switches: $*" >> $S/SNAPSHOT.txt.pre
fi
python3 -c "import ast,glob; [ast.parse(open(f).read()) for f in glob.glob('$S/*.py')]"
echo "$N = $C ($(cd $REPO && git log --oneline -1 $C | cut -c1-80))" > $S/SNAPSHOT.txt; [ -f $S/SNAPSHOT.txt.pre ] && cat $S/SNAPSHOT.txt.pre >> $S/SNAPSHOT.txt && rm $S/SNAPSHOT.txt.pre
grep -rn "qipu-render-work/" $S/*.py | grep -v "$S/data" | grep -vE "qipu-render-work/(city|landmarks/dem|snap|qipu-assets)" | cut -c1-140 > $S/LIVE_PATHS.txt || true
echo "$S  ($(du -sh $S | cut -f1)); still-live paths: $(wc -l < $S/LIVE_PATHS.txt)"
