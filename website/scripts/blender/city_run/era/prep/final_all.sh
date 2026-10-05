#!/bin/zsh
# final_all.sh (qhprep): the paintings -> the engine inputs of every segment, then (with a name) the film. Fast to re-run: a segment whose
# three paintings (same size + mtime) and prep are unchanged since its last build is skipped.
#   zsh final_all.sh [film name, e.g. qh_v1]     env: PAINT (default /Volumes/QIPU-SSD/qipu-render-work/combo/block52/qh/paint), KEYS, T, PUSH, PAR, OUT (film.sh)
# PAINT/key_<Y>.png (the key-year layer, 10240 x 7168, L9 origin 112640,29696) for every key year incl. key_2026.png (= the v8 final
# layer) and PAINT/raw_<Y>.png (that year's raw AI quilt) for every key year but 2026.
# Per segment (Ya, Yb): build.py --base26 key_Yb --base85 raw_Ya --out85 key_Ya -> seg/<Ya>_<Yb>/in, downscale k=0.5 -> in_half,
# Grammar cache /Volumes/QIPU-SSD/era_anim_work/cache/qh_<Ya>_<Yb>.pkl (rebuilt); then film.sh <name>.
set -eu
D=/Users/daniel/code/qipu-render-work/era_anim; P=${0:A:h}; WQ=$(python3 -c "import sys; sys.path.insert(0,'$P'); import common; print(common.WQ)"); WP=${WPFX:-qh}
PAINT=${PAINT:-/Volumes/QIPU-SSD/qipu-render-work/combo/block52/qh/paint}; KEYS=(${=${KEYS:-1905 1906 1938 1959 1985 2006 2026}}); NAME=${1:-}
for f in key_${^KEYS}.png raw_${^KEYS[1,-2]}.png; do [ -f $PAINT/$f ] || { echo "missing $PAINT/$f"; exit 1; }; done
for ((i = 1; i < ${#KEYS}; i++)); do
  A=${KEYS[i]}; B=${KEYS[i+1]}; S=$WQ/seg/${A}_$B
  [ -f $S/work/stageA.npz ] && [ -f $S/in/events.json ] || { echo "segment $A->$B not prepared (run: zsh $P/prep_seg.sh $A $B)"; exit 1; }
  STAMP="$(stat -f '%z %m' $PAINT/key_$B.png $PAINT/raw_$A.png $PAINT/key_$A.png $S/work/stageA.npz $S/in/events.json | tr '\n' ' ')"
  if [ -f $S/work/final.stamp ] && [ "$(cat $S/work/final.stamp)" = "$STAMP" ] && [ -f $WQ/cache/${WP}_${A}_$B.pkl ]; then echo "== $A -> $B unchanged (skipped)"; continue; fi
  echo "== $A -> $B $(date +%H:%M:%S)"; rm -f $S/work/final.stamp
  SEG=${A}_$B python3 $P/build.py --base26 $PAINT/key_$B.png --base85 $PAINT/raw_$A.png --out85 $PAINT/key_$A.png > $S/work/build.log 2>&1 || { tail -5 $S/work/build.log; exit 1; }
  grep "out85 given\|mean|d| vs base" $S/work/build.log | cut -c1-200
  python3 $D/downscale_in.py $S/in $S/in_half 0.5 > /dev/null
  (cd $D && NOCACHE=1 python3 -c "import wins; wins.grammar_for('${WP}_${A}_$B')" > $S/work/grammar.log 2>&1) || { tail -5 $S/work/grammar.log; exit 1; }
  echo "$STAMP" > $S/work/final.stamp
done
[ -n "$NAME" ] && zsh $P/film.sh $NAME
echo "done $(date +%H:%M:%S)"
