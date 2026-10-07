#!/bin/zsh
# (city_run/block/ai_q.sh: BLK_DIR, BLK_TAG, BLK_CKPT; SF defaults = work_b14/ai_q.sh of 03/10; post/autoreroll from this branch's city_run/run)
# b8v2 after the render (30/09 night, b8 fix agent): check + mosaic + AI windows (v8_rail5 on rail tiles) -> the shared L8 on ONE Vast card
# -> all tiles on K cards (autoreroll_card.py = rrq.py chunk queue, key nfC = a normal paint, tiles pulled every 30 s, card down in finally)
# -> registry -> autoreroll auto (detect + up to 2 re-roll rounds) -> post (QUAY_LIP = city.json block.quay_lip, default 1 = SF; ROOF_RN_SEAM=1, exp/combo post_sb) -> publish block_b14.
#   zsh ai_q.sh [--from N] [K=6]      log: logs/ai_q.log (STEP / ABORT / AI_Q_DONE)
set -u
HERE=${0:A:h}; V=${BLK_DIR:?BLK_DIR = the block work dir}; TAG=${BLK_TAG:-${${V:t}#work_}}   # (city_run/block) the block line for any city: CITY unset = SF
eval "$(cd $HERE/.. && python3 -c 'import citycfg as C; print("CITY_SF=%d BLK_SNAP_DEF=%s BLK_OVL_DEF=%s PIER_CTX=%d QUAY_LIP=%d" % (C.SF, C.BLOCK["snapshot"], C.BLOCK["overlay"] or "-", C.BLOCK["pier_ctx"], int(C.BLOCK.get("quay_lip", 1))))')"
W=/Users/daniel/code/qipu-render-work; B=$HERE; CK=${BLK_CKPT:-block_$TAG}
RUN=${BLK_RUN:-${HERE:h}/run}
L8W=${BLK_L8W:-$V/ai_l8}; L8D=${BLK_L8D:-$V/l8}   # (step2) default = the block's L8 window / dir
FROM=1; [ "${1:-}" = --from ] && { FROM=$2; shift 2; }; K=${1:-8}
LOG=$V/logs/ai_q.log; say() { echo "$(date +%H:%M:%S) $*" >> $LOG; }
abort() { say "ABORT: $*"; exit 1; }
export VAST_MAXTB=4 MAX_VAST=${MAX_VAST:-10} PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
export RR_CARD_H=${RR_CARD_H:-1.8}   # tile cards: ~336 tiles x 10.6 s = 1 h on a 5090, x1.5 on a 4090 fallback (RUN_LESSONS 2, 18)
L8L=${TAG}L$(date +%H%M)
trap '[ -f $W/speed/gpus/$L8L.json ] && python3 $W/speed/gpu.py down $L8L "b8v2 L8 (exit trap)" >> $LOG 2>&1; say "EXIT trap ran"' EXIT
cd $W
SSHO=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ConnectTimeout=20)
if [ $FROM -le 1 ]; then
  say "STEP 1 check + mosaic + prep + estimate"
  BLK_DIR=$V python3 $HERE/b8.py check >> $LOG 2>&1 || abort "render outputs missing"
  BLK_DIR=$V python3 $HERE/b8.py mosaic >> $LOG 2>&1 || abort "mosaic"
  BLK_DIR=$V python3 $HERE/b8.py prep >> $LOG 2>&1 || abort "prep"
  BLK_DIR=$V python3 $HERE/b8.py estimate >> $LOG 2>&1
  [ $PIER_CTX = 0 ] || python3 $HERE/pier_ctx.py $V/ai/R_b8.jpg $V/ai/R_b8.json $V/ai/C_b8.png >> $LOG 2>&1 || abort "pier_ctx"   # Piers 15/17 court: lawn -> concrete in the AI's input
  # ai_all = half a's window with the WHOLE tile list (tile cards + autoreroll scan every tile)
  mkdir -p $V/ai_all; for f in $V/ai_a/*; do [ "${f:t}" = P.txt ] || [ "${f:t}" = SL8.json ] || ln -f $f $V/ai_all/ 2>/dev/null; done
  cp $V/ai_a/SL8.json $V/ai_all/; { echo '#MOSAIC b8'; grep '^C9:' $V/ai/P.txt; } > $V/ai_all/P.txt
  ln -f $V/ai/C_b8.png $V/ai_all/C_b8.png 2>/dev/null
fi
if [ $FROM -le 2 ] && [ ! -s $L8D/l8_b8.jpg ]; then
  say "STEP 2 L8 card $L8L (balance: $(python3 speed/vast/vast.py credit 2>&1 | tail -1))"
  START=0 FP8=3 python3 speed/gpu.py up $L8L 3.5 > $V/logs/gpu_$L8L.log 2>&1; [ -f speed/addr_$L8L ] || abort "L8 card did not come up ($(tail -1 $V/logs/gpu_$L8L.log))"
  say "L8 card: $(grep READY $V/logs/gpu_$L8L.log | tail -1 | cut -c1-160)"
  read IP PORT < speed/addr_$L8L
  python3 speed/stage.py put ai_B9L $IP $PORT /root/B8L $L8W/* >> $LOG 2>&1
  n=$(ssh -p $PORT $SSHO root@$IP "ls /root/B8L | wc -l"); [ "$n" -ge 8 ] || { rsync -a -e "ssh -p $PORT ${SSHO[*]}" $L8W/ root@$IP:/root/B8L/; n=$(ssh -p $PORT $SSHO root@$IP "ls /root/B8L | wc -l"); }
  [ "$n" -ge 8 ] || abort "L8 window upload incomplete ($n files)"
  FP8=$(python3 -c "import json; print(json.load(open('speed/gpus/$L8L.json')).get('fp8', '3'))")
  ssh -p $PORT $SSHO root@$IP "mkdir -p /root/lr/out; cd /root/B8L; FP8=$FP8 PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True HF_HOME=/root/hf HF_HUB_OFFLINE=1 nohup /usr/local/bin/python -u run_pyv.py sl8v.py /root/B8L > /root/B8L/run.out 2>&1 < /dev/null &"
  say "L8 runner started (FP8=$FP8)"; t0=$(date +%s)
  while :; do
    r=$(ssh -p $PORT $SSHO root@$IP "ls /root/lr/out/B8L/l8_b8.jpg 2>/dev/null | wc -l; pgrep -f '[s]l8v.py' >/dev/null && echo run || echo stop; nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits | head -1; tail -c 400 /root/B8L/run.out | grep -cE 'Traceback|Error'" 2>/dev/null | tr '\n' ' ')
    set -- ${=r}
    [ "${1:-0}" -ge 1 ] && [ "${2:-run}" = stop ] && break
    [ "${2:-run}" = stop ] && abort "L8 runner stopped without l8_b8.jpg: $(ssh -p $PORT $SSHO root@$IP 'tail -3 /root/B8L/run.out' | tr '\n' ' ' | cut -c1-300)"
    [ $(( ($(date +%s) - t0) % 600 )) -lt 60 ] && say "L8 running $(( ($(date +%s) - t0) / 60 )) min, gpu ${3:-?} %"
    [ $(( $(date +%s) - t0 )) -gt 12000 ] && abort "L8 over 200 min"
    sleep 60
  done
  mkdir -p $L8D; scp -q -P $PORT $SSHO "root@$IP:/root/lr/out/B8L/l8_b8.*" $L8D/ || abort "L8 not pulled"
  python3 speed/gpu.py down $L8L "$TAG shared L8 ($CITY_SF: 1 = SF)" >> $LOG 2>&1
  say "L8 pulled ($(ls -la $L8D/l8_b8.jpg | awk '{print $5}') bytes) in $(( ($(date +%s) - t0) / 60 )) min; card down"
fi
[ -n "${L8_ONLY:-}" ] && { say "L8_ONLY: $L8D/l8_b8.jpg done"; exit 0; }   # (step2) a partial L8 refresh (BLK_L8W = a window with only some tiles; sl8v skips unused anchors)
[ -s $V/l8/l8_b8.jpg ] || abort "no L8"
ORG=$(python3 -c "import json; print(','.join(map(str, json.load(open('$V/l8_origin.json'))['origin_anchor'])))")
if [ $FROM -le 3 ]; then
  say "STEP 3 tiles on $K cards"
  python3 - $V $K <<'PY'
import sys, os, glob
V, K = sys.argv[1], int(sys.argv[2]); T = [l for l in open(f'{V}/ai/P.txt') if l.startswith('C9:')]
for k in range(K):
    D = f'{V}/tq/g{k}'; os.makedirs(D, exist_ok=True); [os.remove(f) for f in glob.glob(f'{D}/c_*.txt')]
    part = T[k::K]
    for c in range(0, len(part), 40): open(f'{D}/c_{c // 40:03d}.txt', 'w').write('#OUT RR0 nfC\n#MOSAIC b8\n' + ''.join(part[c:c + 40]))
print('groups', K, 'tiles', len(T))
PY
  cp $V/l8/l8_b8.jpg $V/ai_all/l8_b8.jpg
  HM=$(date +%H%M)
  for k in $(seq 0 $((K - 1))); do
    [ -d $V/tq/g$k/out/RR0 ] && [ $(ls $V/tq/g$k/out/RR0 | wc -l) -ge $(cat $V/tq/g$k/c_*.txt | grep -c '^C9:') ] && continue
    python3 $RUN/autoreroll_card.py ${TAG}t$k$HM $V/ai_all $V/ai_all/l8_b8.jpg $ORG $V/tq/g$k 200 > $V/tq/g$k/card.log 2>&1 &
    sleep 15
  done
  wait
  for k in $(seq 0 $((K - 1))); do say "group $k: $(grep -E 'ALL_DONE|ABORT' $V/tq/g$k/card.log | tail -1 | cut -c1-200)"; done
  mkdir -p $V/tiles_a; for k in $(seq 0 $((K - 1))); do cp -n $V/tq/g$k/out/RR0/*.jpg $V/tiles_a/ 2>/dev/null; done
fi
NT=$(grep -c '^C9:' $V/ai/P.txt); ND=$(ls $V/tiles_a | grep -c '^[0-9]')
[ $ND -ge $NT ] || [ $((NT - ND)) -le ${ALLOW_MISSING:-0} ] || abort "AI tiles missing: $ND of $NT (resume --from 3: finished groups are skipped)"
[ $ND -ge $NT ] || { say "WARN: $((NT - ND)) AI tiles missing, the post uses the render there (FALLBACK_RENDER=1)"; export FALLBACK_RENDER=1; }
if [ $FROM -le 4 ]; then
  say "STEP 4 registry + autoreroll auto"
  BLK_DIR=$V python3 $HERE/b8.py registry >> $LOG 2>&1 || abort "registry"
  ( cd $RUN && python3 autoreroll.py auto $V/ai_all $V/city/tiles $V/ai_all/l8_b8.jpg $ORG ${TAG}rr$(date +%H%M) ) > $V/logs/autoreroll.log 2>&1
  say "autoreroll: $(grep -E '^SCAN|^PICK|flagged tiles|CARD FAILED' $V/logs/autoreroll.log | tr '\n' ' ' | cut -c1-400)"
fi
if [ $FROM -le 5 ]; then
  say "STEP 5 post (QUAY_LIP=$QUAY_LIP ROOF_RN_SEAM=1)"
  rm -f $V/city/sb/b8/final/f_*.done
  ( cd $RUN && CITY_ROOT=$V/city QUAY_LIP=$QUAY_LIP ROOF_RN_SEAM=1 ROOF_FLAT_TONE=1 python3 post_sb.py b8 quilt,finish ) > $V/logs/post.log 2>&1
  NB_=$(python3 -c "import json; q=json.load(open('$V/block.json'))['Q']; print(-(-(q[3]-q[1]) // 1536))")   # (vf1 05/10) every band, not just one: post_sb can stop silently (b22, vp1b)
  ND_=$(ls $V/city/sb/b8/final/f_*.done 2>/dev/null | wc -l | tr -d ' ')
  [ -n "$NB_" ] && [ "$ND_" -ge "$NB_" ] && [ -d $V/city/layer/tiles/9 ] || abort "post incomplete: $ND_ of $NB_ bands (logs/post.log)"
fi
if [ $FROM -le 6 ]; then
  say "STEP 6 publish $CK"
  B8_CKPT=$CK BLK_DIR=$V python3 $HERE/b8.py publish >> $LOG 2>&1 || abort "publish"
fi
say "AI_Q_DONE"
