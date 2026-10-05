#!/bin/zsh
# prep_all.sh (qhprep): everything that needs no painting, for the whole chain, from one set of render mosaics.
#   zsh prep_all.sh        env: RENDERS (default /Volumes/QIPU-SSD/qipu-render-work/combo/block52/qh2: blk_<Y>/ for every key year incl. 2026),
#                          KEYS (default 1905 1906 1938 1959 1985 2006 2026), IDS=1 to regenerate the prisms too (ids.py, date fixes of ERA_OVERLAY)
# -> years/<Y>/ (R.npy, Cc.npy, prisms.pkl), align lines (prisms vs the render's building classes), seg/<Ya>_<Yb>/ (prep + events) for each pair
set -eu
P=${0:A:h}; RENDERS=${RENDERS:-/Volumes/QIPU-SSD/qipu-render-work/combo/block52/qh2}
KEYS=(${=${KEYS:-1905 1906 1938 1959 1985 2006 2026}})
for Y in $KEYS; do [ -f $RENDERS/blk_$Y/meta.json ] || { echo "missing $RENDERS/blk_$Y"; exit 1; }; done
for Y in $KEYS; do
  [ "${IDS:-0}" = 1 ] && python3 $P/ids.py $Y 2>&1 | grep "^$Y"
  python3 $P/mosaic.py $Y $RENDERS/blk_$Y | cut -c1-120
done
python3 $P/align.py $KEYS | cut -c1-140
for ((i = 1; i < ${#KEYS}; i++)); do echo "=== ${KEYS[i]} ${KEYS[i+1]} $(date +%H:%M)"; zsh $P/prep_seg.sh ${KEYS[i]} ${KEYS[i+1]} 2>&1 | grep -v "^  region"; done
echo "prep_all done $(date +%H:%M)"
