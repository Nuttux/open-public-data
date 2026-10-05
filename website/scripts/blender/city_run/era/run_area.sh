#!/bin/zsh
# era_auto run_area.sh: ONE command for an area's key years and film. Every step is automatic (rules + data; no per-place fixes).
#   zsh run_area.sh <area.json> <step> [years]      years: e.g. "1985 2006" (key years besides 2026; the film chains them to 2026)
# steps (in order; GPU steps write a LAUNCH_<step>.sh with a balance check, and run it only when RUN_GPU=1):
#   render   jobs for the years (auto_jobs.py) + LAUNCH_render.sh (auto_render.sh, PAR 1, lmk pods, outputs fetched per pod)
#   prep     per year: mosaic of the render, prisms (ids.py), engine core crop (mosaic.py), segment (Y, 2026) prep, the MASK (keys.py rules)
#   ai       one AI window per year (tiles touching the masks) + LAUNCH_ai.sh (auto_ai.sh: one Vast 5090 per year, pulls every 5 min)
#   keys     today's core, post (quilt + finish), the key rules (K1-K3), the anachronism CHECK with the automatic re-paint, check again
#   film     the chain's segments (prep, switch dates tsw.py, final_all), the film (GRADE=1, TSW_DIR) + a sheet
set -eu
eval "$(python3 ${0:A:h}/eracity.py sh)"   # per city: ERA_SNAP, ERA_OVERLAY (CITY unset = SF's literals); the prep tools are this folder's prep/ (city-aware copies)  # ERA_CITY
A=$1; STEP=$2; YS=(${=${3:-1985 2006}}); export ERA_AREA=$A
D=${0:A:h}; P=$D/prep; W=/Users/daniel/code/qipu-render-work
RUN=$(python3 -c "import json;print(json.load(open('$A'))['RUN'])"); WQ=$(python3 -c "import json;print(json.load(open('$A'))['WQ'].rstrip('/'))")
TAG=$(python3 -c "import json;a=json.load(open('$A'));print(a['tag'])"); OVL=$(python3 -c "import json;a=json.load(open('$A'));print(a.get('overlay',''))"); SNAPN=$(python3 -c "import json;a=json.load(open('$A'));print(a.get('snap','$ERA_SNAP'))"); IT=$(python3 -c "import json;a=json.load(open('$A'));print(a['iter'])")
WPFX=$(python3 -c "import json;a=json.load(open('$A'));print(a['wpfx'])"); export WPFX
mkdir -p $RUN $WQ; say() { echo "$(date +%H:%M:%S) [run_area $IT $STEP] $*" | tee -a $RUN/run_area.log; }
case $STEP in
render)
  python3 $D/auto_jobs.py $A $RUN/jobs ${(j:,:)YS} ${NPODS:-4}
  cat > $RUN/LAUNCH_render.sh <<EOF
#!/bin/zsh
# era_auto $IT: render ${YS} of the area (auto_render.sh, PAR 1 on 24/48 GB lmk pods). Balance first; never start a run the balance can't finish.
export CITY=$ERA_CITY   # the city this launcher was written for  # ERA_CITY
cd $W; python3 cloud/pod.py balance; python3 speed/vast/vast.py credit
MAXH=${MAXH:-1.2} SNAPN=$SNAPN nohup zsh $D/auto_render.sh $RUN ea${IT}r$(date +%H%M) ${NPODS:-4} '$TAG*' $OVL > /dev/null 2>&1 &
# watcher: tail -F $RUN/render.log | grep -E --line-buffered "ready|rendered|failed|no pod|DONE|down|Traceback|scp|link"
EOF
  chmod +x $RUN/LAUNCH_render.sh; say "wrote $RUN/LAUNCH_render.sh"
  [ "${RUN_GPU:-0}" = 1 ] && zsh $RUN/LAUNCH_render.sh ;;
prep)
  [ -f $WQ/years/2026/Cc.npy ] || { python3 $P/ids.py 2026 | tail -1; python3 $P/mosaic.py 2026 $(python3 -c "import json;print(json.load(open('$A'))['V8'])")/blk | cut -c1-80; }
  [ -f $RUN/paint/key_2026.png ] || python3 $D/keys.py today     # the masks read today's painting (M10)
  for Y in $YS; do
    say "prep $Y"
    [ -f $RUN/ctx_$Y/R_pt.jpg ] || python3 $D/keys.py mosaic $Y | tail -1
    python3 $P/ids.py $Y | tail -1; python3 $P/mosaic.py $Y $RUN/blk_$Y | cut -c1-80
    zsh $P/prep_seg.sh $Y 2026 > $RUN/prep_seg_${Y}_2026.log 2>&1 || { say "prep_seg $Y 2026 FAILED"; tail -5 $RUN/prep_seg_${Y}_2026.log; exit 1; }
    python3 $D/keys.py mask $Y | tail -1 | tee -a $RUN/run_area.log
  done ;;
ai)
  for Y in $YS; do python3 $D/keys.py ai $Y $RUN/aiv_$Y QV${TAG}$Y | tail -1; done   # env MISSING=1: only tiles not in tiles_new yet (a re-run)
  cat > $RUN/LAUNCH_ai.sh <<EOF
#!/bin/zsh
# era_auto $IT: AI paint of the masked tiles, one Vast 5090 card per year (gpu.py, RunPod fallback), pulled every 5 min, cards down at the end.
export CITY=$ERA_CITY   # the city this launcher was written for  # ERA_CITY
cd $W; python3 cloud/pod.py balance; python3 speed/vast/vast.py credit
nohup zsh $D/auto_ai.sh $RUN ea${IT}v$(date +%H%M) ${YS} > /dev/null 2>&1 &
# watcher: tail -F $RUN/ai_ea${IT}v$(date +%H%M).log | grep -E --line-buffered "up|done|DONE|no pod|failed|short|Traceback|down"
EOF
  chmod +x $RUN/LAUNCH_ai.sh; say "wrote $RUN/LAUNCH_ai.sh ($(for Y in $YS; do echo -n "y$Y=$(grep -c '^C9:' $RUN/aiv_$Y/P.txt) "; done)tiles)"
  [ "${RUN_GPU:-0}" = 1 ] && zsh $RUN/LAUNCH_ai.sh ;;
keys)
  [ -f $RUN/paint/key_2026.png ] || python3 $D/keys.py today
  for Y in $YS; do
    say "keys $Y"; python3 $D/keys.py post $Y > $RUN/post_$Y.log 2>&1 || { say "post $Y FAILED"; tail -5 $RUN/post_$Y.log; exit 1; }
    python3 $D/keys.py rules $Y | tail -1 | tee -a $RUN/run_area.log
    python3 $D/check.py $Y --fix | tail -2 | tee -a $RUN/run_area.log || true
    python3 $D/check.py $Y --out $RUN/checks/check2_$Y | tail -1 | tee -a $RUN/run_area.log || true
  done ;;
film)
  CH=($YS 2026); NAME=${4:-ea_${IT}_$(date +%H%M)}
  for ((i = 1; i < ${#CH}; i++)); do a=${CH[i]}; b=${CH[i+1]}
    [ "$b" = 2026 ] || [ -f $WQ/seg/${a}_$b/work/stageA.npz -a -f $WQ/seg/${a}_$b/in/events.json ] || zsh $P/prep_seg.sh $a $b > $RUN/prep_seg_${a}_$b.log 2>&1 || { say "prep_seg $a $b FAILED"; exit 1; }
    python3 $P/events.py $WQ/seg/${a}_$b/in > $RUN/events_${a}_$b.log 2>&1   # events with the current rules (cheap)
    python3 $D/tsw.py $a $b | tail -1 | tee -a $RUN/run_area.log
  done
  cp -n $RUN/paint/key_2026.png $RUN/paint/raw_2026.png 2>/dev/null || true
  KEYS="${CH}" PAINT=$RUN/paint zsh $P/final_all.sh 2>&1 | grep -E "==|done|rror" | cut -c1-140
  cd $P && KEYS="${CH}" T=${T:-16} PAR=2 GRADE=1 TSW_DIR=$WQ/tsw OUT=$RUN/films zsh film.sh $NAME 2>&1 | grep -E "film|keycheck|done|FAIL|rror" | cut -c1-160
  say "film $RUN/films/$NAME.mp4" ;;
*) echo "unknown step $STEP"; exit 1 ;;
esac
