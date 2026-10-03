#!/bin/zsh
# era_auto AI: one Vast 5090 card per key year (gpu.py; RunPod fallback), window dirs <RUN>/aiv_<Y> (keys.py ai), FIX-v6 nf9 nfC, shared L8 per year.
# v7 seeds, FIX-v6 nf9 nfC, shared L8 per year). Tiles pulled every 5 min while the card works (RUN_LESSONS 18) and at the end,
# then copied to tiles_new/y<Y>/. Cards DOWN when done (and on EXIT).   usage: zsh auto_ai.sh <RUN dir> <label tag, new per retry> <Y> [<Y> ...]
set -u
W=/Users/daniel/code/qipu-render-work; H=$1; shift; B=$W/combo/block52; MH=${MH:-1.2}; TAG=$1; shift; YS=($@)
exec > >(tee -a $H/ai_$TAG.log) 2>&1
cd $W
say() { echo "$(date +%H:%M:%S) [auto_ai $TAG] $*"; }
down_all() { for YW in $YS; do c=${TAG}$YW; [ -f $W/speed/gpus/$c.json ] && python3 speed/gpu.py down $c "block52 quarter history v2 AI y$Y (exit trap)" 2>&1 | tail -1; done; say "cards down"; }
trap down_all EXIT
# (30/09 22:45) pulls from the cards crawl (58 KB/s, resets; 170 KB/s with IPQoS=none): pull OFTEN, with IPQoS=none and --partial, and never bring a
# card down while tiles of its P.txt are missing (up to PULLMAX s, default 1800, then SHORT and down: cost guard)
pullq() { read IP_ PORT_ < speed/addr_$1; timeout 300 rsync -a --partial-dir=.rsync-partial --exclude 'l8*' --exclude '.rsync-partial' -e "ssh -p $PORT_ -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o IPQoS=none -o ServerAliveInterval=15 -o ConnectTimeout=15" root@$IP_:/root/lr/out/$2/ $3/ > /dev/null 2>&1; }
miss() { python3 -c "
import sys, os; P, T, Y = sys.argv[1:4]
ks = [l.split()[0][3:].replace(',', '_') for l in open(P) if l.startswith('C9:')]
print(sum(1 for k in ks if not (os.path.exists(f'{T}/y{Y}_{k}.jpg') or os.path.exists(f'{T}/y{Y}/{k}.jpg'))))" $1 $2 $3; }
one() { YW=$1; Y=${YW%%[a-z]*}; c=${TAG}$YW; d=$H/aiv_$YW; n=$(python3 -c "import json; print(json.load(open('$d/SL8.json'))['out'])"); T=$H/tiles_raw/$n; mkdir -p $T   # (30/09 22:10) the window's own output name (was QV<label><Y>: never matched, 0/176)
  START=0 FP8=3 python3 speed/gpu.py up $c $MH > $H/gpu_$c.log 2>&1; [ -f speed/addr_$c ] || { say "$c no pod (did not come up)"; tail -3 $H/gpu_$c.log; return 1; }
  say "$c up $(tail -1 $H/gpu_$c.log | cut -c1-80)"
  bash $B/run_b8.sh $c $d $n up || { say "$c upload failed"; python3 speed/gpu.py down $c "qh v2 AI upload failed" | tail -1; return 1; }
  ( while sleep 120; do pullq $c $n $T; done ) & PL=$!
  timeout $(( ${MH%.*} * 3600 + 2400 )) bash $B/run_b8.sh $c $d $n wait; rc=$?; pkill -P $PL 2>/dev/null; kill $PL 2>/dev/null; sleep 3
  NT=$(grep -c '^C9:' $d/P.txt)   # final pull, verified (13:40: qv2026's final rsync failed silently and 55 tiles went down with the card)
  t0=$(date +%s); while :; do pullq $c $n $T; m=$(miss $d/P.txt $T $Y); [ "$m" = 0 ] && break
    [ $(( $(date +%s) - t0 )) -gt ${PULLMAX:-1800} ] && { say "$c SHORT after ${PULLMAX:-1800} s: $m of $NT tiles not pulled (card goes down: cost guard)"; break; }
    say "$c pull: $m of $NT tiles still missing, again"; sleep 20; done
  read IP PORT < speed/addr_$c; mkdir -p $H/l8/$n
  scp -q -P $PORT -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR "root@$IP:/root/lr/out/$n/l8_*" "root@$IP:/root/$n/log_$n.txt" $H/l8/$n/ 2>/dev/null || say "WARN: L8/log not pulled ($c)"
  python3 speed/gpu.py down $c "block52 quarter history v2 AI y$Y $(grep -c '^C9:' $d/P.txt) tiles" 2>&1 | tail -1
  mkdir -p $H/tiles_new/y$Y; for f in $T/y${Y}_*.jpg(N) $T/y$Y/*.jpg(N); do b=${f:t}; cp $f $H/tiles_new/y$Y/${b#y${Y}_}; done
  python3 -c "
import glob, os, sys
from PIL import Image
for f in glob.glob(sys.argv[1] + '/*.jpg'):
    try: Image.open(f).load()
    except Exception: os.remove(f); print('removed truncated', f)" $H/tiles_new/y$Y
  [ $(ls $H/tiles_new/y$Y | wc -l) -ge $(grep -c "^C9:" $d/P.txt) ] || say "$c SHORT: tiles_new/y$Y has fewer tiles than P.txt"
  say "$c done rc=$rc $(ls $H/tiles_new/y$Y | wc -l | tr -d ' ')/$(grep -c '^C9:' $d/P.txt)"; }
for Y in $YS; do one $Y & sleep 15; done
wait
down_all; trap - EXIT
say "DONE aiv $TAG: $(for Y in $YS; do echo -n "y$Y=$(ls $H/tiles_new/y$Y 2>/dev/null | wc -l | tr -d ' ') "; done)"
