#!/bin/zsh
# (city_run/block/render_q.sh: BLK_DIR, BLK_TAG, BLK_SNAP; SF defaults = work_b14/render_q.sh of 03/10)
# b14 render (02/10, b14 GG Park; copied from b10): the 98 jobs (49 crops x beauty + passes) on snapshot combo7 (combo6 + every b8 fix switch +
# the Embarcadero footbridge decks), on N RunPod pods sharing ONE job queue (q/todo -> q/done | q/fail):
#   - each pod claims 2 jobs (PAR 2) if its GPU has >= 40 GB, else 1 job (PAR 1: 24 GB cards crash at PAR 2, RUN_LESSONS 1)
#   - every job is fetched as soon as it ends (render_b8.sh per claim, RUN_LESSONS 4); a missing output -> requeued once, then q/fail
#   - a pod with 3 failed jobs goes down (bad host); a pod goes down as soon as the queue is empty (never idles, RUN_LESSONS 3)
#   - every 10 min: GPU utilisation of each pod in the log (RUN_LESSONS 23)
#   zsh render_q.sh <npods> <watchdog h> [label prefix=b8v2r]       log: logs/render_q.log (POD_DOWN / ABORT / RENDER_Q_DONE)
set -u
HERE=${0:A:h}; V=${BLK_DIR:?BLK_DIR = the block work dir}; TAG=${BLK_TAG:-${${V:t}#work_}}   # (city_run/block) the block line for any city: CITY unset = SF
eval "$(cd $HERE/.. && python3 -c 'import citycfg as C; print("CITY_SF=%d BLK_SNAP_DEF=%s BLK_OVL_DEF=%s PIER_CTX=%d" % (C.SF, C.BLOCK["snapshot"], C.BLOCK["overlay"] or "-", C.BLOCK["pier_ctx"]))')"
W=/Users/daniel/code/qipu-render-work; SN=${BLK_SNAP:-$BLK_SNAP_DEF}
NP=$1; H=$2; PFX=${3:-${TAG}r}; LOG=$V/logs/render_q.log
export FETCH_EACH=1   # (03/10) per-job fetch (render_b8.sh FETCH_EACH, era i16r2); HOSTS_BAD_PREFIX dropped (A40 stock is in 194.68.245.x)
export MAXPRICE=${MAXPRICE:-0.85} LMK_GPUS="${LMK_GPUS:-NVIDIA A40,NVIDIA RTX A6000,NVIDIA RTX A5000,NVIDIA GeForce RTX 4090}"   # no 3090s (RUN_LESSONS 30/09)
say() { echo "$(date +%H:%M:%S) $*" >> $LOG; }
cd $W
SSHO=(-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ConnectTimeout=20)
if [ -z "$(ls $V/q/todo $V/q/done $V/q/fail 2>/dev/null | grep txt)" ]; then   # first start: fill the queue (beauty + passes of a crop next to each other)
  n=0; while read -r l; do [ -n "$l" ] || continue; n=$((n + 1)); lab=${l%% *}; echo "$l" > $V/q/todo/$(printf %03d $n)_$lab.txt; done < $V/jobs_order.txt
fi
ok_out() { local lab=$1 i j; i=$(echo $lab | cut -d_ -f2); j=$(echo $lab | cut -d_ -f3); local b=$V/render/${lab}_z9_${i}_${j}
  case $lab in b8b_*) [ -s $b.jpg ];; *) [ -s $b.class.png ] && [ -s $b.mask.png ] && [ -s $b.gid.png ] && [ -s $b.part.png ];; esac; }
worker() {
  local P=$1 fails=0 PARn=1; mkdir -p $V/q/doing_$P
  bash cloud/lmk_pod.sh $P up $SN $H > $V/logs/pod_$P.log 2>&1
  if [ ! -f cloud/state/lmk_$P/env ]; then say "$P ABORT_POD: no pod ($(tail -1 $V/logs/pod_$P.log))"; return; fi
  if grep -qE "upload incomplete|no OptiX" $V/logs/pod_$P.log; then say "$P ABORT_POD: setup incomplete"; bash cloud/lmk_pod.sh $P down "$TAG render (setup failed)" >> $LOG 2>&1; say "$P POD_DOWN"; return; fi
  . cloud/state/lmk_$P/env
  local vr=$(ssh -p $PORT $SSHO root@$IP "nvidia-smi --query-gpu=memory.total,name --format=csv,noheader,nounits" 2>/dev/null | head -1)
  [ "${vr%%,*}" -ge 40000 ] 2>/dev/null && PARn=2
  say "$P READY ($vr) PAR $PARn"
  [ -f $V/overlay.txt ] || { [ "$BLK_OVL_DEF" = - ] || ls $BLK_OVL_DEF/*.py; } > $V/overlay.txt   # default: the block overlay (LAKE_CLEAR2, pl_copper); an EMPTY overlay.txt = none
  if [ -s $V/overlay.txt ]; then   # (b14 fix) overlay files (one source path per line) copied into the pod's $SN snapshot dir, md5-checked
    local sd=$(ssh -p $PORT $SSHO root@$IP "dirname \$(find /root/q/qw -path "*$SN*" -name water_hq.py | head -1)") okov=1
    for f in $(cat $V/overlay.txt); do scp -q -P $PORT $SSHO $f root@$IP:$sd/${f:t} || okov=0
      [ "$(ssh -p $PORT $SSHO root@$IP "md5sum $sd/${f:t}" | cut -d' ' -f1)" = "$(md5 -q $f)" ] || okov=0; done
    if [ -n "$sd" ] && [ $okov = 1 ]; then say "$P overlay on $sd: $(cat $V/overlay.txt | xargs -n1 basename | tr '\n' ' ')"
    else say "$P ABORT_POD: overlay not installed ($sd)"; bash cloud/lmk_pod.sh $P down "$TAG fix render (overlay failed)" >> $LOG 2>&1; say "$P POD_DOWN"; return; fi
  fi
  if grep -q 'VIC_SAT=' $V/jobs_order.txt; then   # (b10) Victorian colour fix: the overlay gen_buildings.py (combo7 + 1 line, a no-op without VIC_SAT) onto the pod's snapshot
    local gb=$(ssh -p $PORT $SSHO root@$IP "find /root/q/qw -path "*$SN*" -name gen_buildings.py | head -1")
    scp -q -P $PORT $SSHO $W/combo/vicsat_overlay/gen_buildings.py root@$IP:$gb
    if [ -n "$gb" ] && ssh -p $PORT $SSHO root@$IP "grep -q VIC_SAT $gb"; then say "$P VIC_SAT overlay on $gb"
    else say "$P ABORT_POD: VIC_SAT overlay not installed ($gb)"; bash cloud/lmk_pod.sh $P down "$TAG render (overlay failed)" >> $LOG 2>&1; say "$P POD_DOWN"; return; fi
  fi
  while :; do
    local got=() f
    for f in $V/q/todo/*.txt(N); do mv $f $V/q/doing_$P/ 2>/dev/null && got+=(${f:t}); [ ${#got} -ge $PARn ] && break; done
    [ ${#got} -eq 0 ] && break
    cat $V/q/doing_$P/*.txt > $V/q/cur_$P.txt
    local t0=$(date +%s)
    PAR=$PARn bash $HERE/render_b8.sh $P $SN $V/q/cur_$P.txt $V/render 'b8[bp]_*' >> $V/logs/render_$P.log 2>&1
    for f in $got; do local lab=$(cut -d' ' -f1 $V/q/doing_$P/$f)
      if ok_out $lab; then mv $V/q/doing_$P/$f $V/q/done/; say "$P job $lab OK ($(( $(date +%s) - t0 )) s)"
      else fails=$((fails + 1)); grep -l Traceback $V/render/$lab.log >/dev/null 2>&1 && say "$P job $lab Traceback: $(grep -m1 -A0 Error $V/render/$lab.log | cut -c1-160)"
        if [[ $f == *.r1.txt ]]; then mv $V/q/doing_$P/$f $V/q/fail/; say "$P job $lab FAILED twice"
        else mv $V/q/doing_$P/$f $V/q/todo/${f%.txt}.r1.txt; say "$P job $lab MISSING, requeued"; fi; fi
    done
    [ $fails -ge 3 ] && { say "$P ABORT_POD: 3 failed jobs (bad host?)"; break; }
  done
  bash cloud/lmk_pod.sh $P down "$TAG render ($SN, queue)" >> $LOG 2>&1; say "$P POD_DOWN"
}
PODS=(); for k in $(seq 1 $NP); do PODS+=($PFX$k); done
trap 'for p in $PODS; do [ -f cloud/state/lmk_$p/env ] && bash cloud/lmk_pod.sh $p down "$TAG render (exit trap)" >> $LOG 2>&1; done; say "EXIT trap ran"' EXIT
say "start: $NP pods ($PODS), watchdog $H h, $(ls $V/q/todo | wc -l | tr -d ' ') jobs queued, GPUs: $LMK_GPUS"
WP=(); for p in $PODS; do worker $p & WP+=($!); sleep 20; done
( while sleep 600; do for p in $PODS; do [ -f cloud/state/lmk_$p/env ] || continue; . cloud/state/lmk_$p/env
    say "$p gpu $(ssh -p $PORT $SSHO root@$IP 'nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader' 2>/dev/null | head -1) done $(ls $V/q/done | wc -l | tr -d ' ') todo $(ls $V/q/todo | wc -l | tr -d ' ')"; done; done ) &
MON=$!
for w in $WP; do wait $w; done
kill $MON 2>/dev/null
say "RENDER_Q_DONE done $(ls $V/q/done | wc -l | tr -d ' ') todo $(ls $V/q/todo | wc -l | tr -d ' ') fail $(ls $V/q/fail | wc -l | tr -d ' '); $(BLK_DIR=$V python3 $HERE/b8.py check 2>&1 | tail -1)"
