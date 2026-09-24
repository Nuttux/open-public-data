#!/bin/bash
# ckpt.sh <name> — ONE whole-city checkpoint, on demand (main runs it; no cron, no loop):
#   1. snapshot at HEAD (mksnap.sh, the present pass's switches ROOFS=1 + roofs_v8)
#   2. render every land frame of level 7 on NPODS RunPod 48 GB GPUs in parallel (run.sh: each pod is terminated at
#      the end, its watchdog stops it at max hours, cost logged in COSTS.md); the 8 open-sea frames (land_frames.txt) are
#      not rendered and are filled from the previous checkpoint, else from pass 0924_0735
#   3. grade + cut the tile pyramid LOCALLY (tiles_build.py, no --upload: no GCS egress)
#   4. refresh the local viewer (viewer.sh) and print its URL
# env: NPODS (pods in parallel, default 3) · PAR (frames at once per pod, default 3; pod_render lowers it to what the
# container RAM holds, ~27 GB a frame) · ALL=1 renders the sea frames too · SPF (s of pod time per frame at PAR 1 for
# the watchdog budget, default 200) · FRAMES="i:j …" to override the list (tests)
set -u
NAME=$1; shift; for a_ in "$@"; do case "$a_" in [A-Z]*=*) export "$a_";; esac; done   # settings also as arguments: ckpt.sh <name> ALL=1 PAR=2
W=/Users/daniel/code/qipu-render-work; C=$W/cloud; REPO=/Users/daniel/code/opd-render
B=$REPO/website/scripts/blender; SN=ckpt_$NAME; O=$C/ckpt_$NAME
python3 $C/pod.py total >/dev/null || { echo "HARD STOP: COSTS.md total reached \$15"; exit 3; }
[ -e $O ] && { echo "$O exists"; exit 1; }
mkdir -p $O/frames
[ -d $W/snap/$SN ] || sh $W/mksnap.sh $REPO HEAD $SN ROOFS=1 ROOFS_FILE=$W/snap/$SN/data/roofs/roofs_v8.json | tail -1
[ -s $W/snap/$SN/LIVE_PATHS.txt ] && { echo "snapshot has live paths:"; cat $W/snap/$SN/LIVE_PATHS.txt; exit 1; }
cat $W/snap/$SN/SNAPSHOT.txt > $O/NOTE.txt.full; head -1 $W/snap/$SN/SNAPSHOT.txt | cut -d' ' -f3-9 > $O/NOTE.txt
if [ -n "${FRAMES:-}" ]; then FR=$FRAMES
elif [ "${ALL:-0}" = 1 ]; then FR=$(for j in 0 1 2 3 4 5 6 7; do for i in 0 1 2 3 4 5 6 7; do printf "$i:$j "; done; done)
else FR=$(cat $C/land_frames.txt); fi
n=$(echo $FR | wc -w | tr -d ' '); PAR=${PAR:-3}; NP=${NPODS:-3}; [ $NP -gt $n ] && NP=$n
per=$(( (n + NP - 1) / NP ))
MAXH=$(python3 -c "print(round(0.5 + $per * ${SPF:-200} / 3600 / min($PAR, 2) * 1.3, 2))")   # budget as if PAR 2 (an A40 holds only 1)
echo "$(date +%H:%M) checkpoint $NAME: $n frames on $NP pods x PAR $PAR, pod budget $MAXH h each"
bash $C/bundle.sh lists $SN; bash $C/bundle.sh pack $SN | tail -1        # one pack for every pod
k=0; for p in $(seq 0 $((NP - 1))); do
  G=$(echo $FR | tr ' ' '\n' | awk -v np=$NP -v p=$p 'NR % np == p' | tr '\n' ' ')   # interleaved: each pod gets land and sea
  POD_RAM=${POD_RAM:-80} bash $C/run.sh ${SN}_p$p $SN $MAXH $O/pod_$p $PAR $G > $O/pod_$p.out 2>&1 &
  sleep 20                                          # staggered: creates don't race, uploads don't all start at once
done
wait
for p in $(seq 0 $((NP - 1))); do mv $O/pod_$p/f_z7_*.png $O/frames/ 2>/dev/null; grep -hE "RENDER_DONE|run \$|abort|fail" $O/pod_$p/run.log | sed "s/^/pod $p: /"; done
got=$(ls $O/frames/f_z7_*.png 2>/dev/null | wc -l | tr -d ' ')
echo "$(date +%H:%M) $got/$n frames back"
[ "$got" = 0 ] && exit 1
# the sea frames not rendered: from the previous checkpoint that has them, else from pass 0924_0735
PREV=$(ls -td $C/ckpt_*/frames 2>/dev/null | grep -v "ckpt_$NAME/" | head -1)
FILL=${PREV:+$PREV,}$W/pyramid/z7_present_0924_0735
( cd $W && nice -n 10 python3 $B/tiles_build.py $O/frames,$FILL $O/tiles ) > $O/tiles.log 2>&1
tail -2 $O/tiles.log
echo "frames: $got rendered, $(( 64 - got )) filled from ${FILL}" >> $O/NOTE.txt.full
bash $C/viewer.sh
python3 $C/pod.py total
