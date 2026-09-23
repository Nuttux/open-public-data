#!/bin/sh
# Level-7 frames of the site's tile pyramid, one queue slot each, the city's
# middle first (so what shows up early is the part people look at).
W=/Users/daniel/code/qipu-render-work; Q=/Users/daniel/code/opd-render/website/scripts/blender
# the scripts come from a FROZEN snapshot (SNAP): every frame of one pass must
# be drawn by the same code, or the frames disagree at their seams
B=${SNAP:?set SNAP to a snapshot of the scripts}
# OUT: a new pass writes to its own folder; tiles_build.py takes each frame
# from the newest pass that has it, so the site has no hole while it runs
R=${OUT:-$W/pyramid/z7}; mkdir -p $R; cd $W
SPP=${SPP:-20}
ORDER=$(python3 -c "
fr=[(i,j) for j in range(8) for i in range(8)]
fr.sort(key=lambda f: (f[0]-4.2)**2 + (f[1]-3.2)**2)
print(' '.join(f'{i}:{j}' for i,j in fr))")
for f in $ORDER; do
  i=${f%:*}; j=${f#*:}
  [ -f "$R/f_z7_${i}_${j}.png" ] && continue
  sh $Q/gpuq.sh "city $f" env MODE=pyramid Z=7 ONLY=$f blender -b -P $B/hq_city.py -- city $R/f $SPP 5120 3072 > $R/f_${i}_${j}.log 2>&1
  echo "$(date +%H:%M) frame $f $(grep -o 'frame [0-9],[0-9]: [0-9.]*s' $R/f_${i}_${j}.log)"
done
echo "z7 done $(date)"
