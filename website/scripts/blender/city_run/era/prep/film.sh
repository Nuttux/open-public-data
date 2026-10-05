#!/bin/zsh
# film.sh (qhprep): the qh era film from the prepared segments (final_all.sh has run), segments rendered in parallel.
#   zsh film.sh <name, e.g. qh_v1>      env: KEYS (default 1905 1906 1938 1959 1985 2006 2026), T=40 (s), PUSH=1.05, PAR=2 (segments at once,
#   ~15 GB RAM each), OUT (default ~/Downloads/qipu-renders/live_ai/era_anim/quarter_history)
# work files on the SSD: /Volumes/QIPU-SSD/era_anim_work/qh/films/<name>/ (plan, parts, logs); OUT gets <name>.mp4 + <name>_keys.jpg (the
# key-year frames) + <name>_plan.json. Never overwrites an existing name.
set -eu
D=/Users/daniel/code/qipu-render-work/era_anim; NAME=$1; KEYS=(${=${KEYS:-1905 1906 1938 1959 1985 2006 2026}}); PAR=${PAR:-2}
OUT=${OUT:-$HOME/Downloads/qipu-renders/live_ai/era_anim/quarter_history}; WQ=$(python3 -c "import sys; sys.path.insert(0,'${0:A:h}'); import common; print(common.WQ)"); F=$WQ/films/$NAME
[ -e $OUT/$NAME.mp4 ] || [ -e $F/$NAME.mp4 ] && { echo "$NAME exists: pick a new name"; exit 1; }
mkdir -p $F $OUT; KJ=${(j:,:)KEYS}; N=$((${#KEYS} - 1)); t0=$(date +%s)
cd $D && ERA_OUT=$F PLANONLY=1 python3 film.py $NAME $KJ > $F/plan.log 2>&1 || { tail -5 $F/plan.log; exit 1; }
grep "^film" $F/plan.log
part() { (cd $D && ERA_OUT=$F SEGI=$1 python3 film.py $NAME $KJ > $F/part$1.log 2>&1) || { echo "part $1 FAILED"; tail -3 $F/part$1.log; }; }
for i in $(seq 0 $((N - 1))); do part $i &; sleep 20; while [ $(jobs -r | wc -l) -ge $PAR ]; do sleep 5; done; done; wait
for i in $(seq 0 $((N - 1))); do [ -s $F/${NAME}_part$i.mp4 ] || { echo "part $i missing"; exit 1; }; grep -h keycheck $F/part$i.log; done
for i in $(seq 0 $((N - 1))); do echo "file '$F/${NAME}_part$i.mp4'"; done > $F/parts.txt
/opt/homebrew/bin/ffmpeg -loglevel error -f concat -safe 0 -i $F/parts.txt -c copy -movflags +faststart $F/$NAME.mp4
python3 - $F $NAME $N <<'PY'
import sys, numpy as np; from PIL import Image
F, n, N = sys.argv[1], sys.argv[2], int(sys.argv[3]); ims = [np.asarray(Image.open(f'{F}/{n}_part{i}_keys.jpg')) for i in range(N)]
Image.fromarray(np.concatenate(ims, 1)).save(f'{F}/{n}_keys.jpg', quality=85)
PY
cp $F/$NAME.mp4 $F/${NAME}_keys.jpg $OUT/; cp $F/${NAME}_plan.json $OUT/
echo "done $OUT/$NAME.mp4 ($(( $(date +%s) - t0 )) s)"
